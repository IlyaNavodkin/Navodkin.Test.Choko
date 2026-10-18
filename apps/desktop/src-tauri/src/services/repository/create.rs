use super::{
    CatalogEntryDto, CatalogState, MAX_REPOSITORY_FILE_BYTES, RepoSession, RepositoryError,
    RepositoryErrorCode, RepositoryService, ResourceKind, atomic, invalid_resource,
    invalid_session, read_utf8_limited, registry_error, resolve_directory, resolve_regular_file,
    stale_resource, walk_workspace,
};
use crate::domain::formats::CaseDocument;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DuplicateSource {
    pub resource_id: String,
    pub expected_revision: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaseCreation {
    pub workspace_path: String,
    pub parent_resource_id: Option<String>,
    pub title: String,
    pub source: Option<DuplicateSource>,
}

impl CaseCreation {
    pub(crate) fn validate(&self) -> Result<(), RepositoryError> {
        if self.title.trim().is_empty()
            || self.title.len() > 4096
            || self.workspace_path.len() > 1024
            || self.source.as_ref().is_some_and(|source| {
                source.expected_revision.len() != 64
                    || !source
                        .expected_revision
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            })
        {
            return Err(RepositoryError::new(
                RepositoryErrorCode::InvalidCaseEdit,
                "Параметры создания кейса недопустимы.",
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseCreationDto {
    pub path: String,
}

fn failure(message: &str) -> RepositoryError {
    RepositoryError::new(RepositoryErrorCode::SaveFailed, message)
}
fn within(path: &str, workspace: &str) -> bool {
    workspace.is_empty() || path.starts_with(&format!("{workspace}/"))
}

pub(super) fn destination(
    session: &RepoSession,
    workspace_path: &str,
    parent_resource_id: Option<&str>,
) -> Result<String, RepositoryError> {
    if !session
        .opened
        .workspaces
        .iter()
        .any(|item| item.path == workspace_path)
        || session.opened.needs_initialization
    {
        return Err(invalid_resource());
    }
    let Some(token) = parent_resource_id else {
        return Ok(workspace_path.to_owned());
    };
    let resource = session.resources.get(token).ok_or_else(invalid_resource)?;
    if resource.kind != ResourceKind::Folder || !within(&resource.relative, workspace_path) {
        return Err(invalid_resource());
    }
    if resolve_directory(&session.root, &resource.relative)? != resource.canonical {
        return Err(stale_resource());
    }
    Ok(resource.relative.clone())
}

impl RepositoryService {
    /// Creates a new case or a lossless duplicate in an already catalogued workspace.
    /// No existing case, order file, folder note, run snapshot or Git index is rewritten.
    ///
    /// # Errors
    /// Refuses invalid/stale resources, external edits, scan limits and write failures.
    pub fn create_case(
        &self,
        token: &str,
        request: &CaseCreation,
    ) -> Result<CaseCreationDto, RepositoryError> {
        request.validate()?;
        let sessions = self.sessions.lock().map_err(|_| registry_error())?;
        let session = sessions.by_id.get(token).ok_or_else(invalid_session)?;
        super::git_sync::ensure_writable(session)?;
        let parent = destination(
            session,
            &request.workspace_path,
            request.parent_resource_id.as_deref(),
        )?;
        let directory = if parent.is_empty() {
            session.root.0.clone()
        } else {
            resolve_directory(&session.root, &parent)?
        };
        let workspace = if request.workspace_path.is_empty() {
            session.root.0.clone()
        } else {
            resolve_directory(&session.root, &request.workspace_path)?
        };
        let mut catalog = CatalogState {
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
            &workspace,
            &request.workspace_path,
            None,
            &mut catalog,
            0,
        )?;
        if catalog.scan_stopped
            || catalog.warnings.iter().any(|warning| {
                matches!(
                    warning.code,
                    super::RepositoryWarningCode::CatalogLimit
                        | super::RepositoryWarningCode::InvalidCase
                        | super::RepositoryWarningCode::InvalidEntry
                )
            })
        {
            return Err(failure(
                "Нельзя безопасно назначить displayId: каталог неполон или содержит ошибки чтения.",
            ));
        }
        let prefix = inherited_prefix(session, &catalog.entries, &parent, &request.workspace_path);
        let number = catalog
            .entries
            .iter()
            .filter_map(|entry| match entry {
                CatalogEntryDto::Case { display_id, .. } => display_id
                    .strip_prefix(&format!("{prefix}-"))
                    .and_then(|tail| tail.parse::<u64>().ok()),
                CatalogEntryDto::Folder { .. } => None,
            })
            .max()
            .unwrap_or(0)
            .checked_add(1)
            .ok_or_else(|| failure("Нет доступного displayId."))?;
        let display_id = format!("{prefix}-{number:04}");
        if display_id.len() > 512 {
            return Err(failure("Префикс displayId слишком длинный."));
        }
        let id = Uuid::new_v4().to_string();
        if catalog.case_ids.contains(&id) {
            return Err(failure("Не удалось назначить уникальный id."));
        }
        let (mut document, source_path) = prepare_document(session, request, &id)?;
        document.set_title(request.title.trim().into());
        document.set_display_id(display_id);
        let bytes = document
            .to_text()
            .map_err(|_| failure("Не удалось сериализовать кейс без потери содержимого."))?;
        let verified =
            CaseDocument::parse(&bytes).map_err(|_| failure("Не удалось проверить кейс."))?;
        if verified.model().id.as_deref() != Some(&id) || verified.model() != document.model() {
            return Err(failure("Повторная проверка кейса не прошла."));
        }
        let name = format!("{id}.md");
        atomic::create(
            &directory.join(&name),
            bytes.as_bytes(),
            source_path.as_deref(),
        )
        .map_err(|_| failure("Не удалось создать кейс; существующие файлы не перезаписаны."))?;
        Ok(CaseCreationDto {
            path: if parent.is_empty() {
                name
            } else {
                format!("{parent}/{name}")
            },
        })
    }
}

fn inherited_prefix(
    session: &RepoSession,
    entries: &[CatalogEntryDto],
    parent: &str,
    workspace: &str,
) -> String {
    let mut current = parent.to_owned();
    while current != workspace && !current.is_empty() {
        if let Some(prefix) = entries.iter().find_map(|entry| match entry {
            CatalogEntryDto::Folder {
                path,
                display_id_prefix,
                ..
            } if *path == current && !display_id_prefix.trim().is_empty() => {
                Some(display_id_prefix.clone())
            }
            _ => None,
        }) {
            return prefix;
        }
        current = current
            .rsplit_once('/')
            .map_or_else(String::new, |(parent, _)| parent.to_owned());
    }
    session
        .opened
        .workspaces
        .iter()
        .find(|item| item.path == workspace)
        .map(|item| item.display_id_prefix.clone())
        .filter(|prefix| !prefix.trim().is_empty())
        .unwrap_or_else(|| "CW".into())
}

fn prepare_document(
    session: &RepoSession,
    request: &CaseCreation,
    id: &str,
) -> Result<(CaseDocument, Option<std::path::PathBuf>), RepositoryError> {
    let mut source_path = None;
    let document = if let Some(source) = &request.source {
        let resource = session
            .resources
            .get(&source.resource_id)
            .ok_or_else(invalid_resource)?;
        if resource.kind != ResourceKind::Case
            || !within(&resource.relative, &request.workspace_path)
        {
            return Err(invalid_resource());
        }
        let path = resolve_regular_file(&session.root, &resource.relative)?;
        if path != resource.canonical {
            return Err(stale_resource());
        }
        let raw = read_utf8_limited(&path, MAX_REPOSITORY_FILE_BYTES)?;
        if atomic::revision(raw.as_bytes()) != source.expected_revision {
            return Err(RepositoryError::new(
                RepositoryErrorCode::ExternalChange,
                "Исходник изменён извне.",
            ));
        }
        let parsed =
            CaseDocument::parse(&raw).map_err(|_| failure("Исходник нельзя прочитать."))?;
        if parsed.model().id.is_none() {
            return Err(RepositoryError::new(
                RepositoryErrorCode::ReadOnlyCase,
                "Кейс без id нельзя дублировать.",
            ));
        }
        source_path = Some(path);
        parsed
            .duplicate(id)
            .map_err(|_| failure("Не удалось сохранить неизвестное содержимое копии."))?
    } else {
        let id_yaml =
            serde_json::to_string(id).map_err(|_| failure("Не удалось подготовить id."))?;
        CaseDocument::parse(&format!(
            "---\nid: {id_yaml}\ntitle: New case\ndisplayId: ''\nstatus: draft\ntags: []\n---\n"
        ))
        .map_err(|_| failure("Не удалось подготовить кейс."))?
    };
    Ok((document, source_path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, path::Path, process::Command};
    const SOURCE: &str = "---\r\nid: stable-source\r\ndisplayId: PAY-0007\r\ntitle: Original\r\nstatus: active\r\ncustom: {owner: QA}\r\n---\r\n\r\n## Steps\r\n- Parent\r\n  - Nested\r\n\r\n## Vendor\r\nKeep exactly.\r\n";
    fn fixture(root: &Path) -> (RepositoryService, String, String, String) {
        assert!(
            Command::new("git")
                .args(["init", "--quiet"])
                .current_dir(root)
                .status()
                .unwrap()
                .success()
        );
        fs::create_dir(root.join(".casewright")).unwrap();
        fs::write(
            root.join(".casewright/config.yaml"),
            "version: 1\nname: Fixture\nworkspaces:\n  - .\n",
        )
        .unwrap();
        fs::create_dir(root.join("suite")).unwrap();
        fs::write(
            root.join("suite.md"),
            "---\ndisplayIdPrefix: PAY\n---\nFolder note\n",
        )
        .unwrap();
        fs::write(root.join("suite/source.md"), SOURCE).unwrap();
        fs::write(root.join("suite/.order"), "source\r\nunknown-key\r\n").unwrap();
        fs::write(root.join("foreign.txt"), "index").unwrap();
        assert!(
            Command::new("git")
                .args(["add", "--", "foreign.txt"])
                .current_dir(root)
                .status()
                .unwrap()
                .success()
        );
        let service = RepositoryService::default();
        let token = service.open(root).unwrap().session_id;
        let catalog = service.catalog_workspace(&token, "").unwrap();
        let folder = catalog
            .entries
            .iter()
            .find_map(|entry| match entry {
                CatalogEntryDto::Folder { node_id, .. } => Some(node_id.clone()),
                CatalogEntryDto::Case { .. } => None,
            })
            .unwrap();
        let resource = catalog
            .entries
            .iter()
            .find_map(|entry| match entry {
                CatalogEntryDto::Case { resource_id, .. } => Some(resource_id.clone()),
                CatalogEntryDto::Folder { .. } => None,
            })
            .unwrap();
        (service, token, folder, resource)
    }
    #[test]
    fn creates_and_duplicates_with_new_ids_and_inherited_sequence_without_touching_existing_bytes()
    {
        let temp = tempfile::tempdir().unwrap();
        let (service, token, folder, resource) = fixture(temp.path());
        let index = fs::read(temp.path().join(".git/index")).unwrap();
        let order = fs::read(temp.path().join("suite/.order")).unwrap();
        let note = fs::read(temp.path().join("suite.md")).unwrap();
        let request = CaseCreation {
            workspace_path: String::new(),
            parent_resource_id: Some(folder),
            title: "Новый кейс".into(),
            source: None,
        };
        let created = service.create_case(&token, &request).unwrap();
        let created_raw = fs::read_to_string(temp.path().join(&created.path)).unwrap();
        let parsed = CaseDocument::parse(&created_raw).unwrap();
        assert_eq!(parsed.model().display_id, "PAY-0008");
        assert_eq!(parsed.model().title, "Новый кейс");
        let before = service.read_case(&token, &resource).unwrap();
        let request = CaseCreation {
            title: "Копия".into(),
            source: Some(DuplicateSource {
                resource_id: resource,
                expected_revision: before.revision,
            }),
            ..request
        };
        let copied = service.create_case(&token, &request).unwrap();
        let copied_raw = fs::read_to_string(temp.path().join(&copied.path)).unwrap();
        let copied_document = CaseDocument::parse(&copied_raw).unwrap();
        assert_eq!(copied_document.model().display_id, "PAY-0009");
        assert_ne!(copied_document.model().id, parsed.model().id);
        assert_ne!(copied_document.model().id.as_deref(), Some("stable-source"));
        assert_eq!(copied_document.model().steps[1].depth, 1);
        assert!(copied_raw.contains("custom: {owner: QA}\r\n"));
        assert!(copied_raw.contains("## Vendor\r\nKeep exactly.\r\n"));
        assert_eq!(
            fs::read_to_string(temp.path().join("suite/source.md")).unwrap(),
            SOURCE
        );
        assert_eq!(fs::read(temp.path().join("suite/.order")).unwrap(), order);
        assert_eq!(fs::read(temp.path().join("suite.md")).unwrap(), note);
        assert_eq!(fs::read(temp.path().join(".git/index")).unwrap(), index);
        assert!(!temp.path().join(".casewright/runs").exists());
    }
    #[test]
    fn stale_source_foreign_folder_and_closed_session_do_not_create_files() {
        let temp = tempfile::tempdir().unwrap();
        let (service, token, folder, resource) = fixture(temp.path());
        let revision = service.read_case(&token, &resource).unwrap().revision;
        fs::write(
            temp.path().join("suite/source.md"),
            SOURCE.replace("Original", "External"),
        )
        .unwrap();
        let mut request = CaseCreation {
            workspace_path: String::new(),
            parent_resource_id: Some(folder),
            title: "Copy".into(),
            source: Some(DuplicateSource {
                resource_id: resource,
                expected_revision: revision,
            }),
        };
        assert_eq!(
            service.create_case(&token, &request).unwrap_err().code,
            RepositoryErrorCode::ExternalChange
        );
        request.source = None;
        request.parent_resource_id = Some(Uuid::new_v4().to_string());
        assert_eq!(
            service.create_case(&token, &request).unwrap_err().code,
            RepositoryErrorCode::InvalidResource
        );
        service.close(&token).unwrap();
        assert_eq!(
            service.create_case(&token, &request).unwrap_err().code,
            RepositoryErrorCode::InvalidSession
        );
        assert_eq!(fs::read_dir(temp.path().join("suite")).unwrap().count(), 2);
    }
    #[test]
    fn publication_never_overwrites_a_collision_and_cleans_its_temporary_file() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("existing.md");
        fs::write(&path, b"existing").unwrap();
        assert!(atomic::create(&path, b"new", None).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"existing");
        assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 1);
    }
}
