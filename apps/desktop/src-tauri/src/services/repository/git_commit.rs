//! Explicit saved-file commits. Never stage into the user's index before success.
use super::{
    MAX_GIT_OUTPUT_BYTES, OpenRepositoryDto, RepoRoot, RepositoryError, RepositoryErrorCode,
    RepositoryService, atomic, git,
    git_inspection::{self, GitChange, GitStatusDto},
    invalid_resource, invalid_session, registry_error, stale_resource,
};
use serde::Serialize;
use std::{
    collections::HashMap,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Debug)]
pub(super) struct CommitSnapshot {
    head: Option<String>,
    branch: Option<String>,
    contents: HashMap<String, Option<String>>,
    index: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitDto {
    pub head: String,
    pub index_published: bool,
    pub recovery_index: Option<String>,
}
fn blocked() -> RepositoryError {
    RepositoryError::new(
        RepositoryErrorCode::GitCommitBlocked,
        "Commit недоступен для текущего состояния или конфигурации. Используйте внешний Git.",
    )
}
fn io_error(_: std::io::Error) -> RepositoryError {
    blocked()
}
fn content(root: &RepoRoot, path: &str) -> Result<Option<String>, RepositoryError> {
    git_inspection::validate_path(root, path)?;
    if !root.0.join(path).exists() {
        return Ok(None);
    }
    let resolved = root.resolve_existing(path)?;
    let metadata = fs::symlink_metadata(root.0.join(path)).map_err(io_error)?;
    if !metadata.is_file() {
        return Err(blocked());
    }
    let bytes = atomic::read(fs::File::open(resolved).map_err(io_error)?).map_err(io_error)?;
    Ok(Some(atomic::revision(&bytes)))
}
fn index_path(root: &RepoRoot) -> Result<PathBuf, RepositoryError> {
    // Linked worktrees and .git indirection require a separate publication policy.
    let directory = fs::canonicalize(root.0.join(".git")).map_err(io_error)?;
    if directory.parent() != Some(root.0.as_path()) {
        return Err(blocked());
    }
    if !directory.is_dir()
        || fs::symlink_metadata(root.0.join(".git"))
            .map_err(io_error)?
            .file_type()
            .is_symlink()
    {
        return Err(blocked());
    }
    let index = directory.join("index");
    if let Ok(metadata) = fs::symlink_metadata(&index) {
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err(blocked());
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return Err(blocked());
            }
        }
    }
    Ok(index)
}
fn index_revision(path: &Path) -> Result<Option<String>, RepositoryError> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(atomic::revision(&bytes))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(io_error(error)),
    }
}
pub(super) fn snapshot(
    root: &RepoRoot,
    status: &GitStatusDto,
    changes: &HashMap<String, GitChange>,
) -> Result<CommitSnapshot, RepositoryError> {
    let mut contents = HashMap::new();
    for file in status.files.iter().filter(|file| file.committable) {
        let change = &changes[&file.file_id];
        for path in std::iter::once(&change.path).chain(change.original_path.iter()) {
            contents.insert(path.clone(), content(root, path)?);
        }
    }
    // Inspection stays available for repositories unsupported by the writer.
    let index = index_path(root)
        .ok()
        .map(|path| index_revision(&path))
        .transpose()?
        .flatten();
    Ok(CommitSnapshot {
        head: status.head.clone(),
        branch: status.branch.clone(),
        contents,
        index,
    })
}
fn file_text(root: &RepoRoot, path: &str, executable: &Path) -> Result<String, RepositoryError> {
    if root.0.join(path).exists() {
        let resolved = root.resolve_existing(path)?;
        String::from_utf8(
            atomic::read(fs::File::open(resolved).map_err(io_error)?).map_err(io_error)?,
        )
        .map_err(|_| blocked())
    } else {
        git::inspect_git(
            executable,
            &root.0,
            &["show", &format!("HEAD:{path}")],
            2 * 1024 * 1024,
            false,
        )
    }
}
fn product_path(
    root: &RepoRoot,
    opened: &OpenRepositoryDto,
    path: &str,
    executable: &Path,
) -> Result<bool, RepositoryError> {
    git_inspection::validate_path(root, path)?;
    if path == ".casewright/config.yaml" {
        return Ok(true);
    }
    if path.starts_with(".testoritto/glossary/") {
        return Ok(Path::new(path)
            .extension()
            .is_some_and(|extension| extension == "md"));
    }
    if path.starts_with(".casewright/runs/") {
        return Ok(Path::new(path)
            .extension()
            .is_some_and(|extension| extension == "md")
            || path.ends_with("/.order"));
    }
    if !opened.workspaces.iter().any(|workspace| {
        workspace.path.is_empty()
            || path.starts_with(&format!("{}/", workspace.path))
            || path == format!("{}.md", workspace.path)
    }) {
        return Ok(false);
    }
    if path
        .split('/')
        .any(|part| part.starts_with('.') && part != ".order")
    {
        return Ok(false);
    }
    if path == ".order" || path.ends_with("/.order") {
        return Ok(true);
    }
    if Path::new(path)
        .extension()
        .is_none_or(|extension| extension != "md")
    {
        return Ok(false);
    }
    let text = file_text(root, path, executable)?;
    // Generic Markdown in a root workspace is not automatically product data.
    Ok(
        super::CaseDocument::parse(&text).is_ok_and(|document| document.model().id.is_some())
            || root.0.join(path.trim_end_matches(".md")).is_dir(),
    )
}
pub(super) fn product_change(
    root: &RepoRoot,
    opened: &OpenRepositoryDto,
    change: &GitChange,
    executable: &Path,
) -> Result<bool, RepositoryError> {
    if change.submodule || change.unmerged {
        return Ok(false);
    }
    for path in std::iter::once(&change.path).chain(change.original_path.iter()) {
        if !product_path(root, opened, path, executable)? {
            return Ok(false);
        }
    }
    Ok(true)
}
fn config(executable: &Path, root: &RepoRoot, key: &str) -> Result<String, RepositoryError> {
    git::inspect_git(
        executable,
        &root.0,
        &["config", "--get", key],
        MAX_GIT_OUTPUT_BYTES,
        true,
    )
}
fn preflight(
    executable: &Path,
    root: &RepoRoot,
    status: &GitStatusDto,
) -> Result<(), RepositoryError> {
    if status.detached || status.unborn || status.files.iter().any(|file| file.unmerged) {
        return Err(blocked());
    }
    if !git::inspect_git(
        executable,
        &root.0,
        &["config", "--null", "--get", "core.hooksPath"],
        MAX_GIT_OUTPUT_BYTES,
        true,
    )?
    .is_empty()
    {
        return Err(blocked());
    }
    for key in [
        "core.splitIndex",
        "core.sparseCheckout",
        "extensions.worktreeConfig",
        "commit.gpgSign",
    ] {
        let value = config(executable, root, key)?;
        if !value.trim().is_empty() && value.trim() != "false" {
            return Err(blocked());
        }
    }
    for marker in [
        "MERGE_HEAD",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-apply",
        "rebase-merge",
        "sequencer",
        "BISECT_LOG",
    ] {
        if root.0.join(".git").join(marker).exists() {
            return Err(blocked());
        }
    }
    // Refuse active hooks (sample files are harmless). No silent --no-verify bypass.
    for name in [
        "pre-commit",
        "prepare-commit-msg",
        "commit-msg",
        "post-commit",
        "post-index-change",
        "reference-transaction",
    ] {
        let hook = root.0.join(".git/hooks").join(name);
        if hook.is_file() {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if fs::metadata(&hook).map_err(io_error)?.permissions().mode() & 0o111 == 0 {
                    continue;
                }
            }
            return Err(blocked());
        }
    }
    // git var resolves the effective identity including Git's fallback rules, without changing it.
    for variable in ["GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"] {
        git::inspect_git(
            executable,
            &root.0,
            &["var", variable],
            MAX_GIT_OUTPUT_BYTES,
            false,
        )
        .map_err(|_| {
            RepositoryError::new(
                RepositoryErrorCode::GitIdentityMissing,
                "Настройте Git user.name и user.email.",
            )
        })?;
    }
    Ok(())
}
struct IndexTransaction {
    lock: PathBuf,
    temporary: PathBuf,
    preserve: bool,
}
impl Drop for IndexTransaction {
    fn drop(&mut self) {
        if !self.preserve {
            let _ = fs::remove_file(&self.lock);
            let _ = fs::remove_file(&self.temporary);
            let _ = fs::remove_file(PathBuf::from(format!("{}.lock", self.temporary.display())));
        }
    }
}
impl RepositoryService {
    /// Commits explicitly selected saved product files, retaining unrelated staged entries.
    /// # Errors
    /// Rejects stale snapshots, foreign files, unsupported configuration and invalid sessions.
    // Keep the lock/validation/mutation/recovery sequence visible as one transaction.
    #[allow(clippy::too_many_lines)]
    pub fn git_commit(
        &self,
        token: &str,
        file_ids: &[String],
        message: &str,
    ) -> Result<GitCommitDto, RepositoryError> {
        if file_ids.is_empty()
            || file_ids.len() > 200
            || message.trim().is_empty()
            || message.len() > 4096
            || message.contains('\0')
            || file_ids
                .iter()
                .collect::<std::collections::HashSet<_>>()
                .len()
                != file_ids.len()
        {
            return Err(invalid_resource());
        }
        let mut sessions = self.sessions.lock().map_err(|_| registry_error())?;
        let session = sessions.by_id.get_mut(token).ok_or_else(invalid_session)?;
        super::git_sync::ensure_writable(session)?;
        if session.git_recovery {
            return Err(RepositoryError::new(
                RepositoryErrorCode::GitRecoveryRequired,
                "Проверьте HEAD и сохранённый temporary index во внешнем Git.",
            ));
        }
        let root = RepoRoot::open(&session.root.0)?;
        if root != session.root {
            return Err(stale_resource());
        }
        let executable = git::find_git_executable(&root.0)?;
        let (prefix, disabled) = git_inspection::inspection_args(&executable, &root.0)?;
        let (mut status, current) = git_inspection::status_command(&executable, &root.0, &prefix)?;
        status.filters_disabled = disabled;
        // status_command has not populated DTO files; use parsed changes for conflict diagnosis.
        if current.iter().any(|change| change.unmerged) {
            return Err(blocked());
        }
        preflight(&executable, &root, &status)?;
        let expected = session.git_snapshot.as_ref().ok_or_else(stale_resource)?;
        let index = index_path(&root)?;
        let lock = index.with_extension("lock");
        let lock_file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&lock)
            .map_err(io_error)?;
        let temporary = index.with_file_name(format!("testoritto-index-{}", uuid::Uuid::new_v4()));
        let mut transaction = IndexTransaction {
            lock,
            temporary,
            preserve: false,
        };
        if index.exists() {
            fs::copy(&index, &transaction.temporary).map_err(io_error)?;
        }
        let mut paths = Vec::new();
        for id in file_ids {
            let change = session.git_changes.get(id).ok_or_else(invalid_resource)?;
            if !current.contains(change)
                || !product_change(&root, &session.opened, change, &executable)?
            {
                return Err(stale_resource());
            }
            for path in std::iter::once(&change.path).chain(change.original_path.iter()) {
                if expected.contents.get(path) != Some(&content(&root, path)?) {
                    return Err(stale_resource());
                }
                if !paths.contains(path) {
                    paths.push(path.clone());
                }
            }
        }
        if status.head != expected.head
            || status.branch != expected.branch
            || index_revision(&index)? != expected.index
        {
            return Err(stale_resource());
        }
        for path in &paths {
            let attributes = git_inspection::invoke(
                &executable,
                &root.0,
                &prefix,
                &["check-attr", "-z", "filter", "--", path],
                MAX_GIT_OUTPUT_BYTES,
            )?;
            let value = attributes
                .split_terminator('\0')
                .nth(2)
                .ok_or_else(blocked)?;
            if value != "unspecified" && value != "unset" {
                return Err(blocked());
            }
        }
        let mut args: Vec<&str> = prefix.iter().map(String::as_str).collect();
        // Refuse configured helpers above. Avoid automatic gc, signing/editor and status output.
        args.extend(["-c", "gc.auto=0", "add", "--all", "--"]);
        let new_paths: Vec<_> = paths
            .iter()
            .filter(|path| root.0.join(path).is_file())
            .collect();
        args.extend(new_paths.iter().map(|path| path.as_str()));
        if !new_paths.is_empty() {
            git::with_index(&executable, &root.0, &args, &transaction.temporary)?;
        }
        let (again, changes) = git_inspection::status_command(&executable, &root.0, &prefix)?;
        if again.head != expected.head
            || again.branch != expected.branch
            || current != changes
            || index_revision(&index)? != expected.index
        {
            return Err(stale_resource());
        }
        for path in &paths {
            if expected.contents.get(path) != Some(&content(&root, path)?) {
                return Err(stale_resource());
            }
        }
        preflight(&executable, &root, &again)?;
        let mut args: Vec<&str> = prefix.iter().map(String::as_str).collect();
        args.extend([
            "-c",
            "gc.auto=0",
            "commit",
            "--only",
            "--quiet",
            "--no-status",
            "--cleanup=verbatim",
            "-m",
            message,
            "--",
        ]);
        args.extend(paths.iter().map(String::as_str));
        transaction.preserve = true;
        session.git_recovery = true;
        let outcome = git::with_index(&executable, &root.0, &args, &transaction.temporary);
        // Even on a timeout/diagnostic failure Git might have advanced HEAD. Never report retryable failure then.
        let head = git_inspection::invoke(
            &executable,
            &root.0,
            &prefix,
            &["rev-parse", "HEAD"],
            MAX_GIT_OUTPUT_BYTES,
        )
        .map_err(|_| {
            RepositoryError::new(
                RepositoryErrorCode::GitRecoveryRequired,
                "HEAD неизвестен; сохранены index.lock и temporary index. Проверьте внешний Git.",
            )
        })?;
        let head = head.trim().to_owned();
        if Some(&head) == expected.head.as_ref() {
            transaction.preserve = false;
            session.git_recovery = false;
            outcome?;
            return Err(blocked());
        }
        if outcome.is_err() {
            return Err(RepositoryError::new(
                RepositoryErrorCode::GitRecoveryRequired,
                "HEAD изменился при диагностической ошибке; проверьте внешний Git.",
            ));
        }
        let parent = git_inspection::invoke(
            &executable,
            &root.0,
            &prefix,
            &["rev-parse", "HEAD^"],
            MAX_GIT_OUTPUT_BYTES,
        )
        .map_err(|_| {
            RepositoryError::new(
                RepositoryErrorCode::GitRecoveryRequired,
                "Не удалось проверить parent commit; проверьте внешний Git.",
            )
        })?;
        if Some(parent.trim()) != expected.head.as_deref() {
            return Err(RepositoryError::new(
                RepositoryErrorCode::GitRecoveryRequired,
                "HEAD изменён другой операцией; проверьте внешний Git.",
            ));
        }
        session.git_changes.clear();
        session.git_snapshot = None;
        transaction.preserve = true;
        // Populate the already held lock before atomic publication. Failure retains both recovery artifacts.
        let publish = (|| -> std::io::Result<()> {
            #[cfg(test)]
            if FAIL_PUBLICATION.with(std::cell::Cell::get) {
                return Err(std::io::Error::other("injected index publication failure"));
            }
            let bytes = fs::read(&transaction.temporary)?;
            let mut lock_file = lock_file;
            lock_file.write_all(&bytes)?;
            lock_file.sync_all()?;
            drop(lock_file);
            fs::rename(&transaction.lock, &index)
        })();
        let published = publish.is_ok();
        if published {
            session.git_recovery = false;
            transaction.preserve = false;
        }
        Ok(GitCommitDto {
            head,
            index_published: published,
            recovery_index: if published {
                None
            } else {
                transaction
                    .temporary
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned())
            },
        })
    }
}
#[cfg(test)]
mod tests;

pub(super) fn safe_contents(root: &RepoRoot, change: &GitChange) -> bool {
    std::iter::once(&change.path)
        .chain(change.original_path.iter())
        .all(|path| content(root, path).is_ok())
}
#[cfg(test)]
thread_local! { static FAIL_PUBLICATION: std::cell::Cell<bool> = const { std::cell::Cell::new(false) }; }
