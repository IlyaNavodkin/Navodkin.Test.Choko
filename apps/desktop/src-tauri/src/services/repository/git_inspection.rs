use super::{
    MAX_GIT_OUTPUT_BYTES, RepoRoot, RepositoryError, RepositoryErrorCode, RepositoryService, git,
    invalid_resource, invalid_session, registry_error, stale_resource,
};
use serde::Serialize;
use std::{collections::HashMap, fs, io::Read, path::Path};
use uuid::Uuid;
const MAX_DIFF_BYTES: usize = 256 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct GitChange {
    fingerprint: String,
    pub(super) path: String,
    pub(super) original_path: Option<String>,
    index: char,
    worktree: char,
    pub(super) unmerged: bool,
    pub(super) submodule: bool,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileDto {
    pub file_id: String,
    pub committable: bool,
    pub path: String,
    pub original_path: Option<String>,
    pub index: String,
    pub worktree: String,
    pub unmerged: bool,
    pub submodule: bool,
}
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
#[allow(clippy::struct_excessive_bools)] // Independent porcelain and inspection facts in the IPC DTO.
pub struct GitStatusDto {
    pub sync_blocked: bool,
    pub sync_token: Option<String>,
    pub abort_token: Option<String>,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub unborn: bool,
    pub detached: bool,
    pub upstream: Option<String>,
    pub ahead: Option<u64>,
    pub behind: Option<u64>,
    pub filters_disabled: bool,
    pub files: Vec<GitFileDto>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffDto {
    pub path: String,
    pub staged: Option<String>,
    pub working_tree: Option<String>,
    pub untracked_content: Option<String>,
    pub binary: bool,
    pub unmerged: bool,
    pub filters_disabled: bool,
}
fn invalid_status() -> RepositoryError {
    RepositoryError::new(
        RepositoryErrorCode::GitFailed,
        "Не удалось разобрать ответ Git.",
    )
}

// Only configuration names are read. Disable every configured external content filter per invocation.
pub(super) fn inspection_args(
    executable: &Path,
    root: &Path,
) -> Result<(Vec<String>, bool), RepositoryError> {
    let names = git::inspect_git(
        executable,
        root,
        &[
            "config",
            "--null",
            "--name-only",
            "--get-regexp",
            r"^filter\..*\.(clean|smudge|process|required)$",
        ],
        MAX_GIT_OUTPUT_BYTES,
        true,
    )?;
    let mut args: Vec<String> = [
        "--literal-pathspecs",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.untrackedCache=false",
        "-c",
        "maintenance.auto=false",
    ]
    .into_iter()
    .map(str::to_owned)
    .collect();
    let mut disabled = false;
    for key in names.split('\0').filter(|name| !name.is_empty()) {
        if key.len() > 4096 || key.contains(['\n', '\r']) || !key.starts_with("filter.") {
            return Err(invalid_status());
        }
        let (prefix, property) = key.rsplit_once('.').ok_or_else(invalid_status)?;
        if !matches!(property, "clean" | "smudge" | "process" | "required") {
            return Err(invalid_status());
        }
        disabled = true;
        args.extend([
            "-c".into(),
            format!(
                "{key}={}",
                if property == "required" { "false" } else { "" }
            ),
        ]);
        args.extend(["-c".into(), format!("{prefix}.required=false")]);
    }
    if args.iter().map(String::len).sum::<usize>() > 16 * 1024 {
        return Err(RepositoryError::new(
            RepositoryErrorCode::GitOutputTooLarge,
            "Слишком много настроенных Git-фильтров.",
        ));
    }
    Ok((args, disabled))
}
pub(super) fn invoke(
    executable: &Path,
    root: &Path,
    prefix: &[String],
    command: &[&str],
    limit: usize,
) -> Result<String, RepositoryError> {
    let args: Vec<&str> = prefix
        .iter()
        .map(String::as_str)
        .chain(command.iter().copied())
        .collect();
    git::inspect_git(executable, root, &args, limit, false)
}
fn parse_status(raw: &str) -> Result<(GitStatusDto, Vec<GitChange>), RepositoryError> {
    let mut status = GitStatusDto::default();
    let mut changes = Vec::new();
    let mut records = raw.split_terminator('\0');
    while let Some(record) = records.next() {
        if let Some(value) = record.strip_prefix("# branch.oid ") {
            if value == "(initial)" {
                status.unborn = true;
            } else {
                status.head = Some(value.into());
            }
        } else if let Some(value) = record.strip_prefix("# branch.head ") {
            if value == "(detached)" {
                status.detached = true;
            } else {
                status.branch = Some(value.into());
            }
        } else if let Some(value) = record.strip_prefix("# branch.upstream ") {
            status.upstream = Some(value.into());
        } else if let Some(value) = record.strip_prefix("# branch.ab ") {
            let (ahead, behind) = value.split_once(' ').ok_or_else(invalid_status)?;
            status.ahead = Some(
                ahead
                    .strip_prefix('+')
                    .ok_or_else(invalid_status)?
                    .parse()
                    .map_err(|_| invalid_status())?,
            );
            status.behind = Some(
                behind
                    .strip_prefix('-')
                    .ok_or_else(invalid_status)?
                    .parse()
                    .map_err(|_| invalid_status())?,
            );
        } else if record.starts_with('#') { /* Future porcelain headers are additive. */
        } else if let Some(path) = record.strip_prefix("? ") {
            changes.push(GitChange {
                fingerprint: record.into(),
                path: path.into(),
                original_path: None,
                index: '?',
                worktree: '?',
                unmerged: false,
                submodule: false,
            });
        } else {
            let count = match record.as_bytes().first() {
                Some(b'1') => 9,
                Some(b'2') => 10,
                Some(b'u') => 11,
                _ => return Err(invalid_status()),
            };
            let fields: Vec<_> = record.splitn(count, ' ').collect();
            if fields.len() != count
                || fields[1].len() != 2
                || !fields[1].chars().all(|value| ".MADRCUT".contains(value))
            {
                return Err(invalid_status());
            }
            let original_path = if fields[0] == "2" {
                Some(records.next().ok_or_else(invalid_status)?.to_owned())
            } else {
                None
            };
            changes.push(GitChange {
                fingerprint: record.into(),
                path: fields[count - 1].into(),
                original_path,
                index: fields[1].chars().next().ok_or_else(invalid_status)?,
                worktree: fields[1].chars().nth(1).ok_or_else(invalid_status)?,
                unmerged: fields[0] == "u",
                submodule: fields[2].starts_with('S'),
            });
        }
        if changes.len() > 20_000 {
            return Err(invalid_status());
        }
    }
    if status.branch.is_none() && !status.detached {
        return Err(invalid_status());
    }
    Ok((status, changes))
}
pub(super) fn status_command(
    executable: &Path,
    root: &Path,
    args: &[String],
) -> Result<(GitStatusDto, Vec<GitChange>), RepositoryError> {
    parse_status(&invoke(
        executable,
        root,
        args,
        &[
            "status",
            "--porcelain=v2",
            "-z",
            "--branch",
            "--untracked-files=all",
            "--ignore-submodules=dirty",
        ],
        MAX_GIT_OUTPUT_BYTES,
    )?)
}

pub(super) fn validate_path(root: &RepoRoot, relative: &str) -> Result<(), RepositoryError> {
    if relative.is_empty()
        || relative.contains(['\0', '\\', ':'])
        || relative.split('/').any(|part| {
            part.is_empty() || part == "." || part == ".." || part.eq_ignore_ascii_case(".git")
        })
    {
        return Err(invalid_resource());
    }
    let mut path = Path::new(relative);
    loop {
        match root.resolve_existing(&path.to_string_lossy()) {
            Ok(_) => return Ok(()),
            Err(error) if error.code == RepositoryErrorCode::Io => {
                path = path.parent().ok_or_else(invalid_resource)?;
                if path.as_os_str().is_empty() {
                    return Ok(());
                }
            }
            Err(error) => return Err(error),
        }
    }
}
impl RepositoryService {
    /// Reads local Git state and registers opaque file IDs without changing the index.
    /// # Errors
    /// Rejects invalid sessions, unavailable Git, oversized output and unsupported responses.
    pub fn git_status(&self, token: &str) -> Result<GitStatusDto, RepositoryError> {
        let mut sessions = self.sessions.lock().map_err(|_| registry_error())?;
        let session = sessions.by_id.get_mut(token).ok_or_else(invalid_session)?;
        let root = RepoRoot::open(&session.root.0)?;
        if root != session.root {
            return Err(stale_resource());
        }
        let executable = git::find_git_executable(&root.0)?;
        let (args, disabled) = inspection_args(&executable, &root.0)?;
        let (mut status, changes) = status_command(&executable, &root.0, &args)?;
        let mut registered = HashMap::new();
        for change in changes {
            validate_path(&root, &change.path)?;
            if let Some(original) = &change.original_path {
                validate_path(&root, original)?;
            }
            let id = Uuid::new_v4().to_string();
            status.files.push(GitFileDto {
                file_id: id.clone(),
                committable: !session.git_recovery
                    && session.suite_recovery.is_none()
                    && super::git_commit::product_change(
                        &root,
                        &session.opened,
                        &change,
                        &executable,
                    )
                    .unwrap_or(false)
                    && super::git_commit::safe_contents(&root, &change),
                path: change.path.clone(),
                original_path: change.original_path.clone(),
                index: change.index.to_string(),
                worktree: change.worktree.to_string(),
                unmerged: change.unmerged,
                submodule: change.submodule,
            });
            registered.insert(id, change);
        }
        status.filters_disabled = disabled;
        session.git_snapshot = Some(super::git_commit::snapshot(&root, &status, &registered)?);
        session.git_changes = registered;
        status.sync_token = super::git_sync::register_snapshot(session, &executable).ok();
        status.sync_blocked = session.git_sync_blocked
            || session.git_merge.is_some()
            || session.suite_recovery.is_some();
        if session.suite_recovery.is_some() {
            status.sync_token = None;
            status.abort_token = None;
        }
        status.abort_token = session.git_merge.as_ref().map(|merge| merge.token.clone());
        Ok(status)
    }
    /// Reads only a previously registered changed file, with literal pathspecs and bounded output.
    /// # Errors
    /// Refuses stale IDs/state, escaping paths, submodules, oversized content and failed Git reads.
    pub fn git_diff(&self, token: &str, file_id: &str) -> Result<GitDiffDto, RepositoryError> {
        let sessions = self.sessions.lock().map_err(|_| registry_error())?;
        let session = sessions.by_id.get(token).ok_or_else(invalid_session)?;
        let change = session
            .git_changes
            .get(file_id)
            .ok_or_else(invalid_resource)?;
        if change.submodule {
            return Err(invalid_resource());
        }
        let root = RepoRoot::open(&session.root.0)?;
        if root != session.root {
            return Err(stale_resource());
        }
        validate_path(&root, &change.path)?;
        if let Some(original) = &change.original_path {
            validate_path(&root, original)?;
        }
        let executable = git::find_git_executable(&root.0)?;
        let (args, disabled) = inspection_args(&executable, &root.0)?;
        let (_, current) = status_command(&executable, &root.0, &args)?;
        if !current.contains(change) {
            return Err(stale_resource());
        }
        let mut result = GitDiffDto {
            path: change.path.clone(),
            staged: None,
            working_tree: None,
            untracked_content: None,
            binary: false,
            unmerged: change.unmerged,
            filters_disabled: disabled,
        };
        if change.index == '?' {
            let path = root.resolve_existing(&change.path)?;
            if !fs::symlink_metadata(root.0.join(&change.path))
                .map_err(|_| invalid_resource())?
                .file_type()
                .is_file()
            {
                return Err(invalid_resource());
            }
            let file = fs::File::open(path).map_err(|_| invalid_resource())?;
            let mut bytes = Vec::new();
            file.take((MAX_DIFF_BYTES + 1) as u64)
                .read_to_end(&mut bytes)
                .map_err(|_| invalid_resource())?;
            if bytes.len() > MAX_DIFF_BYTES {
                return Err(RepositoryError::new(
                    RepositoryErrorCode::GitOutputTooLarge,
                    "Файл слишком велик для предпросмотра.",
                ));
            }
            if bytes.contains(&0) {
                result.binary = true;
            } else if let Ok(content) = String::from_utf8(bytes) {
                result.untracked_content = Some(content);
            } else {
                result.binary = true;
            }
        } else {
            let base = [
                "diff",
                "--no-ext-diff",
                "--no-textconv",
                "--no-color",
                "--no-renames",
                "--ignore-submodules=all",
            ];
            if change.index != '.' && !change.unmerged {
                let mut command = base.to_vec();
                command.extend(["--cached", "--", &change.path]);
                if let Some(original) = &change.original_path {
                    command.push(original);
                }
                result.staged = Some(invoke(
                    &executable,
                    &root.0,
                    &args,
                    &command,
                    MAX_DIFF_BYTES,
                )?);
            }
            if change.worktree != '.' || change.unmerged {
                let mut command = base.to_vec();
                command.extend(["--", &change.path]);
                result.working_tree = Some(invoke(
                    &executable,
                    &root.0,
                    &args,
                    &command,
                    MAX_DIFF_BYTES,
                )?);
            }
        }
        validate_path(&root, &change.path)?;
        if let Some(original) = &change.original_path {
            validate_path(&root, original)?;
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests;
