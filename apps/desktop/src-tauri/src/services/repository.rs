use std::{
    collections::{HashMap, HashSet},
    ffi::OsStr,
    fs::{self, File},
    io::{self, Read},
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::Serialize;
use uuid::Uuid;

use crate::domain::formats::{
    CaseDocument, CaseModel, ConfigDocument, FolderNoteDocument, RunCaseDocument, RunCaseModel,
    RunDetailsDocument, RunDetailsModel, RunWarning,
};

pub(crate) mod atomic;
mod create;
mod create_run;
mod create_suite;
mod names;
mod suite_operations;
pub use create_suite::{SuiteCreation, SuiteCreationDto};
pub use suite_operations::{SuiteAction, SuiteApplyResult, SuiteOperation, SuitePreview};
mod edit;
mod edit_run;
mod edit_run_details;
pub mod watcher;
pub use edit_run::RunCaseEdit;
pub use edit_run_details::RunDetailsEdit;
mod git;
mod git_commit;
mod git_network;
mod git_sync;
pub use git_sync::{GitSyncAction, GitSyncDto};
mod git_inspection;
pub use git_commit::GitCommitDto;
pub use git_inspection::{GitDiffDto, GitStatusDto};
mod initialize;
mod organize;
pub use create_run::{RunCreation, RunCreationDto};
pub use organize::{CaseAction, CaseOperation, CaseOperationDto};
mod path;
pub use create::{CaseCreation, CaseCreationDto, DuplicateSource};
pub use edit::CaseEdit;
use path::RepoRoot;

const MAX_REPOSITORY_FILE_BYTES: usize = 2 * 1024 * 1024;
const MAX_CONFIG_BYTES: usize = 256 * 1024;
const MAX_FOLDER_NOTE_BYTES: usize = 1024 * 1024;
const MAX_GIT_OUTPUT_BYTES: usize = 64 * 1024;
const MAX_CATALOG_ENTRIES: usize = 20_000;
const MAX_CATALOG_DEPTH: usize = 64;
const MAX_CATALOG_READ_BYTES: usize = 32 * 1024 * 1024;
const MAX_ORDER_FILE_BYTES: usize = 256 * 1024;
const MAX_RUN_DETAILS_FILE_BYTES: usize = 1024 * 1024;

/// Opaque read-only view returned when a repository is opened.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenRepositoryDto {
    pub session_id: String,
    pub display_name: String,
    pub needs_initialization: bool,
    pub workspaces: Vec<WorkspaceDto>,
    pub warnings: Vec<RepositoryWarning>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preferred_workspace_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDto {
    pub path: String,
    pub name: String,
    pub display_id_prefix: String,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCatalogDto {
    pub workspace_path: String,
    pub entries: Vec<CatalogEntryDto>,
    pub warnings: Vec<CatalogWarningDto>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseDocumentDto {
    pub model: CaseModel,
    pub warnings: Vec<crate::domain::formats::CaseWarning>,
    pub revision: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogWarningDto {
    pub code: RepositoryWarningCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_id: Option<String>,
}

impl CatalogWarningDto {
    fn new(
        code: RepositoryWarningCode,
        message: impl Into<String>,
        path: Option<String>,
        resource_id: Option<String>,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            path,
            resource_id,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunsCatalogDto {
    pub runs: Vec<RunCatalogEntryDto>,
    pub warnings: Vec<CatalogWarningDto>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCatalogEntryDto {
    pub run_id: String,
    pub name: String,
    pub created: String,
    pub test_date: String,
    pub status: crate::domain::formats::RunStatus,
    pub scope: String,
    pub details_resource_id: Option<String>,
    pub cases: Vec<RunCaseCatalogEntryDto>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCaseCatalogEntryDto {
    pub resource_id: String,
    pub path: String,
    pub case_id: String,
    pub display_id: String,
    pub title: String,
    pub result: crate::domain::formats::RunResult,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind", content = "document")]
pub enum RunResourceDocumentDto {
    Details {
        model: RunDetailsModel,
        warnings: Vec<RunWarning>,
        revision: String,
    },
    Case {
        model: RunCaseModel,
        warnings: Vec<RunWarning>,
        revision: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        snapshot: Option<Box<CaseDocumentDto>>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind",
    content = "metadata"
)]
pub enum CatalogEntryDto {
    Folder {
        node_id: String,
        path: String,
        parent_path: String,
        parent_resource_id: Option<String>,
        order: usize,
        name: String,
        display_id_prefix: String,
        description: String,
    },
    Case {
        resource_id: String,
        path: String,
        parent_path: String,
        parent_resource_id: Option<String>,
        order: usize,
        id: Option<String>,
        display_id: String,
        title: String,
        status: crate::domain::formats::CaseStatus,
        tags: Vec<String>,
        revision: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryWarning {
    pub code: RepositoryWarningCode,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RepositoryWarningCode {
    DuplicateWorkspace,
    MissingWorkspace,
    InvalidWorkspacePath,
    LegacyFormat,
    InvalidEntry,
    InvalidCase,
    DuplicateCaseId,
    InvalidOrder,
    CatalogLimit,
    RecentHistoryUnavailable,
    PreferredWorkspaceUnavailable,
    WatcherUnavailable,
    SuiteRecoveryRequired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RepositoryErrorCode {
    InitializationUnavailable,
    InitializationFailed,
    InvalidCaseEdit,
    InvalidSuiteCreation,
    InvalidSuiteOperation,
    SuiteRecoveryRequired,
    InvalidRunCreation,
    InvalidRunEdit,
    ReadOnlyCase,
    ExternalChange,
    SaveFailed,
    NotGitRepository,
    BareRepository,
    SelectedSubdirectory,
    InvalidRepositoryPath,
    PathEscapesRepository,
    InvalidRelativePath,
    InvalidSession,
    InvalidResource,
    StaleResource,
    InvalidDocument,
    InvalidConfig,
    UnsupportedVersion,
    UnsupportedLegacyFormat,
    InvalidUtf8,
    FileTooLarge,
    Io,
    GitUnavailable,
    GitFailed,
    GitCommitBlocked,
    GitSyncBlocked,
    GitDirty,
    GitNoUpstream,
    GitAuthFailed,
    GitRemoteFailed,
    GitNetworkFailed,
    GitPushRejected,
    GitAbortFailed,
    GitRecoveryRequired,
    GitIdentityMissing,
    GitTimedOut,
    GitOutputTooLarge,
    SessionRegistry,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryError {
    pub code: RepositoryErrorCode,
    pub message: String,
}

impl RepositoryError {
    fn new(code: RepositoryErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for RepositoryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}
impl std::error::Error for RepositoryError {}

#[derive(Debug)]
struct RepoSession {
    root: RepoRoot,
    opened: OpenRepositoryDto,
    resources: HashMap<String, ResourceEntry>,
    git_changes: HashMap<String, git_inspection::GitChange>,
    git_snapshot: Option<git_commit::CommitSnapshot>,
    git_recovery: bool,
    git_sync_blocked: bool,
    git_sync_snapshot: Option<git_sync::SyncSnapshot>,
    git_merge: Option<git_sync::OwnedMerge>,
    _watcher: Option<watcher::RepositoryWatcher>,
    config_invalid: bool,
    suite_plan: Option<suite_operations::SuitePlan>,
    suite_recovery: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum ResourceKind {
    Folder,
    Case,
    RunDetails,
    RunCase,
}

#[derive(Debug, Clone)]
struct ResourceEntry {
    relative: String,
    canonical: PathBuf,
    kind: ResourceKind,
}

#[derive(Debug, Default)]
struct SessionRegistry {
    by_id: HashMap<String, RepoSession>,
    by_root: HashMap<PathBuf, String>,
}

/// In-memory registry: one active token per canonical repo root; writes are serialized.
#[derive(Default)]
pub struct RepositoryService {
    sessions: Mutex<SessionRegistry>,
    event_sink: Option<watcher::EventSink>,
}

impl RepositoryService {
    pub(crate) fn automation_source(
        &self,
        session: &str,
    ) -> Result<crate::services::automation::contracts::Source, RepositoryError> {
        let root = self.canonical_root_for_session(session)?;
        let git = git::find_git_executable(&root)?;
        let commit = git::run_git(&git, &root, &["rev-parse", "--verify", "HEAD"])
            .ok()
            .map(|s| s.trim().to_owned());
        let branch = git::run_git(&git, &root, &["symbolic-ref", "--quiet", "--short", "HEAD"])
            .ok()
            .map(|s| s.trim().to_owned());
        let dirty = !git::run_git(
            &git,
            &root,
            &["status", "--porcelain=v1", "--untracked-files=normal"],
        )?
        .trim()
        .is_empty();
        Ok(crate::services::automation::contracts::Source {
            commit,
            branch,
            dirty,
        })
    }
    pub(crate) fn with_event_sink(event_sink: watcher::EventSink) -> Self {
        Self {
            sessions: Mutex::default(),
            event_sink: Some(event_sink),
        }
    }
    /// Reloads configuration without discarding resource identity or app-owned Git recovery.
    /// # Errors
    /// Invalid sessions/configurations return typed errors and remain unwritable.
    pub fn refresh_metadata(&self, token: &str) -> Result<OpenRepositoryDto, RepositoryError> {
        let mut sessions = self.sessions.lock().map_err(|_| registry_error())?;
        let session = sessions.by_id.get_mut(token).ok_or_else(invalid_session)?;
        let metadata = match load_open_metadata(&session.root) {
            Ok(metadata) => metadata,
            Err(error) => {
                session.config_invalid = true;
                return Err(error);
            }
        };
        session.config_invalid = false;
        session.opened.display_name = metadata.display_name;
        session.opened.needs_initialization = metadata.needs_initialization;
        // Revoke resources issued by removed workspace scopes, retaining IDs in unchanged scopes.
        session.resources.retain(|_, resource| {
            if matches!(
                resource.kind,
                ResourceKind::RunCase | ResourceKind::RunDetails
            ) {
                return true;
            }
            let owner = session
                .opened
                .workspaces
                .iter()
                .filter(|workspace| {
                    workspace.path.is_empty()
                        || resource.relative == workspace.path
                        || resource
                            .relative
                            .starts_with(&format!("{}/", workspace.path))
                })
                .max_by_key(|workspace| workspace.path.len());
            owner.is_some_and(|workspace| {
                metadata
                    .workspaces
                    .iter()
                    .any(|next| next.path == workspace.path)
            })
        });
        let sticky_warnings: Vec<_> = session
            .opened
            .warnings
            .iter()
            .filter(|warning| {
                matches!(
                    warning.code,
                    RepositoryWarningCode::WatcherUnavailable
                        | RepositoryWarningCode::SuiteRecoveryRequired
                )
            })
            .cloned()
            .collect();
        session.opened.workspaces = metadata.workspaces;
        session.opened.warnings = metadata.warnings;
        session.opened.warnings.extend(sticky_warnings);
        session.opened.preferred_workspace_path = None;
        Ok(session.opened.clone())
    }

    /// Validates and opens a native-selected Git root without creating or modifying files.
    ///
    /// # Errors
    /// Returns a typed diagnostic if Git/root/configuration/path validation fails.
    pub fn open(&self, selected: impl AsRef<Path>) -> Result<OpenRepositoryDto, RepositoryError> {
        let root = RepoRoot::open(selected.as_ref())?;
        let mut sessions = self.sessions.lock().map_err(|_| {
            RepositoryError::new(
                RepositoryErrorCode::SessionRegistry,
                "Не удалось получить доступ к registry репозиториев.",
            )
        })?;
        if let Some(token) = sessions.by_root.get(&root.0)
            && let Some(session) = sessions.by_id.get(token)
        {
            return Ok(session.opened.clone());
        }
        let metadata = load_open_metadata(&root)?;
        let session_id = Uuid::new_v4().to_string();
        let mut opened = OpenRepositoryDto {
            session_id: session_id.clone(),
            display_name: metadata.display_name,
            needs_initialization: metadata.needs_initialization,
            workspaces: metadata.workspaces,
            warnings: metadata.warnings,
            preferred_workspace_path: None,
        };
        let recovery_paths = suite_operations::unfinished(&root.0);
        for path in &recovery_paths {
            opened.warnings.push(RepositoryWarning { code: RepositoryWarningCode::SuiteRecoveryRequired, message: format!("Незавершённая операция с папкой: {path}. Запись и Git заблокированы до внешней проверки и переоткрытия.") });
        }
        let watcher = self.event_sink.as_ref().and_then(|sink| {
            if let Ok(watcher) = watcher::RepositoryWatcher::start(
                &root.0,
                session_id.clone(),
                std::sync::Arc::clone(sink),
            ) {
                Some(watcher)
            } else {
                opened.warnings.push(RepositoryWarning {
                    code: RepositoryWarningCode::WatcherUnavailable,
                    message: "Наблюдение недоступно; обновляйте репозиторий вручную.".into(),
                });
                None
            }
        });
        sessions.by_root.insert(root.0.clone(), session_id.clone());
        sessions.by_id.insert(
            session_id,
            RepoSession {
                root,
                opened: opened.clone(),
                resources: HashMap::new(),
                git_changes: HashMap::new(),
                git_snapshot: None,
                git_recovery: false,
                git_sync_blocked: false,
                git_sync_snapshot: None,
                git_merge: None,
                _watcher: watcher,
                config_invalid: false,
                suite_plan: None,
                suite_recovery: recovery_paths.first().cloned(),
            },
        );
        Ok(opened)
    }

    /// Returns a validated session's canonical root for backend-only preference persistence.
    ///
    /// # Errors
    /// Returns `InvalidSession` when the token is unknown or closed.
    pub(crate) fn canonical_root_for_session(
        &self,
        token: &str,
    ) -> Result<PathBuf, RepositoryError> {
        let sessions = self.sessions.lock().map_err(|_| registry_error())?;
        sessions
            .by_id
            .get(token)
            .map(|session| session.root.0.clone())
            .ok_or_else(invalid_session)
    }

    /// Rechecks that a path is both a currently declared workspace and still resolves
    /// inside the session root to an existing directory. Returns its canonical declared spelling.
    pub(crate) fn declared_workspace_for_session(
        &self,
        token: &str,
        workspace_path: &str,
    ) -> Result<String, RepositoryError> {
        let sessions = self.sessions.lock().map_err(|_| registry_error())?;
        let session = sessions.by_id.get(token).ok_or_else(invalid_session)?;
        let declared = session
            .opened
            .workspaces
            .iter()
            .find(|workspace| workspace.path == workspace_path)
            .map(|workspace| workspace.path.clone())
            .ok_or_else(|| {
                RepositoryError::new(
                    RepositoryErrorCode::InvalidRelativePath,
                    "Workspace не объявлен в открытом репозитории.",
                )
            })?;
        let resolved = if declared.is_empty() {
            session.root.0.clone()
        } else {
            resolve_directory(&session.root, &declared)?
        };
        if !resolved.is_dir() {
            return Err(RepositoryError::new(
                RepositoryErrorCode::InvalidRelativePath,
                "Workspace больше не является каталогом.",
            ));
        }
        Ok(declared)
    }

    /// Reads a bounded UTF-8 file strictly inside the opened repository.
    ///
    /// # Errors
    /// Returns a diagnostic for unknown sessions, unsafe paths, invalid UTF-8, or oversized files.
    pub fn read_text(&self, token: &str, relative: &str) -> Result<String, RepositoryError> {
        let sessions = self.sessions.lock().map_err(|_| {
            RepositoryError::new(
                RepositoryErrorCode::SessionRegistry,
                "Не удалось получить доступ к registry репозиториев.",
            )
        })?;
        let session = sessions.by_id.get(token).ok_or_else(invalid_session)?;
        let path = session.root.resolve_existing(relative)?;
        read_utf8_limited(&path, MAX_REPOSITORY_FILE_BYTES)
    }

    /// Catalogs one declared workspace and registers opaque case resources for later reads.
    ///
    /// # Errors
    /// Returns an error for unknown sessions/workspaces or unsafe, changed workspace paths.
    pub fn catalog_workspace(
        &self,
        token: &str,
        workspace_path: &str,
    ) -> Result<WorkspaceCatalogDto, RepositoryError> {
        let mut sessions = self.sessions.lock().map_err(|_| registry_error())?;
        let session = sessions.by_id.get_mut(token).ok_or_else(invalid_session)?;
        validate_current_metadata(session)?;
        let workspace_path = session
            .opened
            .workspaces
            .iter()
            .find(|item| item.path == workspace_path)
            .map(|item| item.path.clone())
            .ok_or_else(|| {
                RepositoryError::new(
                    RepositoryErrorCode::InvalidRelativePath,
                    "Workspace не объявлен в открытом репозитории.",
                )
            })?;
        let resolved = if workspace_path.is_empty() {
            session.root.0.clone()
        } else {
            resolve_directory(&session.root, &workspace_path)?
        };
        if !resolved.is_dir() {
            return Err(RepositoryError::new(
                RepositoryErrorCode::InvalidRelativePath,
                "Workspace больше не является каталогом.",
            ));
        }
        let mut state = CatalogState {
            entries: Vec::new(),
            warnings: Vec::new(),
            bytes_read: 0,
            case_ids: HashSet::new(),
            resources: HashMap::new(),
            visited_entries: 0,
            scan_stopped: false,
            limit_reported: false,
            resource_warnings: Vec::new(),
        };
        walk_workspace(
            &session.root,
            &resolved,
            &workspace_path,
            None,
            &mut state,
            0,
        )?;
        let ids = reuse_resource_ids(&session.resources, &mut state.resources);
        for entry in &mut state.entries {
            let (id, parent) = match entry {
                CatalogEntryDto::Folder {
                    node_id,
                    parent_resource_id,
                    ..
                } => (node_id, parent_resource_id),
                CatalogEntryDto::Case {
                    resource_id,
                    parent_resource_id,
                    ..
                } => (resource_id, parent_resource_id),
            };
            remap_id(id, &ids);
            if let Some(parent) = parent {
                remap_id(parent, &ids);
            }
        }
        remap_warnings(&mut state.warnings, &ids);
        remap_warnings(&mut state.resource_warnings, &ids);
        session.resources.retain(|_, resource| {
            !matches!(resource.kind, ResourceKind::Case | ResourceKind::Folder)
                || (!workspace_path.is_empty()
                    && resource.relative != workspace_path
                    && !resource.relative.starts_with(&format!("{workspace_path}/")))
        });
        session.resources.extend(state.resources);
        Ok(WorkspaceCatalogDto {
            workspace_path,
            entries: state.entries,
            warnings: state
                .warnings
                .into_iter()
                .chain(state.resource_warnings)
                .collect(),
        })
    }

    /// Reads a case only through a resource registered by `catalog_workspace`.
    ///
    /// # Errors
    /// Returns an error for unknown sessions/resources, stale paths, or invalid documents.
    pub fn read_case(
        &self,
        token: &str,
        resource_id: &str,
    ) -> Result<CaseDocumentDto, RepositoryError> {
        let sessions = self.sessions.lock().map_err(|_| registry_error())?;
        let session = sessions.by_id.get(token).ok_or_else(invalid_session)?;
        validate_current_metadata(session)?;
        let resource = session
            .resources
            .get(resource_id)
            .ok_or_else(invalid_resource)?;
        if resource.kind != ResourceKind::Case {
            return Err(invalid_resource());
        }
        let path = match resolve_regular_file(&session.root, &resource.relative) {
            Ok(path) => path,
            Err(error)
                if matches!(
                    error.code,
                    RepositoryErrorCode::PathEscapesRepository
                        | RepositoryErrorCode::InvalidRelativePath
                ) =>
            {
                return Err(stale_resource());
            }
            Err(error) => return Err(error),
        };
        if path != resource.canonical {
            return Err(stale_resource());
        }
        let text = read_utf8_limited(&path, MAX_REPOSITORY_FILE_BYTES)?;
        let document = CaseDocument::parse(&text).map_err(|error| {
            RepositoryError::new(RepositoryErrorCode::InvalidDocument, error.message)
        })?;
        Ok(CaseDocumentDto {
            model: document.model().clone(),
            warnings: document.warnings().to_vec(),
            revision: atomic::revision(text.as_bytes()),
        })
    }

    /// Catalogs the repository-level run folders and registers their typed Markdown resources.
    ///
    /// # Errors
    /// Returns an error for an unknown session or an unsafe runs root.
    #[allow(clippy::too_many_lines)] // Kept local until catalog DTO traversal is split into private modules.
    pub fn catalog_runs(&self, token: &str) -> Result<RunsCatalogDto, RepositoryError> {
        let mut sessions = self.sessions.lock().map_err(|_| registry_error())?;
        let session = sessions.by_id.get_mut(token).ok_or_else(invalid_session)?;
        validate_current_metadata(session)?;
        let runs_root = match resolve_optional_directory(&session.root, ".casewright/runs") {
            Ok(Some(path)) => path,
            Ok(None) => {
                session.resources.retain(|_, resource| {
                    !matches!(
                        resource.kind,
                        ResourceKind::RunDetails | ResourceKind::RunCase
                    )
                });
                return Ok(RunsCatalogDto {
                    runs: Vec::new(),
                    warnings: Vec::new(),
                });
            }
            Err(error) => return Err(error),
        };
        let mut state = RunsCatalogState {
            runs: Vec::new(),
            warnings: Vec::new(),
            bytes_read: 0,
            resources: HashMap::new(),
            visited_entries: 0,
            scan_stopped: false,
            limit_reported: false,
            resource_warnings: Vec::new(),
        };
        let mut directories = read_visible_directories(&runs_root, ".casewright/runs", &mut state)?;
        directories.sort_by(|a, b| compare_names(&a.0, &b.0));
        for (stem, directory) in directories {
            if state.scan_stopped {
                break;
            }
            if state.resources.len() >= MAX_CATALOG_ENTRIES {
                report_catalog_limit(
                    &mut state.scan_stopped,
                    &mut state.limit_reported,
                    &mut state.warnings,
                    "Превышен лимит run resource IDs.",
                );
                break;
            }
            if state.scan_stopped {
                break;
            }
            if state.runs.len() >= MAX_CATALOG_ENTRIES {
                state
                    .warnings
                    .push(limit_warning("Превышено максимальное число run folders."));
                break;
            }
            let run_relative = format!(".casewright/runs/{stem}");
            let canonical_run_dir = match session.root.resolve_existing(&run_relative) {
                Ok(path) if path == directory && path.is_dir() => path,
                Ok(_) => {
                    state.warnings.push(invalid_entry_warning(
                        &run_relative,
                        "Run directory изменился после перечисления; обновите каталог.",
                    ));
                    continue;
                }
                Err(error) => {
                    state
                        .warnings
                        .push(invalid_entry_warning(&run_relative, error.message));
                    continue;
                }
            };
            let details_relative = format!("{run_relative}/_run.md");
            let (details_resource_id, details) =
                match resolve_optional_regular_file(&session.root, &details_relative) {
                    Ok(None) => (None, RunDetailsModel::default()),
                    Ok(Some(path)) => {
                        match catalog_read(
                            &path,
                            &details_relative,
                            MAX_RUN_DETAILS_FILE_BYTES,
                            &mut state.bytes_read,
                            &mut state.warnings,
                            &mut state.scan_stopped,
                            &mut state.limit_reported,
                        ) {
                            Ok(raw) if !raw.is_empty() => match RunDetailsDocument::parse(&raw) {
                                Ok(document) => {
                                    for warning in document.warnings() {
                                        state.warnings.push(CatalogWarningDto::new(
                                            RepositoryWarningCode::InvalidEntry,
                                            format!("`{details_relative}`: {}", warning.message),
                                            Some(details_relative.clone()),
                                            None,
                                        ));
                                    }
                                    let id = Uuid::new_v4().to_string();
                                    state.resources.insert(
                                        id.clone(),
                                        ResourceEntry {
                                            relative: details_relative.clone(),
                                            canonical: path,
                                            kind: ResourceKind::RunDetails,
                                        },
                                    );
                                    (Some(id), document.model().clone())
                                }
                                Err(error) => {
                                    state.warnings.push(invalid_resource_warning(
                                        &details_relative,
                                        error.message,
                                    ));
                                    (None, RunDetailsModel::default())
                                }
                            },
                            Ok(_) => (None, RunDetailsModel::default()),
                            Err(error) => {
                                state.warnings.push(invalid_resource_warning(
                                    &details_relative,
                                    error.message,
                                ));
                                (None, RunDetailsModel::default())
                            }
                        }
                    }
                    Err(error) => {
                        state
                            .warnings
                            .push(invalid_resource_warning(&details_relative, error.message));
                        (None, RunDetailsModel::default())
                    }
                };
            if state.scan_stopped {
                break;
            }
            let mut case_files =
                read_visible_markdown_files(&canonical_run_dir, &run_relative, &mut state)?;
            case_files.retain(|(name, _)| name != "_run.md");
            let order_relative = format!("{run_relative}/.order");
            match resolve_optional_regular_file(&session.root, &order_relative) {
                Ok(Some(order_path)) => {
                    match catalog_read(
                        &order_path,
                        &order_relative,
                        MAX_ORDER_FILE_BYTES,
                        &mut state.bytes_read,
                        &mut state.warnings,
                        &mut state.scan_stopped,
                        &mut state.limit_reported,
                    ) {
                        Ok(raw) => match crate::domain::formats::OrderDocument::parse(&raw) {
                            Ok(order) => {
                                let indexed: HashMap<_, _> = case_files
                                    .iter()
                                    .map(|(name, path)| {
                                        (
                                            name.strip_suffix(".md").unwrap_or(name).to_owned(),
                                            (name.clone(), path.clone()),
                                        )
                                    })
                                    .collect();
                                let mut ordered = Vec::new();
                                let mut seen = HashSet::new();
                                for key in order.keys() {
                                    if let Some(value) = indexed.get(key)
                                        && seen.insert(key.clone())
                                    {
                                        ordered.push(value.clone());
                                    }
                                }
                                for file in &case_files {
                                    if seen.insert(
                                        file.0.strip_suffix(".md").unwrap_or(&file.0).to_owned(),
                                    ) {
                                        ordered.push(file.clone());
                                    }
                                }
                                case_files = ordered;
                            }
                            Err(error) => state
                                .warnings
                                .push(invalid_order_warning(&order_relative, error.message)),
                        },
                        Err(error) => state
                            .warnings
                            .push(invalid_order_warning(&order_relative, error.message)),
                    }
                }
                Ok(None) => {}
                Err(error) => state
                    .warnings
                    .push(invalid_order_warning(&order_relative, error.message)),
            }
            if state.scan_stopped {
                break;
            }
            let mut cases = Vec::new();
            for (name, path) in case_files {
                if state.scan_stopped {
                    break;
                }
                if state.resources.len() >= MAX_CATALOG_ENTRIES {
                    report_catalog_limit(
                        &mut state.scan_stopped,
                        &mut state.limit_reported,
                        &mut state.warnings,
                        "Превышен лимит run resource IDs.",
                    );
                    break;
                }
                let relative = format!("{run_relative}/{name}");
                let canonical_path = match resolve_regular_file(&session.root, &relative) {
                    Ok(canonical) if canonical == path => canonical,
                    Ok(_) => {
                        state.warnings.push(invalid_entry_warning(
                            &relative,
                            "Sidecar изменился после перечисления; обновите каталог.",
                        ));
                        continue;
                    }
                    Err(error) => {
                        state
                            .warnings
                            .push(invalid_entry_warning(&relative, error.message));
                        continue;
                    }
                };
                match catalog_read(
                    &canonical_path,
                    &relative,
                    MAX_REPOSITORY_FILE_BYTES,
                    &mut state.bytes_read,
                    &mut state.warnings,
                    &mut state.scan_stopped,
                    &mut state.limit_reported,
                ) {
                    Ok(raw) => match RunCaseDocument::parse(&raw) {
                        Ok(document) => {
                            let resource_id = Uuid::new_v4().to_string();
                            for warning in document.warnings() {
                                state.resource_warnings.push(CatalogWarningDto {
                                    code: RepositoryWarningCode::InvalidCase,
                                    message: format!("`{relative}`: {}", warning.message),
                                    path: Some(relative.clone()),
                                    resource_id: Some(resource_id.clone()),
                                });
                            }
                            state.resources.insert(
                                resource_id.clone(),
                                ResourceEntry {
                                    relative: relative.clone(),
                                    canonical: canonical_path,
                                    kind: ResourceKind::RunCase,
                                },
                            );
                            let model = document.model();
                            cases.push(RunCaseCatalogEntryDto {
                                resource_id,
                                path: relative,
                                case_id: model.case_id.clone(),
                                display_id: model.display_id.clone(),
                                title: model.title.clone(),
                                result: model.result,
                            });
                        }
                        Err(error) => state
                            .warnings
                            .push(invalid_resource_warning(&relative, error.message)),
                    },
                    Err(error) => state
                        .warnings
                        .push(invalid_resource_warning(&relative, error.message)),
                }
            }
            let date_prefix =
                stem.get(..10)
                    .filter(|prefix| {
                        prefix.as_bytes().get(4) == Some(&b'-')
                            && prefix.as_bytes().get(7) == Some(&b'-')
                            && prefix.bytes().enumerate().all(|(index, byte)| {
                                matches!(index, 4 | 7) || byte.is_ascii_digit()
                            })
                    })
                    .unwrap_or("");
            let created = if details.created.is_empty() {
                date_prefix.to_owned()
            } else {
                details.created.clone()
            };
            let test_date = if !details.test_date.is_empty() {
                details.test_date.clone()
            } else if !created.is_empty() {
                created.clone()
            } else {
                date_prefix.to_owned()
            };
            state.runs.push(RunCatalogEntryDto {
                run_id: run_relative,
                name: if details.name.is_empty() {
                    stem
                } else {
                    details.name
                },
                created,
                test_date,
                status: details.status,
                scope: details.scope,
                details_resource_id,
                cases,
            });
        }
        state.runs.sort_by(|a, b| {
            b.created
                .cmp(&a.created)
                .then_with(|| b.run_id.cmp(&a.run_id))
        });
        let ids = reuse_resource_ids(&session.resources, &mut state.resources);
        for run in &mut state.runs {
            if let Some(id) = &mut run.details_resource_id {
                remap_id(id, &ids);
            }
            for case in &mut run.cases {
                remap_id(&mut case.resource_id, &ids);
            }
        }
        remap_warnings(&mut state.warnings, &ids);
        remap_warnings(&mut state.resource_warnings, &ids);
        session.resources.retain(|_, resource| {
            !matches!(
                resource.kind,
                ResourceKind::RunDetails | ResourceKind::RunCase
            )
        });
        session.resources.extend(state.resources);
        Ok(RunsCatalogDto {
            runs: state.runs,
            warnings: state
                .warnings
                .into_iter()
                .chain(state.resource_warnings)
                .collect(),
        })
    }

    /// Reads a run detail document or per-case snapshot only through catalog resource IDs.
    ///
    /// # Errors
    /// Returns an error for unknown sessions/resources, stale paths, or invalid documents.
    pub fn read_run(
        &self,
        token: &str,
        resource_id: &str,
    ) -> Result<RunResourceDocumentDto, RepositoryError> {
        let sessions = self.sessions.lock().map_err(|_| registry_error())?;
        let session = sessions.by_id.get(token).ok_or_else(invalid_session)?;
        validate_current_metadata(session)?;
        let resource = session
            .resources
            .get(resource_id)
            .ok_or_else(invalid_resource)?;
        let (limit, details) = match resource.kind {
            ResourceKind::RunDetails => (MAX_RUN_DETAILS_FILE_BYTES, true),
            ResourceKind::RunCase => (MAX_REPOSITORY_FILE_BYTES, false),
            ResourceKind::Case | ResourceKind::Folder => return Err(invalid_resource()),
        };
        let path = match resolve_regular_file(&session.root, &resource.relative) {
            Ok(path) => path,
            Err(error)
                if matches!(
                    error.code,
                    RepositoryErrorCode::PathEscapesRepository
                        | RepositoryErrorCode::InvalidRelativePath
                ) =>
            {
                return Err(stale_resource());
            }
            Err(error) => return Err(error),
        };
        if path != resource.canonical {
            return Err(stale_resource());
        }
        let raw = read_utf8_limited(&path, limit)?;
        if details {
            let document = RunDetailsDocument::parse(&raw).map_err(|error| {
                RepositoryError::new(RepositoryErrorCode::InvalidDocument, error.message)
            })?;
            Ok(RunResourceDocumentDto::Details {
                model: document.model().clone(),
                warnings: document.warnings().to_vec(),
                revision: atomic::revision(raw.as_bytes()),
            })
        } else {
            let document = RunCaseDocument::parse(&raw).map_err(|error| {
                RepositoryError::new(RepositoryErrorCode::InvalidDocument, error.message)
            })?;
            let mut warnings = document.warnings().to_vec();
            let snapshot = if let Ok(snapshot) =
                create_run::read_snapshot(&session.root, &resource.relative, &document)
            {
                snapshot.map(Box::new)
            } else {
                warnings.push(RunWarning { code: crate::domain::formats::RunWarningCode::InvalidFrontmatter, message: "Snapshot исходника отсутствует, изменён или некорректен; результаты прогона остаются доступны.".into(), line: None });
                None
            };
            Ok(RunResourceDocumentDto::Case {
                model: document.model().clone(),
                warnings,
                snapshot,
                revision: atomic::revision(raw.as_bytes()),
            })
        }
    }

    /// Closes a repository token; another open can create a fresh token afterward.
    ///
    /// # Errors
    /// Returns `InvalidSession` when the token is unknown or already closed.
    pub fn close(&self, token: &str) -> Result<(), RepositoryError> {
        let mut sessions = self.sessions.lock().map_err(|_| {
            RepositoryError::new(
                RepositoryErrorCode::SessionRegistry,
                "Не удалось получить доступ к registry репозиториев.",
            )
        })?;
        let session = sessions.by_id.remove(token).ok_or_else(invalid_session)?;
        sessions.by_root.remove(&session.root.0);
        Ok(())
    }
}

// A catalog refresh must not revoke resource IDs already carried by queued requests.
// Reuse only the same kind, relative path AND canonical target; handlers still revalidate it.
fn reuse_resource_ids(
    old: &HashMap<String, ResourceEntry>,
    fresh: &mut HashMap<String, ResourceEntry>,
) -> HashMap<String, String> {
    let existing: HashMap<_, _> = old
        .iter()
        .map(|(id, entry)| {
            (
                (entry.relative.as_str(), entry.kind),
                (&entry.canonical, id),
            )
        })
        .collect();
    let mut ids = HashMap::new();
    *fresh = std::mem::take(fresh)
        .into_iter()
        .map(|(id, entry)| {
            let replacement = existing
                .get(&(entry.relative.as_str(), entry.kind))
                .filter(|(canonical, _)| **canonical == entry.canonical)
                .map(|(_, id)| (*id).clone());
            if let Some(replacement) = replacement {
                ids.insert(id, replacement.clone());
                (replacement, entry)
            } else {
                (id, entry)
            }
        })
        .collect();
    ids
}
fn remap_id(id: &mut String, ids: &HashMap<String, String>) {
    if let Some(replacement) = ids.get(id) {
        id.clone_from(replacement);
    }
}
fn remap_warnings(warnings: &mut [CatalogWarningDto], ids: &HashMap<String, String>) {
    for warning in warnings {
        if let Some(id) = &mut warning.resource_id {
            remap_id(id, ids);
        }
    }
}

struct CatalogState {
    entries: Vec<CatalogEntryDto>,
    warnings: Vec<CatalogWarningDto>,
    bytes_read: usize,
    case_ids: HashSet<String>,
    resources: HashMap<String, ResourceEntry>,
    visited_entries: usize,
    scan_stopped: bool,
    limit_reported: bool,
    resource_warnings: Vec<CatalogWarningDto>,
}

struct RunsCatalogState {
    runs: Vec<RunCatalogEntryDto>,
    warnings: Vec<CatalogWarningDto>,
    bytes_read: usize,
    resources: HashMap<String, ResourceEntry>,
    visited_entries: usize,
    scan_stopped: bool,
    limit_reported: bool,
    resource_warnings: Vec<CatalogWarningDto>,
}

fn catalog_read(
    path: &Path,
    relative: &str,
    per_file_limit: usize,
    total_read: &mut usize,
    warnings: &mut Vec<CatalogWarningDto>,
    stopped: &mut bool,
    reported: &mut bool,
) -> Result<String, RepositoryError> {
    catalog_read_with_limit(
        path,
        relative,
        per_file_limit,
        MAX_CATALOG_READ_BYTES,
        total_read,
        warnings,
        stopped,
        reported,
    )
}

#[allow(clippy::too_many_arguments)] // Tiny-limit test seam keeps production counters local to each catalog call.
fn catalog_read_with_limit(
    path: &Path,
    relative: &str,
    per_file_limit: usize,
    total_limit: usize,
    total_read: &mut usize,
    warnings: &mut Vec<CatalogWarningDto>,
    stopped: &mut bool,
    reported: &mut bool,
) -> Result<String, RepositoryError> {
    if *stopped {
        return Err(RepositoryError::new(
            RepositoryErrorCode::FileTooLarge,
            "Общий лимит чтения каталога уже достигнут.",
        ));
    }
    let size = fs::metadata(path)
        .map_err(|error| {
            RepositoryError::new(
                RepositoryErrorCode::Io,
                format!("Не удалось проверить размер `{relative}`: {error}"),
            )
        })?
        .len();
    if !read_budget_allows(
        *total_read,
        usize::try_from(size).unwrap_or(usize::MAX),
        total_limit,
    ) {
        report_catalog_limit(
            stopped,
            reported,
            warnings,
            &format!("Чтение каталога остановлено перед файлом `{relative}` по общему лимиту."),
        );
        return Err(RepositoryError::new(
            RepositoryErrorCode::FileTooLarge,
            "Общий лимит чтения каталога достигнут.",
        ));
    }
    let text = read_utf8_limited(path, per_file_limit)?;
    if !read_budget_allows(*total_read, text.len(), total_limit) {
        report_catalog_limit(
            stopped,
            reported,
            warnings,
            &format!("Чтение каталога остановлено после изменения размера `{relative}`."),
        );
        return Err(RepositoryError::new(
            RepositoryErrorCode::FileTooLarge,
            format!("Общий лимит чтения каталога превышен у `{relative}`."),
        ));
    }
    *total_read += text.len();
    Ok(text)
}

fn read_visible_directories(
    directory: &Path,
    relative: &str,
    state: &mut RunsCatalogState,
) -> Result<Vec<(String, PathBuf)>, RepositoryError> {
    let mut result = Vec::new();
    for entry in fs::read_dir(directory).map_err(|error| {
        RepositoryError::new(
            RepositoryErrorCode::Io,
            format!("Не удалось перечислить `{relative}`: {error}"),
        )
    })? {
        if !count_catalog_entry(
            &mut state.visited_entries,
            &mut state.scan_stopped,
            &mut state.limit_reported,
            &mut state.warnings,
            relative,
        ) {
            break;
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                state
                    .warnings
                    .push(invalid_entry_warning(relative, error.to_string()));
                continue;
            }
        };
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        match entry.file_type() {
            Ok(kind) if kind.is_dir() => result.push((name, entry.path())),
            Ok(kind) if kind.is_symlink() => state.warnings.push(invalid_entry_warning(
                &join_relative(relative, &name),
                "Символическая ссылка пропущена.",
            )),
            Ok(_) => {}
            Err(error) => state.warnings.push(invalid_entry_warning(
                &join_relative(relative, &name),
                error.to_string(),
            )),
        }
    }
    Ok(result)
}

fn read_visible_markdown_files(
    directory: &Path,
    relative: &str,
    state: &mut RunsCatalogState,
) -> Result<Vec<(String, PathBuf)>, RepositoryError> {
    let mut result = Vec::new();
    for entry in fs::read_dir(directory).map_err(|error| {
        RepositoryError::new(
            RepositoryErrorCode::Io,
            format!("Не удалось перечислить `{relative}`: {error}"),
        )
    })? {
        if !count_catalog_entry(
            &mut state.visited_entries,
            &mut state.scan_stopped,
            &mut state.limit_reported,
            &mut state.warnings,
            relative,
        ) {
            break;
        }
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                state
                    .warnings
                    .push(invalid_entry_warning(relative, error.to_string()));
                continue;
            }
        };
        let name = entry.file_name().to_string_lossy().into_owned();
        match entry.file_type() {
            Ok(kind) if kind.is_file() && name.strip_suffix(".md").is_some() => {
                result.push((name, entry.path()));
            }
            Ok(kind) if kind.is_symlink() => state.warnings.push(invalid_entry_warning(
                &format!("{relative}/{name}"),
                "Символическая ссылка пропущена.",
            )),
            Ok(_) => {}
            Err(error) => state.warnings.push(invalid_entry_warning(
                &format!("{relative}/{name}"),
                error.to_string(),
            )),
        }
    }
    result.sort_by(|a, b| compare_names(&a.0, &b.0));
    Ok(result)
}

fn invalid_entry_warning(path: &str, message: impl AsRef<str>) -> CatalogWarningDto {
    CatalogWarningDto::new(
        RepositoryWarningCode::InvalidEntry,
        format!("`{path}`: {}", message.as_ref()),
        Some(path.to_owned()),
        None,
    )
}
fn invalid_resource_warning(path: &str, message: impl AsRef<str>) -> CatalogWarningDto {
    CatalogWarningDto::new(
        RepositoryWarningCode::InvalidCase,
        format!("`{path}`: {}", message.as_ref()),
        Some(path.to_owned()),
        None,
    )
}
fn invalid_order_warning(path: &str, message: impl AsRef<str>) -> CatalogWarningDto {
    CatalogWarningDto::new(
        RepositoryWarningCode::InvalidOrder,
        format!("`{path}`: {}", message.as_ref()),
        Some(path.to_owned()),
        None,
    )
}
fn limit_warning(message: &str) -> CatalogWarningDto {
    CatalogWarningDto::new(RepositoryWarningCode::CatalogLimit, message, None, None)
}

fn report_catalog_limit(
    stopped: &mut bool,
    reported: &mut bool,
    warnings: &mut Vec<CatalogWarningDto>,
    message: &str,
) {
    *stopped = true;
    if !*reported {
        warnings.push(limit_warning(message));
        *reported = true;
    }
}

fn count_catalog_entry(
    visited: &mut usize,
    stopped: &mut bool,
    reported: &mut bool,
    warnings: &mut Vec<CatalogWarningDto>,
    path: &str,
) -> bool {
    if !entry_budget_allows(*visited, MAX_CATALOG_ENTRIES) {
        report_catalog_limit(
            stopped,
            reported,
            warnings,
            &format!("Обход остановлен после {MAX_CATALOG_ENTRIES} элементов около `{path}`."),
        );
        return false;
    }
    *visited += 1;
    true
}

#[allow(clippy::too_many_lines)] // Kept local until the approved service-module split.
fn walk_workspace(
    root: &RepoRoot,
    directory: &Path,
    relative: &str,
    parent_resource_id: Option<&str>,
    state: &mut CatalogState,
    depth: usize,
) -> Result<(), RepositoryError> {
    if state.scan_stopped {
        return Ok(());
    }
    if depth > MAX_CATALOG_DEPTH || state.entries.len() >= MAX_CATALOG_ENTRIES {
        report_catalog_limit(
            &mut state.scan_stopped,
            &mut state.limit_reported,
            &mut state.warnings,
            &format!(
                "Каталог `{relative}` остановлен по ограничению глубины или количества элементов."
            ),
        );
        return Ok(());
    }
    let resolved = if relative.is_empty() {
        root.0.clone()
    } else {
        resolve_directory(root, relative)?
    };
    if resolved
        != directory
            .canonicalize()
            .unwrap_or_else(|_| directory.to_path_buf())
    {
        state.warnings.push(invalid_entry_warning(
            relative,
            "Каталог изменился во время обхода.",
        ));
        return Ok(());
    }
    let mut entries = Vec::new();
    for result in fs::read_dir(&resolved).map_err(|error| {
        RepositoryError::new(
            RepositoryErrorCode::Io,
            format!("Не удалось перечислить `{relative}`: {error}"),
        )
    })? {
        if !count_catalog_entry(
            &mut state.visited_entries,
            &mut state.scan_stopped,
            &mut state.limit_reported,
            &mut state.warnings,
            relative,
        ) {
            break;
        }
        match result {
            Ok(entry) => entries.push(entry),
            Err(error) => state.warnings.push(invalid_entry_warning(
                relative,
                format!("Ошибка элемента: {error}"),
            )),
        }
    }
    entries.sort_by_key(|entry| {
        let name = entry.file_name().to_string_lossy().into_owned();
        (name.to_lowercase(), name)
    });
    let dir_names: HashSet<String> = entries
        .iter()
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            (entry.file_type().is_ok_and(|kind| kind.is_dir()) && !name.starts_with('.'))
                .then_some(name)
        })
        .collect();
    let mut files = Vec::new();
    let mut dirs = Vec::new();
    for entry in entries {
        let name = entry.file_name().to_string_lossy().into_owned();
        match entry.file_type() {
            Ok(kind) if kind.is_dir() && name.starts_with('.') => {}
            Ok(kind) if kind.is_dir() => dirs.push(name),
            Ok(kind)
                if kind.is_file()
                    && name.strip_suffix(".md").is_some()
                    && name != "_suite.md"
                    && !dir_names.contains(name.strip_suffix(".md").unwrap_or(&name)) =>
            {
                files.push(name);
            }
            Ok(kind) if kind.is_symlink() => state.warnings.push(invalid_entry_warning(
                &join_relative(relative, &name),
                "Символическая ссылка пропущена.",
            )),
            Ok(_) => {}
            Err(error) => state.warnings.push(invalid_entry_warning(
                &join_relative(relative, &name),
                format!("Не удалось проверить entry: {error}"),
            )),
        }
    }
    files.sort_by(|a, b| compare_names(a, b));
    dirs.sort_by(|a, b| compare_names(a, b));
    let mut keys: Vec<String> = files
        .iter()
        .map(|name| name.strip_suffix(".md").unwrap_or(name).to_owned())
        .chain(dirs.iter().cloned())
        .collect();
    let directory_names: HashSet<String> = dirs.iter().cloned().collect();
    let order_path = join_relative(relative, ".order");
    match resolve_optional_regular_file(root, &order_path) {
        Ok(Some(order_file)) => {
            let order_text = match catalog_read(
                &order_file,
                &order_path,
                MAX_ORDER_FILE_BYTES,
                &mut state.bytes_read,
                &mut state.warnings,
                &mut state.scan_stopped,
                &mut state.limit_reported,
            ) {
                Ok(text) => text,
                Err(error) => {
                    if !state.scan_stopped {
                        state
                            .warnings
                            .push(invalid_order_warning(&order_path, error.message));
                    }
                    String::new()
                }
            };
            if let Ok(order) = crate::domain::formats::OrderDocument::parse(&order_text) {
                let mut ordered = Vec::new();
                let mut seen = HashSet::new();
                for key in order.keys() {
                    if keys.contains(key) && seen.insert(key.clone()) {
                        ordered.push(key.clone());
                    }
                }
                for key in keys.drain(..) {
                    if seen.insert(key.clone()) {
                        ordered.push(key);
                    }
                }
                keys = ordered;
            } else {
                state.warnings.push(invalid_order_warning(
                    &order_path,
                    "Файл имеет неподдерживаемый формат.",
                ));
            }
        }
        Ok(None) => {}
        Err(error) => state
            .warnings
            .push(invalid_order_warning(&order_path, error.message)),
    }
    for (order_index, key) in keys.into_iter().enumerate() {
        if state.scan_stopped {
            break;
        }
        if state.entries.len() >= MAX_CATALOG_ENTRIES {
            state.warnings.push(limit_warning(
                "Превышено максимальное число элементов каталога.",
            ));
            break;
        }
        if directory_names.contains(&key) {
            let child_relative = join_relative(relative, &key);
            let note_relative = sibling_note_path(&child_relative);
            let (name, prefix, description) =
                match resolve_optional_regular_file(root, &note_relative) {
                    Ok(Some(note_path)) => match catalog_read(
                        &note_path,
                        &note_relative,
                        MAX_FOLDER_NOTE_BYTES,
                        &mut state.bytes_read,
                        &mut state.warnings,
                        &mut state.scan_stopped,
                        &mut state.limit_reported,
                    ) {
                        Ok(raw) => {
                            if state.scan_stopped {
                                return Ok(());
                            }
                            match FolderNoteDocument::parse(&raw) {
                                Ok(note) => (
                                    note.front().name().trim().to_owned(),
                                    note.front().display_id_prefix().trim().to_owned(),
                                    note.description(),
                                ),
                                Err(error) => {
                                    state
                                        .warnings
                                        .push(invalid_entry_warning(&note_relative, error.message));
                                    (String::new(), String::new(), String::new())
                                }
                            }
                        }
                        Err(error) => {
                            state
                                .warnings
                                .push(invalid_entry_warning(&note_relative, error.message));
                            (String::new(), String::new(), String::new())
                        }
                    },
                    Ok(None) => (String::new(), String::new(), String::new()),
                    Err(error) => {
                        state
                            .warnings
                            .push(invalid_entry_warning(&note_relative, error.message));
                        (String::new(), String::new(), String::new())
                    }
                };
            let node_id = Uuid::new_v4().to_string();
            state.resources.insert(
                node_id.clone(),
                ResourceEntry {
                    relative: child_relative.clone(),
                    canonical: resolved.join(&key),
                    kind: ResourceKind::Folder,
                },
            );
            state.entries.push(CatalogEntryDto::Folder {
                node_id: node_id.clone(),
                path: child_relative.clone(),
                parent_path: relative.to_owned(),
                parent_resource_id: parent_resource_id.map(str::to_owned),
                order: order_index,
                name: if name.is_empty() { key.clone() } else { name },
                display_id_prefix: prefix,
                description,
            });
            walk_workspace(
                root,
                &resolved.join(&key),
                &child_relative,
                Some(&node_id),
                state,
                depth + 1,
            )?;
        } else {
            let case_relative = join_relative(relative, &format!("{key}.md"));
            let case_path = match resolve_regular_file(root, &case_relative) {
                Ok(path) => path,
                Err(error) => {
                    state.warnings.push(invalid_entry_warning(
                        &case_relative,
                        format!("Case пропущен: {}", error.message),
                    ));
                    continue;
                }
            };
            let text = match catalog_read(
                &case_path,
                &case_relative,
                MAX_REPOSITORY_FILE_BYTES,
                &mut state.bytes_read,
                &mut state.warnings,
                &mut state.scan_stopped,
                &mut state.limit_reported,
            ) {
                Ok(text) => text,
                Err(error) => {
                    if !state.scan_stopped {
                        state
                            .warnings
                            .push(invalid_resource_warning(&case_relative, error.message));
                    }
                    continue;
                }
            };
            if state.scan_stopped {
                break;
            }
            let document = match CaseDocument::parse(&text) {
                Ok(document) => document,
                Err(error) => {
                    state
                        .warnings
                        .push(invalid_resource_warning(&case_relative, error.message));
                    continue;
                }
            };
            let model = document.model();
            let resource_id = Uuid::new_v4().to_string();
            for warning in document.warnings() {
                state.resource_warnings.push(CatalogWarningDto {
                    code: RepositoryWarningCode::InvalidCase,
                    message: format!("Case `{case_relative}`: {}", warning.message),
                    path: Some(case_relative.clone()),
                    resource_id: Some(resource_id.clone()),
                });
            }
            if let Some(id) = model.id.as_ref()
                && !state.case_ids.insert(id.clone())
            {
                state.resource_warnings.push(CatalogWarningDto { code: RepositoryWarningCode::DuplicateCaseId, message: format!("Стабильный case id `{id}` повторяется; файлы остаются отдельными ресурсами."), path: Some(case_relative.clone()), resource_id: Some(resource_id.clone()) });
            }
            state.resources.insert(
                resource_id.clone(),
                ResourceEntry {
                    relative: case_relative.clone(),
                    canonical: case_path,
                    kind: ResourceKind::Case,
                },
            );
            state.entries.push(CatalogEntryDto::Case {
                resource_id,
                path: case_relative,
                parent_path: relative.to_owned(),
                parent_resource_id: parent_resource_id.map(str::to_owned),
                order: order_index,
                id: model.id.clone(),
                display_id: model.display_id.clone(),
                title: model.title.clone(),
                status: model.status,
                tags: model.tags.clone(),
                revision: atomic::revision(text.as_bytes()),
            });
        }
    }
    if fs::symlink_metadata(resolved.join("_suite.md")).is_ok() {
        state.warnings.push(CatalogWarningDto::new(
            RepositoryWarningCode::LegacyFormat,
            format!("Legacy `_suite.md` в `{relative}` пропущен и не изменяется."),
            Some(join_relative(relative, "_suite.md")),
            None,
        ));
    }
    Ok(())
}

fn join_relative(parent: &str, child: &str) -> String {
    if parent.is_empty() {
        child.to_owned()
    } else {
        format!("{parent}/{child}")
    }
}
fn read_budget_allows(total: usize, next: usize, limit: usize) -> bool {
    total.checked_add(next).is_some_and(|sum| sum <= limit)
}
fn entry_budget_allows(visited: usize, limit: usize) -> bool {
    visited < limit
}
fn compare_names(left: &str, right: &str) -> std::cmp::Ordering {
    left.to_lowercase()
        .cmp(&right.to_lowercase())
        .then_with(|| left.cmp(right))
}
fn resolve_regular_file(root: &RepoRoot, relative: &str) -> Result<PathBuf, RepositoryError> {
    validate_no_symlink_components(root, relative, false)?;
    let lexical = root.0.join(relative);
    let metadata = fs::symlink_metadata(&lexical).map_err(|error| {
        RepositoryError::new(
            RepositoryErrorCode::Io,
            format!("Не удалось проверить `{relative}`: {error}"),
        )
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(RepositoryError::new(
            RepositoryErrorCode::InvalidRelativePath,
            format!("`{relative}` должен быть обычным файлом без symlink."),
        ));
    }
    root.resolve_existing(relative)
}
fn resolve_optional_regular_file(
    root: &RepoRoot,
    relative: &str,
) -> Result<Option<PathBuf>, RepositoryError> {
    if !validate_no_symlink_components(root, relative, true)? {
        return Ok(None);
    }
    let lexical = root.0.join(relative);
    let metadata = match fs::symlink_metadata(&lexical) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(RepositoryError::new(
                RepositoryErrorCode::Io,
                format!("Не удалось проверить `{relative}`: {error}"),
            ));
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(RepositoryError::new(
            RepositoryErrorCode::InvalidRelativePath,
            format!("`{relative}` должен быть обычным файлом без symlink."),
        ));
    }
    root.resolve_existing(relative).map(Some)
}
fn resolve_directory(root: &RepoRoot, relative: &str) -> Result<PathBuf, RepositoryError> {
    validate_no_symlink_components(root, relative, false)?;
    let lexical = root.0.join(relative);
    let metadata = fs::symlink_metadata(&lexical).map_err(|error| {
        RepositoryError::new(
            RepositoryErrorCode::Io,
            format!("Не удалось проверить `{relative}`: {error}"),
        )
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(RepositoryError::new(
            RepositoryErrorCode::InvalidRelativePath,
            format!("`{relative}` должен быть каталогом без symlink."),
        ));
    }
    root.resolve_existing(relative)
}
fn resolve_optional_directory(
    root: &RepoRoot,
    relative: &str,
) -> Result<Option<PathBuf>, RepositoryError> {
    if !validate_no_symlink_components(root, relative, true)? {
        return Ok(None);
    }
    let lexical = root.0.join(relative);
    let metadata = match fs::symlink_metadata(&lexical) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(RepositoryError::new(
                RepositoryErrorCode::Io,
                format!("Не удалось проверить `{relative}`: {error}"),
            ));
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(RepositoryError::new(
            RepositoryErrorCode::InvalidRelativePath,
            format!("`{relative}` должен быть каталогом без symlink."),
        ));
    }
    root.resolve_existing(relative).map(Some)
}
fn validate_no_symlink_components(
    root: &RepoRoot,
    relative: &str,
    allow_missing: bool,
) -> Result<bool, RepositoryError> {
    let mut current = root.0.clone();
    for component in Path::new(relative).components() {
        let std::path::Component::Normal(name) = component else {
            return Err(RepositoryError::new(
                RepositoryErrorCode::InvalidRelativePath,
                "Resource path должен содержать только обычные relative components.",
            ));
        };
        current.push(name);
        let metadata = match fs::symlink_metadata(&current) {
            Ok(metadata) => metadata,
            Err(error) if allow_missing && error.kind() == io::ErrorKind::NotFound => {
                return Ok(false);
            }
            Err(error) => {
                return Err(RepositoryError::new(
                    RepositoryErrorCode::Io,
                    format!("Не удалось проверить path component `{relative}`: {error}"),
                ));
            }
        };
        if metadata.file_type().is_symlink() {
            return Err(RepositoryError::new(
                RepositoryErrorCode::InvalidRelativePath,
                format!("Resource path `{relative}` содержит symlink component."),
            ));
        }
    }
    Ok(true)
}
fn registry_error() -> RepositoryError {
    RepositoryError::new(
        RepositoryErrorCode::SessionRegistry,
        "Не удалось получить доступ к registry репозиториев.",
    )
}
fn invalid_resource() -> RepositoryError {
    RepositoryError::new(
        RepositoryErrorCode::InvalidResource,
        "Resource отсутствует в каталоге этой сессии или имеет другой тип.",
    )
}
fn stale_resource() -> RepositoryError {
    RepositoryError::new(
        RepositoryErrorCode::StaleResource,
        "Resource изменил canonical path после каталога; обновите каталог.",
    )
}

fn invalid_session() -> RepositoryError {
    RepositoryError::new(
        RepositoryErrorCode::InvalidSession,
        "Сессия репозитория неизвестна или закрыта.",
    )
}

struct OpenMetadata {
    display_name: String,
    needs_initialization: bool,
    workspaces: Vec<WorkspaceDto>,
    warnings: Vec<RepositoryWarning>,
}

fn load_open_metadata(root: &RepoRoot) -> Result<OpenMetadata, RepositoryError> {
    let root_name = root_name(root);
    let Some(raw) = read_config_if_present(root)? else {
        return Ok(OpenMetadata {
            display_name: root_name,
            needs_initialization: true,
            workspaces: Vec::new(),
            warnings: Vec::new(),
        });
    };
    let document = ConfigDocument::parse(&raw)
        .map_err(|error| RepositoryError::new(RepositoryErrorCode::InvalidConfig, error.message))?;
    let model = document.model();
    let version = model.version();
    if !(1..=2).contains(&version) {
        return Err(RepositoryError::new(
            RepositoryErrorCode::UnsupportedVersion,
            format!("Версия Casewright config {version} не поддерживается."),
        ));
    }
    let name = model
        .name()
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| root_name.clone());
    let root_workspace = WorkspaceDto {
        path: String::new(),
        name: name.clone(),
        display_id_prefix: model.display_id_prefix().unwrap_or_default(),
        description: model.description().unwrap_or_default(),
    };
    let (workspaces, warnings) = load_workspaces(root, model.workspaces(), &root_workspace)?;
    Ok(OpenMetadata {
        display_name: name,
        needs_initialization: false,
        workspaces,
        warnings,
    })
}

fn root_name(root: &RepoRoot) -> String {
    root.0
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("Repository")
        .to_owned()
}

fn read_config_if_present(root: &RepoRoot) -> Result<Option<String>, RepositoryError> {
    let casewright_dir = root.0.join(".casewright");
    match fs::symlink_metadata(&casewright_dir) {
        Ok(_) => {
            let canonical = fs::canonicalize(&casewright_dir).map_err(|error| {
                RepositoryError::new(
                    RepositoryErrorCode::InvalidConfig,
                    format!("Не удалось безопасно проверить `.casewright`: {error}"),
                )
            })?;
            if !canonical.starts_with(&root.0) {
                return Err(RepositoryError::new(
                    RepositoryErrorCode::PathEscapesRepository,
                    "Каталог `.casewright` выходит за пределы репозитория.",
                ));
            }
            if !canonical.is_dir() {
                return Err(RepositoryError::new(
                    RepositoryErrorCode::InvalidConfig,
                    "`.casewright` должен быть каталогом.",
                ));
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(RepositoryError::new(
                RepositoryErrorCode::Io,
                format!("Не удалось проверить `.casewright`: {error}"),
            ));
        }
    }
    let config_path = casewright_dir.join("config.yaml");
    match fs::symlink_metadata(&config_path) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            if root.0.join("casewright.yaml").exists()
                || root.0.join(".casewright/casewright.yaml").exists()
            {
                return Err(RepositoryError::new(
                    RepositoryErrorCode::UnsupportedLegacyFormat,
                    "Обнаружен legacy Casewright config; автоматическая миграция не выполняется.",
                ));
            }
            return Ok(None);
        }
        Err(error) => {
            return Err(RepositoryError::new(
                RepositoryErrorCode::Io,
                format!("Не удалось проверить `.casewright/config.yaml`: {error}"),
            ));
        }
        Ok(_) => {}
    }
    let canonical_config = root.resolve_existing(".casewright/config.yaml")?;
    if !canonical_config.is_file() {
        return Err(RepositoryError::new(
            RepositoryErrorCode::InvalidConfig,
            "`.casewright/config.yaml` не является обычным файлом.",
        ));
    }
    let raw = read_utf8_limited(&canonical_config, MAX_CONFIG_BYTES)?;
    Ok(Some(raw))
}

enum WorkspaceLoad {
    Loaded(WorkspaceDto, Vec<RepositoryWarning>),
    Skipped(RepositoryWarning),
}

fn load_workspaces(
    root: &RepoRoot,
    declarations: Vec<String>,
    root_workspace: &WorkspaceDto,
) -> Result<(Vec<WorkspaceDto>, Vec<RepositoryWarning>), RepositoryError> {
    let mut warnings = Vec::new();
    let mut workspaces = Vec::new();
    let mut seen = HashSet::new();
    for declaration in declarations {
        let normalized = match normalize_workspace_path(&declaration) {
            Ok(path) => path,
            Err(error) => {
                warnings.push(RepositoryWarning {
                    code: RepositoryWarningCode::InvalidWorkspacePath,
                    message: format!("Workspace path `{declaration}` отклонён: {}", error.message),
                });
                continue;
            }
        };
        if !seen.insert(normalized.clone()) {
            warnings.push(RepositoryWarning {
                code: RepositoryWarningCode::DuplicateWorkspace,
                message: format!("Повтор workspace path `{declaration}` пропущен."),
            });
            continue;
        }
        if normalized.is_empty() {
            workspaces.push(root_workspace.clone());
            continue;
        }
        match load_workspace(root, &normalized, &declaration)? {
            WorkspaceLoad::Loaded(workspace, workspace_warnings) => {
                workspaces.push(workspace);
                warnings.extend(workspace_warnings);
            }
            WorkspaceLoad::Skipped(warning) => warnings.push(warning),
        }
    }
    if workspaces.is_empty() {
        warnings.push(RepositoryWarning {
            code: RepositoryWarningCode::MissingWorkspace,
            message: "Config не объявляет ни одной существующей workspace.".into(),
        });
    }
    Ok((workspaces, warnings))
}

fn load_workspace(
    root: &RepoRoot,
    normalized: &str,
    declaration: &str,
) -> Result<WorkspaceLoad, RepositoryError> {
    let resolved = match root.resolve_existing(normalized) {
        Ok(path) => path,
        Err(error) if error.code == RepositoryErrorCode::Io => {
            return Ok(WorkspaceLoad::Skipped(RepositoryWarning {
                code: RepositoryWarningCode::MissingWorkspace,
                message: format!("Workspace `{declaration}` отсутствует и пропущен."),
            }));
        }
        Err(error) => {
            return Ok(WorkspaceLoad::Skipped(RepositoryWarning {
                code: RepositoryWarningCode::InvalidWorkspacePath,
                message: error.message,
            }));
        }
    };
    if !resolved.is_dir() {
        return Ok(WorkspaceLoad::Skipped(RepositoryWarning {
            code: RepositoryWarningCode::MissingWorkspace,
            message: format!("Workspace `{declaration}` не является каталогом и пропущен."),
        }));
    }
    let mut warnings = Vec::new();
    if root.0.join(normalized).join("casewright.yaml").exists()
        || root.0.join(normalized).join("_suite.md").exists()
    {
        warnings.push(RepositoryWarning {
            code: RepositoryWarningCode::LegacyFormat,
            message: format!("Для workspace `{normalized}` найдены legacy metadata; они не мигрируются при открытии."),
        });
    }
    let folder_name = resolved
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or(normalized)
        .to_owned();
    let note_relative = sibling_note_path(normalized);
    let mut workspace = WorkspaceDto {
        path: normalized.to_owned(),
        name: folder_name,
        display_id_prefix: String::new(),
        description: String::new(),
    };
    match root.resolve_existing(&note_relative) {
        Ok(note_path) if note_path.is_file() => {
            let raw_note = read_utf8_limited(&note_path, MAX_FOLDER_NOTE_BYTES)?;
            let note = FolderNoteDocument::parse(&raw_note).map_err(|error| {
                RepositoryError::new(
                    RepositoryErrorCode::InvalidConfig,
                    format!(
                        "Некорректная folder note `{note_relative}`: {}",
                        error.message
                    ),
                )
            })?;
            if !note.front().name().trim().is_empty() {
                workspace.name = note.front().name();
            }
            workspace.display_id_prefix = note.front().display_id_prefix();
            workspace.description = note.description();
        }
        Ok(_) => {}
        Err(error) if error.code == RepositoryErrorCode::Io => {}
        Err(error) => return Err(error),
    }
    Ok(WorkspaceLoad::Loaded(workspace, warnings))
}

fn normalize_workspace_path(value: &str) -> Result<String, RepositoryError> {
    if value.is_empty() || value == "." || value == "./" {
        return Ok(String::new());
    }
    if value.starts_with('/') || value.contains('\\') || value.contains(':') || value.contains('\0')
    {
        return Err(RepositoryError::new(
            RepositoryErrorCode::InvalidRelativePath,
            "Ожидался относительный workspace path без drive/UNC/ADS символов.",
        ));
    }
    let value = value.strip_prefix("./").unwrap_or(value);
    let value = value.trim_end_matches('/');
    let segments: Vec<_> = value
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect();
    if segments.is_empty()
        || segments
            .iter()
            .any(|segment| *segment == "." || *segment == "..")
    {
        return Err(RepositoryError::new(
            RepositoryErrorCode::InvalidRelativePath,
            "Workspace path содержит недопустимый компонент.",
        ));
    }
    Ok(segments.join("/"))
}

fn sibling_note_path(workspace: &str) -> String {
    match workspace.rsplit_once('/') {
        Some((parent, name)) => format!("{parent}/{name}.md"),
        None => format!("{workspace}.md"),
    }
}

fn read_utf8_limited(path: &Path, limit: usize) -> Result<String, RepositoryError> {
    let path_metadata = fs::metadata(path).map_err(|error| {
        RepositoryError::new(
            RepositoryErrorCode::Io,
            format!("Не удалось проверить файл репозитория: {error}"),
        )
    })?;
    if !path_metadata.is_file() {
        return Err(RepositoryError::new(
            RepositoryErrorCode::Io,
            "Читать можно только обычные файлы репозитория.",
        ));
    }
    let file = File::open(path).map_err(|error| {
        RepositoryError::new(
            RepositoryErrorCode::Io,
            format!("Не удалось прочитать файл репозитория: {error}"),
        )
    })?;
    if !file.metadata().is_ok_and(|metadata| metadata.is_file()) {
        return Err(RepositoryError::new(
            RepositoryErrorCode::Io,
            "Открытый путь больше не указывает на обычный файл.",
        ));
    }
    let mut bytes = Vec::new();
    file.take((limit + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| {
            RepositoryError::new(
                RepositoryErrorCode::Io,
                format!("Не удалось прочитать файл репозитория: {error}"),
            )
        })?;
    if bytes.len() > limit {
        return Err(RepositoryError::new(
            RepositoryErrorCode::FileTooLarge,
            format!("Файл превышает лимит чтения {limit} байт."),
        ));
    }
    String::from_utf8(bytes).map_err(|_| {
        RepositoryError::new(
            RepositoryErrorCode::InvalidUtf8,
            "Файл репозитория не является UTF-8.",
        )
    })
}

#[cfg(test)]
#[path = "repository/tests.rs"]
mod tests;

fn validate_current_metadata(session: &RepoSession) -> Result<(), RepositoryError> {
    let metadata = load_open_metadata(&session.root)?;
    if session.config_invalid
        || metadata.needs_initialization != session.opened.needs_initialization
        || metadata.workspaces != session.opened.workspaces
    {
        return Err(RepositoryError::new(
            RepositoryErrorCode::ExternalChange,
            "Конфигурация изменилась; обновите репозиторий.",
        ));
    }
    Ok(())
}
