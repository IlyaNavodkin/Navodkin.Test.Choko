use std::{
    env, fs,
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

use super::{MAX_GIT_OUTPUT_BYTES, RepositoryError, RepositoryErrorCode};
const GIT_TIMEOUT: Duration = Duration::from_secs(5);

pub(super) fn find_git_executable(repository_root: &Path) -> Result<PathBuf, RepositoryError> {
    let path = env::var_os("PATH").ok_or_else(|| {
        RepositoryError::new(
            RepositoryErrorCode::GitUnavailable,
            "PATH не содержит путь к системному Git.",
        )
    })?;
    let current_directory = env::current_dir()
        .ok()
        .and_then(|path| fs::canonicalize(path).ok());
    for directory in env::split_paths(&path) {
        if !directory.is_absolute() {
            continue;
        }
        #[cfg(windows)]
        let candidate = directory.join("git.exe");
        #[cfg(not(windows))]
        let candidate = directory.join("git");
        if candidate.is_file() {
            let canonical = fs::canonicalize(candidate).map_err(|error| {
                RepositoryError::new(
                    RepositoryErrorCode::GitUnavailable,
                    format!("Не удалось разрешить system Git: {error}"),
                )
            })?;
            if !candidate_is_allowed(&canonical, repository_root, current_directory.as_deref()) {
                continue;
            }
            return Ok(canonical);
        }
    }
    Err(RepositoryError::new(
        RepositoryErrorCode::GitUnavailable,
        "Не найден system Git в абсолютных каталогах PATH.",
    ))
}

fn candidate_is_allowed(candidate: &Path, repository_root: &Path, cwd: Option<&Path>) -> bool {
    !candidate.starts_with(repository_root)
        && cwd.is_none_or(|directory| candidate.parent() != Some(directory))
}

pub(super) fn run_git(
    executable: &Path,
    cwd: &Path,
    args: &[&str],
) -> Result<String, RepositoryError> {
    run_git_bounded(
        executable,
        cwd,
        args,
        MAX_GIT_OUTPUT_BYTES,
        false,
        RepositoryErrorCode::NotGitRepository,
        None,
    )
}

pub(super) fn inspect_git(
    executable: &Path,
    cwd: &Path,
    args: &[&str],
    limit: usize,
    allow_one: bool,
) -> Result<String, RepositoryError> {
    run_git_bounded(
        executable,
        cwd,
        args,
        limit,
        allow_one,
        RepositoryErrorCode::GitFailed,
        None,
    )
}
fn run_git_bounded(
    executable: &Path,
    cwd: &Path,
    args: &[&str],
    limit: usize,
    allow_one: bool,
    failure_code: RepositoryErrorCode,
    index: Option<&Path>,
) -> Result<String, RepositoryError> {
    let mut command = Command::new(executable);
    command
        .arg("--no-pager")
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // Win32 CREATE_NO_WINDOW (0x08000000): a read-only Git probe must not flash a console.
        command.creation_flags(0x0800_0000);
    }
    for (key, _) in env::vars_os() {
        if key
            .to_string_lossy()
            .to_ascii_uppercase()
            .starts_with("GIT_")
        {
            command.env_remove(key);
        }
    }
    if let Some(index) = index {
        command.env("GIT_INDEX_FILE", index.strip_prefix(cwd).unwrap_or(index));
    }
    command.env("GIT_OPTIONAL_LOCKS", "0");
    // These helpers perform local read-only inspection, including in partial clones.
    command
        .env("GIT_NO_LAZY_FETCH", "1")
        .env("GIT_ALLOW_PROTOCOL", "")
        .env("GIT_TERMINAL_PROMPT", "0");
    let mut child = command.spawn().map_err(|error| {
        RepositoryError::new(
            RepositoryErrorCode::GitUnavailable,
            format!("Не удалось запустить system Git: {error}"),
        )
    })?;
    let stdout = child.stdout.take().ok_or_else(|| {
        RepositoryError::new(RepositoryErrorCode::GitFailed, "Git stdout недоступен.")
    })?;
    let stderr = child.stderr.take().ok_or_else(|| {
        RepositoryError::new(RepositoryErrorCode::GitFailed, "Git stderr недоступен.")
    })?;
    let stdout_reader = thread::spawn(move || read_stream(stdout, limit));
    let stderr_reader = thread::spawn(move || read_stream(stderr, limit));
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|error| {
            RepositoryError::new(
                RepositoryErrorCode::GitFailed,
                format!("Не удалось проверить system Git: {error}"),
            )
        })? {
            break status;
        }
        if started.elapsed() >= GIT_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err(RepositoryError::new(
                RepositoryErrorCode::GitTimedOut,
                "Проверка Git превысила лимит времени.",
            ));
        }
        thread::sleep(Duration::from_millis(10));
    };
    let stdout = stdout_reader.join().map_err(|_| {
        RepositoryError::new(
            RepositoryErrorCode::GitFailed,
            "Поток чтения Git завершился с ошибкой.",
        )
    })??;
    let stderr = stderr_reader.join().map_err(|_| {
        RepositoryError::new(
            RepositoryErrorCode::GitFailed,
            "Поток чтения Git завершился с ошибкой.",
        )
    })??;
    if !(status.success() || allow_one && status.code() == Some(1)) {
        if stderr.len() > limit || stdout.len() > limit {
            return Err(RepositoryError::new(
                RepositoryErrorCode::GitOutputTooLarge,
                "Git превысил лимит диагностического вывода.",
            ));
        }
        return Err(RepositoryError::new(
            failure_code,
            "Системный Git отклонил операцию.",
        ));
    }
    String::from_utf8(stdout).map_err(|_| {
        RepositoryError::new(
            RepositoryErrorCode::InvalidUtf8,
            "Git вернул не-UTF-8 путь.",
        )
    })
}

fn read_stream(stream: impl Read, limit: usize) -> Result<Vec<u8>, RepositoryError> {
    let mut bytes = Vec::new();
    stream
        .take((limit + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| {
            RepositoryError::new(
                RepositoryErrorCode::GitFailed,
                format!("Не удалось прочитать вывод Git: {error}"),
            )
        })?;
    if bytes.len() > limit {
        return Err(RepositoryError::new(
            RepositoryErrorCode::GitOutputTooLarge,
            "Git превысил лимит диагностического вывода.",
        ));
    }
    Ok(bytes)
}

pub(super) fn with_index(
    executable: &Path,
    cwd: &Path,
    args: &[&str],
    index: &Path,
) -> Result<String, RepositoryError> {
    run_git_bounded(
        executable,
        cwd,
        args,
        MAX_GIT_OUTPUT_BYTES,
        false,
        RepositoryErrorCode::GitFailed,
        Some(index),
    )
}

#[cfg(test)]
mod tests {
    use super::candidate_is_allowed;
    use std::path::Path;

    #[test]
    fn candidate_policy_allows_system_git_below_root_or_normal_cwd() {
        let repo = Path::new("/work/project");
        assert!(!candidate_is_allowed(
            Path::new("/work/project/tools/git"),
            repo,
            Some(Path::new("/"))
        ));
        assert!(candidate_is_allowed(
            Path::new("/usr/bin/git"),
            repo,
            Some(Path::new("/"))
        ));
        assert!(candidate_is_allowed(
            Path::new("/usr/bin/git"),
            repo,
            Some(Path::new("/work"))
        ));
        assert!(!candidate_is_allowed(
            Path::new("/work/git"),
            repo,
            Some(Path::new("/work"))
        ));
    }
}
