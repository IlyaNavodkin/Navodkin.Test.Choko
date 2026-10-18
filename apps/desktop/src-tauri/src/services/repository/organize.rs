use super::{
    RepoSession, RepositoryError, RepositoryErrorCode, RepositoryService, ResourceKind, atomic,
    invalid_resource, invalid_session, registry_error, resolve_directory, resolve_regular_file,
    stale_resource,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum CaseAction {
    Move { parent_resource_id: Option<String> },
    Rename { filename: String },
    Delete,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaseOperation {
    pub workspace_path: String,
    pub resource_id: String,
    pub expected_revision: String,
    pub action: CaseAction,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaseOperationDto {
    pub path: Option<String>,
}

impl CaseOperation {
    pub(crate) fn validate(&self) -> Result<(), RepositoryError> {
        if self.workspace_path.len() > 1024
            || self.expected_revision.len() != 64
            || !self
                .expected_revision
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err(invalid_resource());
        }
        if let CaseAction::Rename { filename } = &self.action
            && !super::names::case_filename(filename)
        {
            return Err(RepositoryError::new(
                RepositoryErrorCode::InvalidCaseEdit,
                "Недопустимое имя файла кейса.",
            ));
        }
        Ok(())
    }
}

fn check_workspace(
    session: &RepoSession,
    request: &CaseOperation,
    path: &str,
) -> Result<(), RepositoryError> {
    if session.opened.needs_initialization
        || !session
            .opened
            .workspaces
            .iter()
            .any(|workspace| workspace.path == request.workspace_path)
        || (!request.workspace_path.is_empty()
            && !path.starts_with(&format!("{}/", request.workspace_path)))
    {
        return Err(invalid_resource());
    }
    Ok(())
}

fn destination_relative(
    session: &RepoSession,
    request: &CaseOperation,
    current: &str,
) -> Result<Option<String>, RepositoryError> {
    Ok(match &request.action {
        CaseAction::Delete => None,
        CaseAction::Rename { filename } => {
            let parent = current.rsplit_once('/').map_or("", |(parent, _)| parent);
            Some(if parent.is_empty() {
                filename.clone()
            } else {
                format!("{parent}/{filename}")
            })
        }
        CaseAction::Move { parent_resource_id } => {
            let parent = super::create::destination(
                session,
                &request.workspace_path,
                parent_resource_id.as_deref(),
            )?;
            let name = current.rsplit('/').next().ok_or_else(invalid_resource)?;
            Some(if parent.is_empty() {
                name.into()
            } else {
                format!("{parent}/{name}")
            })
        }
    })
}

impl RepositoryService {
    /// Renames, moves or explicitly deletes one registered case. Order/notes/snapshots/index stay byte exact.
    ///
    /// # Errors
    /// Refuses stale revisions, destinations, collisions, read-only files and filesystem errors.
    pub fn organize_case(
        &self,
        token: &str,
        request: &CaseOperation,
    ) -> Result<CaseOperationDto, RepositoryError> {
        request.validate()?;
        let mut sessions = self.sessions.lock().map_err(|_| registry_error())?;
        let session = sessions.by_id.get_mut(token).ok_or_else(invalid_session)?;
        super::git_sync::ensure_writable(session)?;
        let resource = session
            .resources
            .get(&request.resource_id)
            .ok_or_else(invalid_resource)?
            .clone();
        if resource.kind != ResourceKind::Case {
            return Err(invalid_resource());
        }
        check_workspace(session, request, &resource.relative)?;
        let source = resolve_regular_file(&session.root, &resource.relative)?;
        if source != resource.canonical {
            return Err(stale_resource());
        }
        let raw = super::read_utf8_limited(&source, super::MAX_REPOSITORY_FILE_BYTES)?;
        if atomic::revision(raw.as_bytes()) != request.expected_revision {
            return Err(RepositoryError::new(
                RepositoryErrorCode::ExternalChange,
                "Файл изменён извне.",
            ));
        }
        if crate::domain::formats::CaseDocument::parse(&raw)
            .map_err(|_| invalid_resource())?
            .model()
            .id
            .is_none()
        {
            return Err(RepositoryError::new(
                RepositoryErrorCode::ReadOnlyCase,
                "Кейс без id доступен только для чтения.",
            ));
        }
        let relative = destination_relative(session, request, &resource.relative)?;
        if relative.as_ref().is_some_and(|path| path.len() > 1024) {
            return Err(RepositoryError::new(
                RepositoryErrorCode::InvalidCaseEdit,
                "Путь кейса превышает 1024 байта.",
            ));
        }
        if relative.as_deref() == Some(&resource.relative) {
            return Ok(CaseOperationDto { path: relative });
        }
        let destination = relative
            .as_ref()
            .map(|path| {
                let (parent, name) = path.rsplit_once('/').unwrap_or(("", path));
                let parent = if parent.is_empty() {
                    session.root.0.clone()
                } else {
                    resolve_directory(&session.root, parent)?
                };
                // A case cannot become a folder companion note. Check files and links alike.
                let stem = name.strip_suffix(".md").ok_or_else(invalid_resource)?;
                match std::fs::symlink_metadata(parent.join(stem)) {
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    _ => return Err(invalid_resource()),
                }
                Ok(parent.join(name))
            })
            .transpose()?;
        if !atomic::organize(&source, &request.expected_revision, destination.as_deref()).map_err(
            |_| {
                RepositoryError::new(
                    RepositoryErrorCode::SaveFailed,
                    "Не удалось выполнить операцию с кейсом.",
                )
            },
        )? {
            return Err(RepositoryError::new(
                RepositoryErrorCode::ExternalChange,
                "Файл изменён извне.",
            ));
        }
        session.resources.retain(|_, item| item.canonical != source);
        Ok(CaseOperationDto { path: relative })
    }
}

#[cfg(test)]
mod tests {
    use super::super::CatalogEntryDto;
    use super::*;
    use std::{fs, path::Path, process::Command};
    const SOURCE: &str = "---\r\nid: stable-id\r\ntitle: Case\r\ncustom: {keep: yes}\r\n---\r\n## Vendor\r\nPreserve\r\n";
    fn fixture(root: &Path) -> (RepositoryService, String, String, String) {
        assert!(
            Command::new("git")
                .args(["init", "--quiet"])
                .current_dir(root)
                .status()
                .unwrap()
                .success()
        );
        fs::create_dir_all(root.join(".casewright/runs/old")).unwrap();
        fs::write(
            root.join(".casewright/config.yaml"),
            "version: 1\nworkspaces:\n  - .\n",
        )
        .unwrap();
        fs::write(
            root.join(".casewright/runs/old/001-stable-id.md"),
            "immutable snapshot",
        )
        .unwrap();
        fs::create_dir(root.join("target")).unwrap();
        fs::write(root.join("target.md"), "Folder note").unwrap();
        fs::write(root.join("case.md"), SOURCE).unwrap();
        fs::write(root.join(".order"), "case\r\nunknown-key\r\ntarget\r\n").unwrap();
        fs::write(root.join("foreign.txt"), "staged").unwrap();
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
    fn request(resource: String, action: CaseAction) -> CaseOperation {
        CaseOperation {
            workspace_path: String::new(),
            resource_id: resource,
            expected_revision: atomic::revision(SOURCE.as_bytes()),
            action,
        }
    }
    #[test]
    fn move_then_delete_changes_only_the_confirmed_case_and_invalidates_old_resources() {
        let temp = tempfile::tempdir().unwrap();
        let (service, token, folder, resource) = fixture(temp.path());
        let order = fs::read(temp.path().join(".order")).unwrap();
        let index = fs::read(temp.path().join(".git/index")).unwrap();
        let moved = service
            .organize_case(
                &token,
                &request(
                    resource.clone(),
                    CaseAction::Move {
                        parent_resource_id: Some(folder),
                    },
                ),
            )
            .unwrap();
        assert_eq!(moved.path.as_deref(), Some("target/case.md"));
        assert!(!temp.path().join("case.md").exists());
        assert_eq!(
            fs::read_to_string(temp.path().join("target/case.md")).unwrap(),
            SOURCE
        );
        assert!(service.read_case(&token, &resource).is_err());
        let catalog = service.catalog_workspace(&token, "").unwrap();
        let resource = catalog
            .entries
            .into_iter()
            .find_map(|entry| match entry {
                CatalogEntryDto::Case { resource_id, .. } => Some(resource_id),
                CatalogEntryDto::Folder { .. } => None,
            })
            .unwrap();
        assert_eq!(
            service
                .read_case(&token, &resource)
                .unwrap()
                .model
                .id
                .as_deref(),
            Some("stable-id")
        );
        assert!(
            service
                .organize_case(&token, &request(resource, CaseAction::Delete))
                .unwrap()
                .path
                .is_none()
        );
        assert!(!temp.path().join("target/case.md").exists());
        assert_eq!(fs::read(temp.path().join(".order")).unwrap(), order);
        assert_eq!(fs::read(temp.path().join(".git/index")).unwrap(), index);
        assert_eq!(
            fs::read_to_string(temp.path().join("target.md")).unwrap(),
            "Folder note"
        );
        assert_eq!(
            fs::read_to_string(temp.path().join(".casewright/runs/old/001-stable-id.md")).unwrap(),
            "immutable snapshot"
        );
    }
    #[test]
    fn collision_external_change_and_read_only_file_are_refused_without_data_loss() {
        let temp = tempfile::tempdir().unwrap();
        let (service, token, folder, resource) = fixture(temp.path());
        fs::write(temp.path().join("target/case.md"), "existing target").unwrap();
        assert!(
            service
                .organize_case(
                    &token,
                    &request(
                        resource.clone(),
                        CaseAction::Move {
                            parent_resource_id: Some(folder)
                        }
                    )
                )
                .is_err()
        );
        assert_eq!(
            fs::read_to_string(temp.path().join("target/case.md")).unwrap(),
            "existing target"
        );
        assert_eq!(
            fs::read_to_string(temp.path().join("case.md")).unwrap(),
            SOURCE
        );
        fs::write(
            temp.path().join("case.md"),
            SOURCE.replace("Case", "External"),
        )
        .unwrap();
        assert_eq!(
            service
                .organize_case(&token, &request(resource.clone(), CaseAction::Delete))
                .unwrap_err()
                .code,
            RepositoryErrorCode::ExternalChange
        );
        fs::write(temp.path().join("case.md"), SOURCE).unwrap();
        let path = temp.path().join("case.md");
        let original = fs::metadata(&path).unwrap().permissions();
        let mut readonly = original.clone();
        readonly.set_readonly(true);
        fs::set_permissions(&path, readonly).unwrap();
        assert!(
            service
                .organize_case(&token, &request(resource, CaseAction::Delete))
                .is_err()
        );
        fs::set_permissions(&path, original).unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), SOURCE);
    }
    #[test]
    fn rename_keeps_raw_markdown_identity_snapshots_order_notes_and_index() {
        let temp = tempfile::tempdir().unwrap();
        let (service, token, _, resource) = fixture(temp.path());
        let index = fs::read(temp.path().join(".git/index")).unwrap();
        let order = fs::read(temp.path().join(".order")).unwrap();
        let result = service
            .organize_case(
                &token,
                &request(
                    resource.clone(),
                    CaseAction::Rename {
                        filename: "renamed-case.md".into(),
                    },
                ),
            )
            .unwrap();
        assert_eq!(result.path.as_deref(), Some("renamed-case.md"));
        assert!(!temp.path().join("case.md").exists());
        assert_eq!(
            fs::read(temp.path().join("renamed-case.md")).unwrap(),
            SOURCE.as_bytes()
        );
        assert!(service.read_case(&token, &resource).is_err());
        let catalog = service.catalog_workspace(&token, "").unwrap();
        let new_resource = catalog
            .entries
            .iter()
            .find_map(|entry| {
                if let CatalogEntryDto::Case {
                    resource_id, path, ..
                } = entry
                {
                    (path == "renamed-case.md").then_some(resource_id)
                } else {
                    None
                }
            })
            .unwrap();
        assert_eq!(
            service
                .read_case(&token, new_resource)
                .unwrap()
                .model
                .id
                .as_deref(),
            Some("stable-id")
        );
        assert_eq!(fs::read(temp.path().join(".git/index")).unwrap(), index);
        assert_eq!(fs::read(temp.path().join(".order")).unwrap(), order);
        assert_eq!(
            fs::read_to_string(temp.path().join("target.md")).unwrap(),
            "Folder note"
        );
        assert_eq!(
            fs::read_to_string(temp.path().join(".casewright/runs/old/001-stable-id.md")).unwrap(),
            "immutable snapshot"
        );
    }
    #[test]
    fn rename_refuses_collisions_companion_notes_system_names_and_external_revisions() {
        let temp = tempfile::tempdir().unwrap();
        let (service, token, _, resource) = fixture(temp.path());
        fs::write(temp.path().join("existing.md"), "unrelated").unwrap();
        for filename in [
            "existing.md",
            "target.md",
            "_suite.md",
            "_run.md",
            "../escape.md",
            "CON.md",
            "name:stream.md",
        ] {
            assert!(
                service
                    .organize_case(
                        &token,
                        &request(
                            resource.clone(),
                            CaseAction::Rename {
                                filename: filename.into()
                            }
                        )
                    )
                    .is_err()
            );
            assert_eq!(
                fs::read(temp.path().join("case.md")).unwrap(),
                SOURCE.as_bytes()
            );
        }
        assert_eq!(
            fs::read_to_string(temp.path().join("existing.md")).unwrap(),
            "unrelated"
        );
        fs::write(
            temp.path().join("case.md"),
            SOURCE.replace("Case", "External"),
        )
        .unwrap();
        assert_eq!(
            service
                .organize_case(
                    &token,
                    &request(
                        resource,
                        CaseAction::Rename {
                            filename: "safe.md".into()
                        }
                    )
                )
                .unwrap_err()
                .code,
            RepositoryErrorCode::ExternalChange
        );
        assert!(!temp.path().join("safe.md").exists());
    }
}
