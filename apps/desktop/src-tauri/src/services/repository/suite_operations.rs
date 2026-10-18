//! Read-only bounded preview and one-use repository-scoped suite transactions.
use super::{
    RepoSession, RepositoryError, RepositoryErrorCode, RepositoryService, ResourceKind, atomic,
    create, invalid_resource, invalid_session, registry_error, resolve_directory,
};
use atomic::suite as guarded;
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, io, path::Path};
use uuid::Uuid;
mod transaction;

const MAX_ENTRIES: usize = 1000;
const MAX_BYTES: usize = 32 * 1024 * 1024;
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum SuiteAction {
    Duplicate {
        parent_resource_id: Option<String>,
        name: String,
    },
    Move {
        parent_resource_id: Option<String>,
    },
    Rename {
        name: String,
    },
    Delete,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SuiteOperation {
    pub workspace_path: String,
    pub resource_id: String,
    pub action: SuiteAction,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestEntry {
    pub path: String,
    pub kind: &'static str,
    pub revision: String,
    pub size: usize,
    #[serde(skip)]
    pub bytes: Vec<u8>,
    #[serde(skip)]
    pub identity: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuitePreview {
    pub confirmation: String,
    pub source_path: String,
    pub destination_path: Option<String>,
    pub entries: Vec<ManifestEntry>,
    pub total_bytes: usize,
    pub permanent_delete: bool,
}
#[derive(Debug, Clone)]
pub(super) struct SuitePlan {
    pub preview: SuitePreview,
    pub action: SuiteAction,
    pub workspace: String,
    pub config_revision: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuiteApplyResult {
    pub outcome: &'static str,
    pub path: Option<String>,
    pub recovery: Option<SuiteRecovery>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuiteRecovery {
    pub transaction_path: String,
    pub removed_paths: Vec<String>,
    pub remaining_paths: Vec<String>,
}
fn error(code: RepositoryErrorCode) -> RepositoryError {
    RepositoryError::new(
        code,
        "Операция с папкой остановлена; проверьте подтверждённые пути и состояние репозитория.",
    )
}
fn blocked() -> RepositoryError {
    error(RepositoryErrorCode::InvalidSuiteOperation)
}
pub(super) fn valid_path(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= 1024
        && !path.contains(['\\', ':', '\0'])
        && path.split('/').all(|part| {
            !part.is_empty()
                && part != "."
                && part != ".."
                && !part.eq_ignore_ascii_case(".git")
                && !part.eq_ignore_ascii_case(".casewright")
                && !part.chars().any(char::is_control)
        })
}
fn relative(parent: &str, name: &str) -> String {
    if parent.is_empty() {
        name.into()
    } else {
        format!("{parent}/{name}")
    }
}
fn config_revision(root: &Path) -> Result<String, RepositoryError> {
    guarded::read_regular(&root.join(".casewright/config.yaml"))
        .map(|bytes| atomic::revision(&bytes))
        .map_err(|_| blocked())
}
fn no_entry(path: &Path) -> bool {
    matches!(fs::symlink_metadata(path), Err(error) if error.kind() == io::ErrorKind::NotFound)
}
fn safe_metadata(path: &Path) -> Result<fs::Metadata, RepositoryError> {
    let metadata = fs::symlink_metadata(path).map_err(|_| blocked())?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(blocked());
        }
    }
    if metadata.file_type().is_symlink() || (!metadata.is_dir() && !metadata.is_file()) {
        return Err(blocked());
    }
    Ok(metadata)
}
fn scan(root: &Path, source: &str, with_note: bool) -> Result<Vec<ManifestEntry>, RepositoryError> {
    let mut entries = Vec::new();
    let mut bytes = 0;
    scan_entry(root, source, 0, &mut entries, &mut bytes)?;
    let note = format!("{source}.md");
    if with_note && !no_entry(&root.join(&note)) {
        scan_entry(root, &note, 0, &mut entries, &mut bytes)?;
    }
    Ok(entries)
}
fn scan_entry(
    root: &Path,
    path: &str,
    depth: usize,
    entries: &mut Vec<ManifestEntry>,
    total: &mut usize,
) -> Result<(), RepositoryError> {
    if depth > 64 || entries.len() >= MAX_ENTRIES || !valid_path(path) {
        return Err(blocked());
    }
    let metadata = safe_metadata(&root.join(path))?;
    if metadata.is_dir() {
        let children = guarded::children(&root.join(path)).map_err(|_| blocked())?;
        let stamp = format!("{:?}:{children:?}", metadata.modified().ok());
        entries.push(ManifestEntry {
            path: path.into(),
            kind: "directory",
            revision: atomic::revision(stamp.as_bytes()),
            size: 0,
            bytes: Vec::new(),
            identity: guarded::object_identity(&root.join(path), true).map_err(|_| blocked())?,
        });
        for name in children {
            scan_entry(root, &relative(path, &name), depth + 1, entries, total)?;
        }
    } else {
        let data = guarded::read_regular(&root.join(path)).map_err(|_| blocked())?;
        *total = total.checked_add(data.len()).ok_or_else(blocked)?;
        if *total > MAX_BYTES {
            return Err(blocked());
        }
        entries.push(ManifestEntry {
            path: path.into(),
            kind: "file",
            revision: atomic::revision(&data),
            size: data.len(),
            bytes: data,
            identity: guarded::object_identity(&root.join(path), false).map_err(|_| blocked())?,
        });
    }
    Ok(())
}
fn same_manifest(expected: &[ManifestEntry], actual: &[ManifestEntry]) -> bool {
    expected.len() == actual.len()
        && expected.iter().zip(actual).all(|(a, b)| {
            a.path == b.path
                && a.kind == b.kind
                && a.revision == b.revision
                && a.identity == b.identity
        })
}
fn classify(entries: &mut [ManifestEntry]) {
    let root = entries
        .first()
        .map(|entry| entry.path.clone())
        .unwrap_or_default();
    let directories: HashSet<_> = entries
        .iter()
        .filter(|entry| entry.kind == "directory")
        .map(|entry| entry.path.clone())
        .collect();
    for entry in entries {
        if entry.kind == "file" {
            let tail = entry
                .path
                .strip_prefix(&root)
                .unwrap_or(&entry.path)
                .trim_start_matches('/');
            let hidden_parent = tail
                .rsplit_once('/')
                .is_some_and(|(parent, _)| parent.split('/').any(|part| part.starts_with('.')));
            entry.kind = if entry.path.ends_with("/.order") {
                "order"
            } else if hidden_parent {
                "unknown"
            } else if entry.path.rsplit('/').next() == Some("_suite.md")
                || entry
                    .path
                    .strip_suffix(".md")
                    .is_some_and(|stem| directories.contains(stem))
            {
                "note"
            } else if entry.path.strip_suffix(".md").is_some() {
                "case"
            } else {
                "unknown"
            };
        }
    }
}
fn operation_paths(
    session: &RepoSession,
    request: &SuiteOperation,
) -> Result<(String, Option<String>), RepositoryError> {
    let source = session
        .resources
        .get(&request.resource_id)
        .ok_or_else(invalid_resource)?;
    if source.kind != ResourceKind::Folder
        || resolve_directory(&session.root, &source.relative)? != source.canonical
        || !valid_path(&source.relative)
    {
        return Err(blocked());
    }
    let source_path = source.relative.clone();
    if request.workspace_path.len() > 1024
        || !session
            .opened
            .workspaces
            .iter()
            .any(|workspace| workspace.path == request.workspace_path)
        || (!request.workspace_path.is_empty()
            && !source_path.starts_with(&format!("{}/", request.workspace_path)))
        || session.opened.workspaces.iter().any(|workspace| {
            !workspace.path.is_empty()
                && (workspace.path == source_path
                    || workspace.path.starts_with(&format!("{source_path}/")))
        })
    {
        return Err(blocked());
    }
    let owner = |path: &str| {
        session
            .opened
            .workspaces
            .iter()
            .filter(|workspace| {
                workspace.path.is_empty()
                    || path == workspace.path
                    || path.starts_with(&format!("{}/", workspace.path))
            })
            .max_by_key(|workspace| workspace.path.len())
            .map(|workspace| workspace.path.as_str())
    };
    if owner(&source_path) != Some(request.workspace_path.as_str()) {
        return Err(blocked());
    }
    let name = source_path.rsplit('/').next().ok_or_else(blocked)?;
    let source_parent = source_path
        .rsplit_once('/')
        .map_or("", |(parent, _)| parent);
    let destination = match &request.action {
        SuiteAction::Delete => None,
        SuiteAction::Rename { name } => {
            if !super::names::portable_name(name) {
                return Err(blocked());
            }
            Some(relative(source_parent, name))
        }
        SuiteAction::Move { parent_resource_id } => Some(relative(
            &create::destination(
                session,
                &request.workspace_path,
                parent_resource_id.as_deref(),
            )?,
            name,
        )),
        SuiteAction::Duplicate {
            parent_resource_id,
            name,
        } => {
            if !super::names::portable_name(name) {
                return Err(blocked());
            }
            Some(relative(
                &create::destination(
                    session,
                    &request.workspace_path,
                    parent_resource_id.as_deref(),
                )?,
                name,
            ))
        }
    };
    if let Some(target) = &destination {
        if owner(target) != Some(request.workspace_path.as_str()) {
            return Err(blocked());
        }
        if !super::names::portable_name(target.rsplit('/').next().ok_or_else(blocked)?)
            || !valid_path(target)
            || !valid_path(&format!("{target}.md"))
            || target == &source_path
            || target.starts_with(&format!("{source_path}/"))
            || !no_entry(&session.root.0.join(target))
            || !no_entry(&session.root.0.join(format!("{target}.md")))
        {
            return Err(blocked());
        }
    }

    Ok((source_path, destination))
}

impl RepositoryService {
    /// Read-only preview; no temporary files or repository writes occur here.
    /// # Errors
    /// Refuses unbounded/unsafe trees, cross-scope targets, collisions and ambiguous duplicate cases.
    pub fn prepare_suite_operation(
        &self,
        token: &str,
        request: &SuiteOperation,
    ) -> Result<SuitePreview, RepositoryError> {
        let mut sessions = self.sessions.lock().map_err(|_| registry_error())?;
        let session = sessions.by_id.get_mut(token).ok_or_else(invalid_session)?;
        super::git_sync::ensure_writable(session)?;
        let (source_path, destination) = operation_paths(session, request)?;
        let mut entries = scan(&session.root.0, &source_path, true)?;
        classify(&mut entries);
        // The external note belongs to this suite even though its directory is not a sibling inside the scan.
        if let Some(entry) = entries
            .iter_mut()
            .find(|entry| entry.path == format!("{source_path}.md"))
        {
            entry.kind = "note";
        }
        for entry in &entries {
            let tail = entry.path.strip_prefix(&source_path).ok_or_else(blocked)?;
            if let Some(target) = &destination
                && !valid_path(&format!("{target}{tail}"))
            {
                return Err(blocked());
            }
            if !valid_path(&format!(".testoritto-suite-{}/tree{tail}", Uuid::nil())) {
                return Err(blocked());
            }
        }
        if matches!(request.action, SuiteAction::Duplicate { .. }) {
            let mut ids = HashSet::new();
            for entry in &mut entries {
                if entry.kind != "case" {
                    continue;
                }
                let raw = std::str::from_utf8(&entry.bytes).map_err(|_| blocked())?;
                let document =
                    crate::domain::formats::CaseDocument::parse(raw).map_err(|_| blocked())?;
                let id = document.model().id.as_ref().ok_or_else(blocked)?;
                if !ids.insert(id.clone())
                    || document.warnings().iter().any(|warning| {
                        matches!(
                            warning.code,
                            crate::domain::formats::CaseWarningCode::DuplicateSection
                                | crate::domain::formats::CaseWarningCode::InvalidId
                                | crate::domain::formats::CaseWarningCode::MissingId
                                | crate::domain::formats::CaseWarningCode::InvalidTags
                                | crate::domain::formats::CaseWarningCode::InvalidStatus
                        )
                    })
                {
                    return Err(blocked());
                }
                let copied = document
                    .duplicate(&Uuid::new_v4().to_string())
                    .and_then(|document| document.to_text())
                    .map_err(|_| blocked())?;
                entry.bytes = copied.into_bytes();
                if entry.bytes.len() > super::MAX_REPOSITORY_FILE_BYTES {
                    return Err(blocked());
                }
            }
        }
        if entries.iter().map(|entry| entry.bytes.len()).sum::<usize>() > MAX_BYTES {
            return Err(blocked());
        }
        let preview = SuitePreview {
            confirmation: Uuid::new_v4().to_string(),
            source_path,
            destination_path: destination,
            total_bytes: entries.iter().map(|entry| entry.size).sum(),
            entries,
            permanent_delete: matches!(request.action, SuiteAction::Delete),
        };
        session.suite_plan = Some(SuitePlan {
            preview: preview.clone(),
            action: request.action.clone(),
            workspace: request.workspace_path.clone(),
            config_revision: config_revision(&session.root.0)?,
        });
        Ok(preview)
    }
    /// Applies only the one-use preview admitted by the native mutation queue.
    /// # Errors
    /// Refuses stale previews before mutation; partial permanent deletion returns recovery details.
    pub fn apply_suite_operation(
        &self,
        token: &str,
        confirmation: &str,
    ) -> Result<SuiteApplyResult, RepositoryError> {
        let mut sessions = self.sessions.lock().map_err(|_| registry_error())?;
        let session = sessions.by_id.get_mut(token).ok_or_else(invalid_session)?;
        super::git_sync::ensure_writable(session)?;
        let plan = session
            .suite_plan
            .take()
            .filter(|plan| plan.preview.confirmation == confirmation)
            .ok_or_else(blocked)?;
        if config_revision(&session.root.0)? != plan.config_revision
            || !session
                .opened
                .workspaces
                .iter()
                .any(|workspace| workspace.path == plan.workspace)
        {
            return Err(error(RepositoryErrorCode::ExternalChange));
        }
        let mut actual = scan(&session.root.0, &plan.preview.source_path, true)?;
        classify(&mut actual);
        if let Some(entry) = actual
            .iter_mut()
            .find(|entry| entry.path == format!("{}.md", plan.preview.source_path))
        {
            entry.kind = "note";
        }
        if !same_manifest(&plan.preview.entries, &actual) {
            return Err(error(RepositoryErrorCode::ExternalChange));
        }
        if let Some(target) = &plan.preview.destination_path
            && (!no_entry(&session.root.0.join(target))
                || !no_entry(&session.root.0.join(format!("{target}.md"))))
        {
            return Err(blocked());
        }
        let outcome = transaction::apply(session, &plan);
        if let Ok(result) = &outcome
            && result.outcome == "applied"
            && !matches!(plan.action, SuiteAction::Duplicate { .. })
        {
            session.resources.retain(|_, entry| {
                !(entry.relative == plan.preview.source_path
                    || entry
                        .relative
                        .starts_with(&format!("{}/", plan.preview.source_path)))
            });
        }
        outcome
    }
}
pub(super) fn unfinished(root: &Path) -> Vec<String> {
    let Ok(children) = guarded::recovery_names(root) else {
        return vec![".testoritto-suite-recovery-check".into()];
    };
    children
}

#[cfg(test)]
mod tests;
