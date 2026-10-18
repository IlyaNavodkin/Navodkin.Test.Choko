//! Bounded mutation runner. Output stays native; descendants cannot hold a pipe open.
use super::{MAX_GIT_OUTPUT_BYTES, RepositoryError, RepositoryErrorCode};
use std::{
    env,
    fs::File,
    io::Read,
    path::Path,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

pub(super) struct Outcome {
    pub success: bool,
    pub stdout: String,
    pub diagnostic: String,
}
fn failure(code: RepositoryErrorCode) -> RepositoryError {
    RepositoryError::new(
        code,
        "Git отклонил операцию. Проверьте состояние во внешнем Git.",
    )
}
pub(super) fn execute(
    executable: &Path,
    root: &Path,
    args: &[&str],
    network: bool,
) -> Result<Outcome, RepositoryError> {
    execute_timeout(executable, root, args, network, Duration::from_secs(30))
}
#[allow(clippy::too_many_lines)] // Keep child ownership, containment and cleanup in one audited scope.
fn execute_timeout(
    executable: &Path,
    root: &Path,
    args: &[&str],
    network: bool,
    timeout: Duration,
) -> Result<Outcome, RepositoryError> {
    let mut stdout = tempfile::tempfile().map_err(|_| failure(RepositoryErrorCode::GitFailed))?;
    let mut stderr = tempfile::tempfile().map_err(|_| failure(RepositoryErrorCode::GitFailed))?;
    let mut command = Command::new(executable);
    command
        .arg("--no-pager")
        .args([
            "-c",
            "core.fsmonitor=false",
            "-c",
            "maintenance.auto=false",
            "-c",
            "gc.auto=0",
            "-c",
            "credential.interactive=false",
            "-c",
            "core.askPass=",
            "-c",
            "protocol.ext.allow=never",
        ])
        .args(args)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(
            stdout
                .try_clone()
                .map_err(|_| failure(RepositoryErrorCode::GitFailed))?,
        )
        .stderr(
            stderr
                .try_clone()
                .map_err(|_| failure(RepositoryErrorCode::GitFailed))?,
        );
    for (key, _) in env::vars_os() {
        if key
            .to_string_lossy()
            .to_ascii_uppercase()
            .starts_with("GIT_")
        {
            command.env_remove(key);
        }
    }
    let ssh = if network { system_ssh(root).ok() } else { None };
    command
        .env("GIT_NO_LAZY_FETCH", "1")
        .env(
            "GIT_ALLOW_PROTOCOL",
            if network {
                if ssh.is_some() {
                    "https:http:ssh:git:file"
                } else {
                    "https:http:git:file"
                }
            } else {
                ""
            },
        )
        .env("LC_ALL", "C")
        .env("LANG", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never");
    if let Some(ssh) = ssh {
        let rendered = ssh.to_string_lossy();
        let portable = rendered
            .strip_prefix(r"\\?\")
            .unwrap_or(&rendered)
            .replace('\\', "/");
        let quoted = portable.replace('\'', "'\\''");
        command.env("GIT_SSH_VARIANT", "ssh").env(
            "GIT_SSH_COMMAND",
            format!("'{quoted}' -oBatchMode=yes -oConnectTimeout=15"),
        );
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .spawn()
        .map_err(|_| failure(RepositoryErrorCode::GitUnavailable))?;
    let containment = Containment::attach(&child).map_err(|()| {
        let _ = child.kill();
        let _ = child.wait();
        failure(RepositoryErrorCode::GitSyncBlocked)
    })?;
    let started = Instant::now();
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|_| failure(RepositoryErrorCode::GitFailed))?
        {
            break status;
        }
        if started.elapsed() >= timeout {
            drop(containment);
            let _ = child.kill();
            let _ = child.wait();
            return Err(failure(RepositoryErrorCode::GitTimedOut));
        }
        if stdout
            .metadata()
            .map_or(true, |m| m.len() > MAX_GIT_OUTPUT_BYTES as u64)
            || stderr
                .metadata()
                .map_or(true, |m| m.len() > MAX_GIT_OUTPUT_BYTES as u64)
        {
            drop(containment);
            let _ = child.kill();
            let _ = child.wait();
            return Err(failure(RepositoryErrorCode::GitOutputTooLarge));
        }
        thread::sleep(Duration::from_millis(10));
    };
    drop(containment);
    Ok(Outcome {
        success: status.success(),
        stdout: output(&mut stdout)?,
        diagnostic: output(&mut stderr)?,
    })
}
fn system_ssh(root: &Path) -> Result<std::path::PathBuf, RepositoryError> {
    for directory in env::split_paths(&env::var_os("PATH").unwrap_or_default()) {
        if !directory.is_absolute() {
            continue;
        }
        let name = if cfg!(windows) { "ssh.exe" } else { "ssh" };
        if let Ok(path) = std::fs::canonicalize(directory.join(name))
            && path.is_file()
            && !path.starts_with(root)
        {
            return Ok(path);
        }
    }
    Err(failure(RepositoryErrorCode::GitSyncBlocked))
}
fn output(file: &mut File) -> Result<String, RepositoryError> {
    use std::io::{Seek, SeekFrom};
    file.seek(SeekFrom::Start(0))
        .map_err(|_| failure(RepositoryErrorCode::GitFailed))?;
    let mut bytes = Vec::new();
    file.take((MAX_GIT_OUTPUT_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| failure(RepositoryErrorCode::GitFailed))?;
    if bytes.len() > MAX_GIT_OUTPUT_BYTES {
        return Err(failure(RepositoryErrorCode::GitOutputTooLarge));
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}
pub(super) fn classify(out: &Outcome) -> RepositoryError {
    let diagnostic = out.diagnostic.to_ascii_lowercase();
    let code = if [
        "authentication failed",
        "permission denied",
        "could not read username",
        "terminal prompts disabled",
    ]
    .iter()
    .any(|s| diagnostic.contains(s))
    {
        RepositoryErrorCode::GitAuthFailed
    } else if ["non-fast-forward", "fetch first", "[rejected]"]
        .iter()
        .any(|s| diagnostic.contains(s) || out.stdout.to_ascii_lowercase().contains(s))
    {
        RepositoryErrorCode::GitPushRejected
    } else if [
        "could not resolve",
        "unable to access",
        "connection refused",
        "network is unreachable",
        "connection timed out",
    ]
    .iter()
    .any(|s| diagnostic.contains(s))
    {
        RepositoryErrorCode::GitNetworkFailed
    } else {
        RepositoryErrorCode::GitRemoteFailed
    };
    failure(code)
}
#[cfg(windows)]
#[allow(unsafe_code)]
struct Containment(windows_sys::Win32::Foundation::HANDLE);
#[cfg(windows)]
#[allow(unsafe_code)]
impl Containment {
    fn attach(child: &std::process::Child) -> Result<Self, ()> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::{AssignProcessToJobObject, CreateJobObjectW};
        // SAFETY: null security/name pointers create an unnamed job; the returned owned handle is checked.
        let job = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if job.is_null() {
            return Err(());
        }
        let owned = Self(job);
        // SAFETY: both handles are live throughout this call; the child handle is borrowed.
        if unsafe { AssignProcessToJobObject(job, child.as_raw_handle()) } == 0 {
            return Err(());
        }
        Ok(owned)
    }
}
#[cfg(windows)]
#[allow(unsafe_code)]
impl Drop for Containment {
    fn drop(&mut self) {
        // SAFETY: this wrapper exclusively owns a valid job handle. Termination only affects its Git descendants.
        unsafe {
            windows_sys::Win32::System::JobObjects::TerminateJobObject(self.0, 1);
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}
#[cfg(unix)]
struct Containment(rustix::process::Pid);
#[cfg(unix)]
impl Containment {
    fn attach(child: &std::process::Child) -> Result<Self, ()> {
        rustix::process::Pid::from_raw(i32::try_from(child.id()).map_err(|_| ())?)
            .map(Self)
            .ok_or(())
    }
}
#[cfg(unix)]
impl Drop for Containment {
    fn drop(&mut self) {
        let _ = rustix::process::kill_process_group(self.0, rustix::process::Signal::KILL);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn classifies_controlled_auth_offline_and_rejected_diagnostics_without_leaking_them() {
        for (diagnostic, code) in [
            (
                "fatal: Authentication failed https://user:secret@example.invalid",
                RepositoryErrorCode::GitAuthFailed,
            ),
            (
                "Could not resolve host: example.invalid secret",
                RepositoryErrorCode::GitNetworkFailed,
            ),
            (
                "[rejected] secret (non-fast-forward)",
                RepositoryErrorCode::GitPushRejected,
            ),
        ] {
            let error = classify(&Outcome {
                success: false,
                stdout: String::new(),
                diagnostic: diagnostic.into(),
            });
            assert_eq!(error.code, code);
            assert!(!error.message.contains("secret"));
        }
    }
    #[test]
    fn timeout_terminates_own_git_helper_without_pipe_join() {
        let temp = tempfile::tempdir().unwrap();
        let executable = super::super::git::find_git_executable(temp.path()).unwrap();
        let start = Instant::now();
        let error = execute_timeout(
            &executable,
            temp.path(),
            &[
                "-c",
                "alias.fixture=!sleep 1; echo escaped > timeout-escaped",
                "fixture",
            ],
            true,
            Duration::from_millis(250),
        )
        .err()
        .unwrap();
        assert_eq!(error.code, RepositoryErrorCode::GitTimedOut);
        assert!(start.elapsed() < Duration::from_secs(3));
        thread::sleep(Duration::from_millis(1200));
        assert!(!temp.path().join("timeout-escaped").exists());
    }

    #[test]
    fn local_http_authentication_refusal_and_offline_connection_are_sanitized() {
        use std::{
            io::Write,
            net::TcpListener,
            sync::{
                Arc,
                atomic::{AtomicBool, Ordering},
            },
        };
        let temp = tempfile::tempdir().unwrap();
        let executable = super::super::git::find_git_executable(temp.path()).unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        listener.set_nonblocking(true).unwrap();
        let stopped = Arc::new(AtomicBool::new(false));
        let stop_server = Arc::clone(&stopped);
        let server = thread::spawn(move || {
            let started = Instant::now();
            while !stop_server.load(Ordering::Relaxed) && started.elapsed() < Duration::from_secs(5)
            {
                if let Ok((mut stream, _)) = listener.accept() {
                    stream
                        .set_read_timeout(Some(Duration::from_millis(200)))
                        .unwrap();
                    let mut request = [0_u8; 4096];
                    let _ = stream.read(&mut request);
                    let _ = stream.write_all(b"HTTP/1.1 401 Unauthorized\r\nWWW-Authenticate: Basic realm=\"fixture\"\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                } else {
                    thread::sleep(Duration::from_millis(10));
                }
            }
        });
        let url = format!("http://{address}/private-fixture.git");
        let outcome = execute(
            &executable,
            temp.path(),
            &["-c", "credential.helper=", "ls-remote", &url],
            true,
        );
        stopped.store(true, Ordering::Relaxed);
        server.join().unwrap();
        let outcome = outcome.unwrap();
        assert!(!outcome.success);
        assert_eq!(classify(&outcome).code, RepositoryErrorCode::GitAuthFailed);
        assert!(!classify(&outcome).message.contains("private-fixture"));
        let offline = execute(
            &executable,
            temp.path(),
            &["-c", "credential.helper=", "ls-remote", &url],
            true,
        )
        .unwrap();
        assert!(!offline.success);
        assert_eq!(
            classify(&offline).code,
            RepositoryErrorCode::GitNetworkFailed
        );
    }
}
