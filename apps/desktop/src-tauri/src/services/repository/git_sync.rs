//! Explicit current-branch synchronization. Conflicts are owned in memory and abort is opt-in.
use super::{
    MAX_GIT_OUTPUT_BYTES, OpenRepositoryDto, RepoRoot, RepoSession, RepositoryError,
    RepositoryErrorCode, RepositoryService, atomic, git, git_inspection, git_network,
    invalid_session, load_open_metadata, registry_error, stale_resource,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, io::Read, path::Path};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GitSyncAction {
    Pull,
    Push,
    Abort,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitSyncDto {
    pub outcome: &'static str,
    pub abort_token: Option<String>,
    pub unmerged_paths: Vec<String>,
    pub repository: Option<OpenRepositoryDto>,
    pub reload_required: bool,
}
#[derive(Debug, PartialEq, Eq)]
pub(super) struct SyncSnapshot {
    token: String,
    head: String,
    branch: String,
    index: String,
    config: String,
}
#[derive(Debug)]
pub(super) struct OwnedMerge {
    pub token: String,
    baseline: String,
    merge_head: String,
    index: String,
    contents: BTreeMap<String, Option<String>>,
}
fn error(code: RepositoryErrorCode) -> RepositoryError {
    RepositoryError::new(
        code,
        "Операция Git заблокирована. Проверьте состояние и настройки во внешнем Git.",
    )
}
pub(super) fn ensure_writable(session: &RepoSession) -> Result<(), RepositoryError> {
    if session.suite_recovery.is_some() {
        return Err(error(RepositoryErrorCode::SuiteRecoveryRequired));
    }
    super::validate_current_metadata(session)?;
    if session.git_sync_blocked || session.git_merge.is_some() {
        return Err(blocked());
    }
    Ok(())
}
fn blocked() -> RepositoryError {
    error(RepositoryErrorCode::GitSyncBlocked)
}
fn read(exe: &Path, root: &RepoRoot, args: &[&str]) -> Result<String, RepositoryError> {
    git::inspect_git(exe, &root.0, args, MAX_GIT_OUTPUT_BYTES, false)
}
fn config(exe: &Path, root: &RepoRoot, key: &str) -> Result<String, RepositoryError> {
    git::inspect_git(
        exe,
        &root.0,
        &["config", "--null", "--get-all", key],
        MAX_GIT_OUTPUT_BYTES,
        true,
    )
}
const HASH_BUDGET: u64 = 32 * 1024 * 1024;
fn revision(path: &Path) -> Result<String, RepositoryError> {
    let mut budget = HASH_BUDGET;
    digest(path, &mut budget)
}
fn digest(path: &Path, budget: &mut u64) -> Result<String, RepositoryError> {
    let mut file = fs::File::open(path).map_err(|_| blocked())?;
    let meta = file.metadata().map_err(|_| blocked())?;
    if !meta.is_file() || meta.len() > *budget {
        return Err(blocked());
    }
    let mut hash = Sha256::new();
    let mut buffer = [0_u8; 8192];
    loop {
        let count = file.read(&mut buffer).map_err(|_| blocked())?;
        if count == 0 {
            break;
        }
        *budget = budget.checked_sub(count as u64).ok_or_else(blocked)?;
        hash.update(&buffer[..count]);
    }
    Ok(format!("{:x}", hash.finalize()))
}
fn local_git(root: &RepoRoot) -> Result<(), RepositoryError> {
    let path = root.0.join(".git");
    if !fs::symlink_metadata(&path).map_err(|_| blocked())?.is_dir()
        || fs::canonicalize(&path).map_err(|_| blocked())?.parent() != Some(root.0.as_path())
    {
        return Err(blocked());
    }
    Ok(())
}
pub(super) fn register_snapshot(
    session: &mut RepoSession,
    exe: &Path,
) -> Result<String, RepositoryError> {
    let token = Uuid::new_v4().to_string();
    session.git_sync_snapshot = Some(snapshot(&session.root, exe, token.clone())?);
    Ok(token)
}
fn snapshot(root: &RepoRoot, exe: &Path, token: String) -> Result<SyncSnapshot, RepositoryError> {
    local_git(root)?;
    Ok(SyncSnapshot {
        token,
        head: read(exe, root, &["rev-parse", "--verify", "HEAD"])?
            .trim()
            .into(),
        branch: read(exe, root, &["symbolic-ref", "--quiet", "HEAD"])?
            .trim()
            .into(),
        index: revision(&root.0.join(".git/index"))?,
        config: atomic::revision(read(exe, root, &["config", "--null", "--list"])?.as_bytes()),
    })
}
fn one(value: &str) -> Result<&str, RepositoryError> {
    let values: Vec<_> = value.split_terminator('\0').collect();
    if values.len() == 1 && !values[0].is_empty() {
        Ok(values[0])
    } else {
        Err(error(RepositoryErrorCode::GitNoUpstream))
    }
}
fn upstream(
    exe: &Path,
    root: &RepoRoot,
    branch: &str,
) -> Result<(String, String), RepositoryError> {
    let branch = branch.strip_prefix("refs/heads/").ok_or_else(blocked)?;
    if !config(exe, root, &format!("branch.{branch}.mergeOptions"))?.is_empty() {
        return Err(blocked());
    }
    let remote = config(exe, root, &format!("branch.{branch}.remote"))?;
    let remote = one(&remote)?;
    if remote == "." || remote.starts_with('-') || remote.contains(['/', '\\', ':', '\n', '\r']) {
        return Err(blocked());
    }
    let target = config(exe, root, &format!("branch.{branch}.merge"))?;
    let target = one(&target)?;
    if !target.starts_with("refs/heads/") {
        return Err(blocked());
    }
    read(exe, root, &["check-ref-format", target])?;
    let url = config(exe, root, &format!("remote.{remote}.url"))?;
    one(&url)?;
    for key in [
        format!("remote.{remote}.pushurl"),
        format!("remote.{remote}.receivepack"),
        format!("remote.{remote}.uploadpack"),
        format!("remote.{remote}.vcs"),
        format!("remote.{remote}.pushOption"),
    ] {
        if !config(exe, root, &key)?.is_empty() {
            return Err(blocked());
        }
    }
    let mirror = config(exe, root, &format!("remote.{remote}.mirror"))?;
    if !mirror.is_empty() && mirror != "false\0" {
        return Err(blocked());
    }
    Ok((remote.into(), target.into()))
}
fn preflight(exe: &Path, root: &RepoRoot, allow_merge: bool) -> Result<(), RepositoryError> {
    local_git(root)?;
    for marker in [
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
        "rebase-apply",
        "rebase-merge",
        "sequencer",
        "BISECT_LOG",
        "MERGE_AUTOSTASH",
        "index.lock",
        "HEAD.lock",
    ] {
        if root.0.join(".git").join(marker).exists() {
            return Err(blocked());
        }
    }
    if !allow_merge && root.0.join(".git/MERGE_HEAD").exists() {
        return Err(blocked());
    }
    for key in [
        "core.hooksPath",
        "core.sshCommand",
        "core.attributesFile",
        "ssh.variant",
    ] {
        if !config(exe, root, key)?.is_empty() {
            return Err(blocked());
        }
    }
    for key in [
        "core.sparseCheckout",
        "core.splitIndex",
        "extensions.worktreeConfig",
        "commit.gpgSign",
        "merge.gpgSign",
        "merge.verifySignatures",
        "push.gpgSign",
        "push.pushOption",
    ] {
        let value = config(exe, root, key)?;
        if !value.is_empty() && value != "false\0" {
            return Err(blocked());
        }
    }
    if !git::inspect_git(
        exe,
        &root.0,
        &[
            "config",
            "--name-only",
            "--get-regexp",
            r"^(merge\..*\.driver$|url\..*\.(insteadof|pushinsteadof)$)",
        ],
        MAX_GIT_OUTPUT_BYTES,
        true,
    )?
    .is_empty()
    {
        return Err(blocked());
    }
    let hooks = root.0.join(".git/hooks");
    if hooks.exists() {
        for entry in fs::read_dir(hooks).map_err(|_| blocked())? {
            let entry = entry.map_err(|_| blocked())?;
            if !entry.file_name().to_string_lossy().ends_with(".sample") {
                return Err(blocked());
            }
        }
    }
    for marker in ["info/attributes", "info/grafts", "shallow"] {
        if root.0.join(".git").join(marker).exists() {
            return Err(blocked());
        }
    }
    let (prefix, _) = git_inspection::inspection_args(exe, &root.0)?;
    let (_, changes) = git_inspection::status_command(exe, &root.0, &prefix)?;
    if !allow_merge && !changes.is_empty() {
        return Err(error(RepositoryErrorCode::GitDirty));
    }
    let flags = read(exe, root, &["ls-files", "-v", "-z"])?;
    if flags
        .split_terminator('\0')
        .any(|line| !(line.starts_with("H ") || allow_merge && line.starts_with("M ")))
    {
        return Err(blocked());
    }
    Ok(())
}
fn tree(exe: &Path, root: &RepoRoot, oid: &str) -> Result<(), RepositoryError> {
    let listing = read(exe, root, &["ls-tree", "-r", "-l", "-z", oid])?;
    let mut remaining = HASH_BUDGET;
    for record in listing.split_terminator('\0') {
        let (mode, path) = record.split_once('\t').ok_or_else(blocked)?;
        if !(mode.starts_with("100644 blob ") || mode.starts_with("100755 blob "))
            || path
                .split('/')
                .any(|p| p == ".gitattributes" || p == ".gitmodules")
        {
            return Err(blocked());
        }
        let size = mode
            .split_whitespace()
            .last()
            .ok_or_else(blocked)?
            .parse::<u64>()
            .map_err(|_| blocked())?;
        remaining = remaining.checked_sub(size).ok_or_else(blocked)?;
        git_inspection::validate_path(root, path)?;
        let attributes = read(exe, root, &["check-attr", "-z", "filter", "--", path])?;
        let fields: Vec<_> = attributes.split_terminator('\0').collect();
        if fields.len() != 3 || !matches!(fields[2], "unspecified" | "unset") {
            return Err(blocked());
        }
    }
    Ok(())
}
fn manifest(
    exe: &Path,
    root: &RepoRoot,
) -> Result<BTreeMap<String, Option<String>>, RepositoryError> {
    let paths = read(exe, root, &["ls-files", "-z"])?;
    let mut result = BTreeMap::new();
    let mut remaining = HASH_BUDGET;
    let baseline = read(exe, root, &["ls-tree", "-r", "--name-only", "-z", "HEAD"])?;
    for path in paths
        .split_terminator('\0')
        .chain(baseline.split_terminator('\0'))
    {
        if result.contains_key(path) {
            continue;
        }
        git_inspection::validate_path(root, path)?;
        let full = root.0.join(path);
        let value = if full.exists() {
            let resolved = root.resolve_existing(path)?;
            if !fs::symlink_metadata(&full)
                .map_err(|_| blocked())?
                .is_file()
            {
                return Err(blocked());
            }
            Some(digest(&resolved, &mut remaining)?)
        } else {
            None
        };
        result.insert(path.into(), value);
    }
    Ok(result)
}
fn conflicts(exe: &Path, root: &RepoRoot) -> Result<Vec<String>, RepositoryError> {
    Ok(
        read(exe, root, &["diff", "--name-only", "--diff-filter=U", "-z"])?
            .split_terminator('\0')
            .map(str::to_owned)
            .collect(),
    )
}
fn refresh(session: &mut RepoSession) -> Option<OpenRepositoryDto> {
    session.resources.clear();
    session.git_changes.clear();
    session.git_snapshot = None;
    session.git_sync_snapshot = None;
    let Ok(metadata) = load_open_metadata(&session.root) else {
        session.git_sync_blocked = true;
        return None;
    };
    session.opened.display_name = metadata.display_name;
    session.opened.needs_initialization = metadata.needs_initialization;
    session.opened.workspaces = metadata.workspaces;
    session.opened.warnings = metadata.warnings;
    Some(session.opened.clone())
}
impl RepositoryService {
    /// Synchronizes only the configured current branch after an opaque status confirmation.
    /// # Errors
    /// Refuses changed snapshots, dirty worktrees, unsupported config, unsafe aborts and remote failures.
    #[allow(clippy::too_many_lines)] // One serialized transaction retains the validated snapshot across fetch and merge.
    pub fn git_sync(
        &self,
        token: &str,
        confirmation: &str,
        action: GitSyncAction,
    ) -> Result<GitSyncDto, RepositoryError> {
        let mut sessions = self.sessions.lock().map_err(|_| registry_error())?;
        let session = sessions.by_id.get_mut(token).ok_or_else(invalid_session)?;
        let root = RepoRoot::open(&session.root.0)?;
        if root != session.root
            || session.git_recovery
            || session.git_sync_blocked
            || session.suite_recovery.is_some()
        {
            return Err(blocked());
        }
        let exe = git::find_git_executable(&root.0)?;
        if matches!(action, GitSyncAction::Abort) {
            return abort(session, &exe, confirmation);
        }
        if session.git_merge.is_some() {
            return Err(blocked());
        }
        let expected = session
            .git_sync_snapshot
            .as_ref()
            .ok_or_else(stale_resource)?;
        if expected.token != confirmation
            || *expected != snapshot(&root, &exe, confirmation.into())?
        {
            return Err(stale_resource());
        }
        preflight(&exe, &root, false)?;
        tree(&exe, &root, &expected.head)?;
        let (remote, target) = upstream(&exe, &root, &expected.branch)?;
        let tracking = read(
            &exe,
            &root,
            &["for-each-ref", "--format=%(upstream)", &expected.branch],
        )?
        .trim()
        .to_owned();
        if !tracking.starts_with(&format!("refs/remotes/{remote}/"))
            || tracking.contains(['\n', '\r'])
        {
            return Err(blocked());
        }
        read(&exe, &root, &["check-ref-format", &tracking])?;
        let fetch_refspec = format!("{target}:{tracking}");
        let baseline = expected.head.clone();
        let baseline_index = expected.index.clone();
        manifest(&exe, &root)?;
        if matches!(action, GitSyncAction::Push) {
            let refspec = format!("{}:{target}", expected.head);
            let out = git_network::execute(
                &exe,
                &root.0,
                &[
                    "-c",
                    "push.followTags=false",
                    "-c",
                    "remote.pushDefault=",
                    "push",
                    "--porcelain",
                    "--no-force",
                    "--no-mirror",
                    "--no-follow-tags",
                    "--recurse-submodules=no",
                    "--",
                    &remote,
                    &refspec,
                ],
                true,
            )?;
            if !out.success {
                return Err(git_network::classify(&out));
            }
            session.git_sync_snapshot = None;
            return Ok(GitSyncDto {
                outcome: "pushed",
                abort_token: None,
                unmerged_paths: vec![],
                repository: None,
                reload_required: false,
            });
        }
        let out = git_network::execute(
            &exe,
            &root.0,
            &[
                "fetch",
                "--no-tags",
                "--no-prune",
                "--no-recurse-submodules",
                "--no-auto-maintenance",
                "--refmap=",
                "--",
                &remote,
                &fetch_refspec,
            ],
            true,
        )?;
        if !out.success {
            return Err(git_network::classify(&out));
        }
        // Fetch cannot alter local work; reject external changes before touching the working tree.
        if *expected != snapshot(&root, &exe, confirmation.into())? {
            return Err(stale_resource());
        }
        preflight(&exe, &root, false)?;
        let incoming = read(
            &exe,
            &root,
            &["rev-parse", "--verify", "FETCH_HEAD^{commit}"],
        )?
        .trim()
        .to_owned();
        if !matches!(incoming.len(), 40 | 64) || !incoming.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(blocked());
        }
        tree(&exe, &root, &incoming)?;
        let ancestor = read(&exe, &root, &["merge-base", &baseline, &incoming])?;
        if ancestor.trim() != baseline && ancestor.trim() != incoming {
            for variable in ["GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"] {
                read(&exe, &root, &["var", variable])
                    .map_err(|_| error(RepositoryErrorCode::GitIdentityMissing))?;
            }
        }
        session.git_sync_blocked = true;
        let merge_result = git_network::execute(
            &exe,
            &root.0,
            &[
                "merge",
                "--ff",
                "--no-autostash",
                "--no-edit",
                "--no-gpg-sign",
                "--no-overwrite-ignore",
                "--",
                &incoming,
            ],
            false,
        );
        let Ok(out) = merge_result else {
            session.git_sync_blocked = true;
            session.resources.clear();
            session.git_changes.clear();
            session.git_snapshot = None;
            session.git_sync_snapshot = None;
            return Err(error(RepositoryErrorCode::GitRecoveryRequired));
        };
        session.git_sync_snapshot = None;
        let paths = conflicts(&exe, &root)?;
        if !out.success {
            if paths.is_empty() {
                if read(&exe, &root, &["rev-parse", "--verify", "HEAD"])?.trim() == baseline
                    && revision(&root.0.join(".git/index"))? == baseline_index
                    && !root.0.join(".git/MERGE_HEAD").exists()
                    && {
                        let (prefix, _) = git_inspection::inspection_args(&exe, &root.0)?;
                        git_inspection::status_command(&exe, &root.0, &prefix)?
                            .1
                            .is_empty()
                    }
                {
                    session.git_sync_blocked = false;
                    return Err(blocked());
                }
                return Err(error(RepositoryErrorCode::GitRecoveryRequired));
            }
            let owned = OwnedMerge {
                token: Uuid::new_v4().to_string(),
                baseline,
                merge_head: revision(&root.0.join(".git/MERGE_HEAD"))?,
                index: revision(&root.0.join(".git/index"))?,
                contents: manifest(&exe, &root)?,
            };
            let abort_token = Some(owned.token.clone());
            session.git_merge = Some(owned);
            session.git_sync_blocked = false;
            return Ok(GitSyncDto {
                outcome: "conflict",
                abort_token,
                unmerged_paths: paths,
                repository: None,
                reload_required: false,
            });
        }
        session.git_sync_blocked = false;
        let repository = refresh(session);
        let reload_required = repository.is_none();
        Ok(GitSyncDto {
            outcome: "pulled",
            abort_token: None,
            unmerged_paths: vec![],
            repository,
            reload_required,
        })
    }
}
fn abort(
    session: &mut RepoSession,
    exe: &Path,
    confirmation: &str,
) -> Result<GitSyncDto, RepositoryError> {
    abort_command(session, exe, confirmation, &["merge", "--abort"])
}
fn abort_command(
    session: &mut RepoSession,
    exe: &Path,
    confirmation: &str,
    command: &[&str],
) -> Result<GitSyncDto, RepositoryError> {
    let owned = session.git_merge.as_ref().ok_or_else(blocked)?;
    let root = &session.root;
    if confirmation != owned.token
        || read(exe, root, &["rev-parse", "--verify", "HEAD"])?.trim() != owned.baseline
        || revision(&root.0.join(".git/MERGE_HEAD"))? != owned.merge_head
        || revision(&root.0.join(".git/index"))? != owned.index
        || manifest(exe, root)? != owned.contents
    {
        return Err(error(RepositoryErrorCode::GitAbortFailed));
    }
    preflight(exe, root, true).map_err(|_| error(RepositoryErrorCode::GitAbortFailed))?;
    tree(exe, root, &owned.baseline).map_err(|_| error(RepositoryErrorCode::GitAbortFailed))?;
    let out = git_network::execute(exe, &root.0, command, false)
        .map_err(|_| error(RepositoryErrorCode::GitAbortFailed))?;
    if !out.success {
        return Err(error(RepositoryErrorCode::GitAbortFailed));
    }
    if read(exe, root, &["rev-parse", "--verify", "HEAD"])?.trim() != owned.baseline
        || root.0.join(".git/MERGE_HEAD").exists()
        || !read(
            exe,
            root,
            &["status", "--porcelain=v1", "--untracked-files=no"],
        )?
        .is_empty()
    {
        session.git_sync_blocked = true;
        return Err(error(RepositoryErrorCode::GitAbortFailed));
    }
    session.git_merge = None;
    let repository = refresh(session);
    let reload_required = repository.is_none();
    Ok(GitSyncDto {
        outcome: "aborted",
        abort_token: None,
        unmerged_paths: vec![],
        repository,
        reload_required,
    })
}
#[cfg(test)]
mod tests;
