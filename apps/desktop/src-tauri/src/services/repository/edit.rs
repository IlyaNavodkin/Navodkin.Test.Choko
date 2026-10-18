use super::{
    CaseDocumentDto, MAX_REPOSITORY_FILE_BYTES, RepositoryError, RepositoryErrorCode,
    RepositoryService, ResourceKind, atomic, invalid_resource, invalid_session, read_utf8_limited,
    registry_error, resolve_regular_file, stale_resource,
};
use crate::domain::formats::{CaseDocument, CaseModel, CaseSetupItem, CaseStatus, CaseStep};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CaseEdit {
    pub display_id: String,
    pub title: String,
    pub slug: Option<String>,
    pub status: CaseStatus,
    pub tags: Vec<String>,
    pub objective: String,
    pub systems: Vec<String>,
    pub setup: Vec<CaseSetupItem>,
    pub steps: Vec<CaseStep>,
    pub acceptance_criteria: Vec<String>,
}

fn invalid_edit() -> RepositoryError {
    RepositoryError::new(
        RepositoryErrorCode::InvalidCaseEdit,
        "Поля кейса недопустимы.",
    )
}

impl CaseEdit {
    pub(crate) fn validate(&self) -> Result<(), RepositoryError> {
        if self.title.trim().is_empty()
            || self.title.len() > 4096
            || self.display_id.len() > 512
            || self.slug.as_ref().is_some_and(|value| value.len() > 4096)
            || self.steps.len() > 2000
            || self.setup.len() > 1000
            || self.tags.len() > 1000
            || self.systems.len() > 1000
            || self.acceptance_criteria.len() > 2000
            || self.steps.iter().any(|step| {
                step.depth > 3 || step.text.trim().is_empty() || step.text.contains(['\n', '\r'])
            })
            || self.steps.first().is_some_and(|step| step.depth != 0)
            || self
                .steps
                .windows(2)
                .any(|pair| pair[1].depth > pair[0].depth + 1)
            || self
                .setup
                .iter()
                .any(|item| item.name.contains(['\n', '\r']))
            || self
                .tags
                .iter()
                .chain(&self.systems)
                .chain(&self.acceptance_criteria)
                .any(|value| value.contains(['\n', '\r']) || value.trim().is_empty())
        {
            return Err(invalid_edit());
        }
        if serde_json::to_vec(self).map_err(|_| invalid_edit())?.len() > MAX_REPOSITORY_FILE_BYTES {
            return Err(invalid_edit());
        }
        Ok(())
    }

    fn apply(mut self, document: &mut CaseDocument) -> Result<(), RepositoryError> {
        // Normalize only the edited typed Markdown values to the parser's semantics.
        // This does not rewrite untouched raw sections, frontmatter or unknown content.
        self.objective
            .replace("\r\n", "\n")
            .trim()
            .clone_into(&mut self.objective);
        for value in self.systems.iter_mut().chain(&mut self.acceptance_criteria) {
            *value = value.trim().to_owned();
        }
        for step in &mut self.steps {
            step.text = step.text.trim().to_owned();
        }
        for item in &mut self.setup {
            item.name = item.name.trim().to_owned();
            let mut lines: Vec<_> = item
                .body
                .lines()
                .skip_while(|line| line.trim().is_empty())
                .collect();
            while lines.last().is_some_and(|line| line.trim().is_empty()) {
                lines.pop();
            }
            item.body = lines.join("\n");
        }
        let original = document.model().clone();
        if self.title != original.title {
            document.set_title(self.title);
        }
        if self.display_id != original.display_id {
            document.set_display_id(self.display_id);
        }
        if self.slug != original.slug {
            document.set_slug(self.slug);
        }
        if self.status != original.status {
            document.set_status(self.status);
        }
        if self.tags != original.tags {
            document.set_tags(self.tags);
        }
        let format_error = |_| {
            RepositoryError::new(
                RepositoryErrorCode::InvalidCaseEdit,
                "Изменение нарушает структуру Markdown или сохранение неизвестного содержимого.",
            )
        };
        if self.objective != original.objective {
            document
                .set_objective(self.objective)
                .map_err(format_error)?;
        }
        if self.systems != original.systems {
            document.set_systems(self.systems).map_err(format_error)?;
        }
        if self.setup != original.setup {
            document.set_setup(self.setup).map_err(format_error)?;
        }
        if self.steps != original.steps {
            document.set_steps(self.steps).map_err(format_error)?;
        }
        if self.acceptance_criteria != original.acceptance_criteria {
            document
                .set_acceptance_criteria(self.acceptance_criteria)
                .map_err(format_error)?;
        }
        Ok(())
    }
}

impl RepositoryService {
    /// Serializes native writes with session reads/close and compares the exact source revision.
    /// # Errors
    /// Rejects stale/unregistered resources, missing IDs, invalid edits, external changes and IO failures.
    pub fn save_case(
        &self,
        token: &str,
        resource_id: &str,
        expected_revision: &str,
        edit: CaseEdit,
    ) -> Result<CaseDocumentDto, RepositoryError> {
        edit.validate()?;
        if expected_revision.len() != 64
            || !expected_revision
                .bytes()
                .all(|value| value.is_ascii_digit() || (b'a'..=b'f').contains(&value))
        {
            return Err(invalid_edit());
        }
        let sessions = self.sessions.lock().map_err(|_| registry_error())?;
        let session = sessions.by_id.get(token).ok_or_else(invalid_session)?;
        super::git_sync::ensure_writable(session)?;
        let resource = session
            .resources
            .get(resource_id)
            .ok_or_else(invalid_resource)?;
        if resource.kind != ResourceKind::Case {
            return Err(invalid_resource());
        }
        let path = resolve_regular_file(&session.root, &resource.relative)?;
        if path != resource.canonical {
            return Err(stale_resource());
        }
        let text = read_utf8_limited(&path, MAX_REPOSITORY_FILE_BYTES)?;
        if atomic::revision(text.as_bytes()) != expected_revision {
            return Err(external_change());
        }
        let mut document = CaseDocument::parse(&text).map_err(|_| invalid_edit())?;
        if document.model().id.is_none() {
            return Err(RepositoryError::new(
                RepositoryErrorCode::ReadOnlyCase,
                "Кейс без корректного stable id доступен только для чтения.",
            ));
        }
        edit.apply(&mut document)?;
        let next = document.to_text().map_err(|_| invalid_edit())?;
        let saved = CaseDocument::parse(&next).map_err(|_| invalid_edit())?;
        if next != text
            && !atomic::replace(&path, expected_revision, next.as_bytes()).map_err(|_| {
                RepositoryError::new(
                    RepositoryErrorCode::SaveFailed,
                    "Не удалось атомарно сохранить кейс. Черновик сохранён в редакторе.",
                )
            })?
        {
            return Err(external_change());
        }
        Ok(CaseDocumentDto {
            model: saved.model().clone(),
            warnings: saved.warnings().to_vec(),
            revision: atomic::revision(next.as_bytes()),
        })
    }
}

fn external_change() -> RepositoryError {
    RepositoryError::new(
        RepositoryErrorCode::ExternalChange,
        "Файл изменён вне редактора. Черновик не записан поверх новой версии.",
    )
}

impl From<CaseModel> for CaseEdit {
    fn from(model: CaseModel) -> Self {
        Self {
            display_id: model.display_id,
            title: model.title,
            slug: model.slug,
            status: model.status,
            tags: model.tags,
            objective: model.objective,
            systems: model.systems,
            setup: model.setup,
            steps: model.steps,
            acceptance_criteria: model.acceptance_criteria,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::repository::CatalogEntryDto;
    use std::{fs, path::Path, process::Command, sync::Arc, thread};
    const SOURCE: &str = "---\r\nid: stable-case\r\ntitle: Original\r\nstatus: active\r\ncustom: {owner: QA}\r\n---\r\n\r\n## Objective\r\nOriginal objective\r\n\r\n## Vendor Extension\r\nKeep exactly.\r\n";
    fn fixture(root: &Path, source: &str) -> (RepositoryService, String, String) {
        fs::create_dir_all(root.join(".casewright")).unwrap();
        assert!(
            Command::new("git")
                .args(["init", "--quiet"])
                .current_dir(root)
                .status()
                .unwrap()
                .success()
        );
        fs::write(
            root.join(".casewright/config.yaml"),
            "version: 1\nname: Editing fixture\nworkspaces:\n  - .\n",
        )
        .unwrap();
        fs::write(root.join("case.md"), source).unwrap();
        fs::write(root.join("foreign.txt"), "foreign index entry").unwrap();
        assert!(
            Command::new("git")
                .args(["add", "--", "foreign.txt"])
                .current_dir(root)
                .status()
                .unwrap()
                .success()
        );
        let service = RepositoryService::default();
        let session = service.open(root).unwrap().session_id;
        let resource = service
            .catalog_workspace(&session, "")
            .unwrap()
            .entries
            .into_iter()
            .find_map(|entry| match entry {
                CatalogEntryDto::Case { resource_id, .. } => Some(resource_id),
                CatalogEntryDto::Folder { .. } => None,
            })
            .unwrap();
        (service, session, resource)
    }
    #[test]
    fn save_and_reopen_preserve_identity_unknown_content_crlf_and_foreign_index() {
        let temp = tempfile::tempdir().unwrap();
        let (service, session, resource) = fixture(temp.path(), SOURCE);
        let index = fs::read(temp.path().join(".git/index")).unwrap();
        let before = service.read_case(&session, &resource).unwrap();
        let mut edit = CaseEdit::from(before.model);
        edit.title = "Updated".into();
        edit.objective = "\nNew objective\n\n".into();
        edit.setup = vec![CaseSetupItem {
            name: "  Account  ".into(),
            body: "\n    Preserve indentation\n\n".into(),
        }];
        edit.steps = vec![
            CaseStep {
                text: "Parent".into(),
                depth: 0,
            },
            CaseStep {
                text: "Nested".into(),
                depth: 1,
            },
        ];
        let saved = service
            .save_case(&session, &resource, &before.revision, edit)
            .unwrap();
        assert_eq!(saved.model.id.as_deref(), Some("stable-case"));
        assert_eq!(saved.model.title, "Updated");
        assert_eq!(saved.model.objective, "New objective");
        assert_eq!(saved.model.setup[0].body, "    Preserve indentation");
        assert_eq!(saved.model.steps[1].depth, 1);
        assert_ne!(saved.revision, before.revision);
        let reopened = service.read_case(&session, &resource).unwrap();
        assert_eq!(saved.model, reopened.model);
        let output = fs::read_to_string(temp.path().join("case.md")).unwrap();
        assert!(output.contains("custom: {owner: QA}"));
        assert!(output.contains("## Vendor Extension\r\nKeep exactly."));
        assert!(!output.replace("\r\n", "").contains('\n'));
        assert_eq!(index, fs::read(temp.path().join(".git/index")).unwrap());
    }
    #[test]
    fn external_change_and_invalid_edit_never_overwrite_source() {
        let temp = tempfile::tempdir().unwrap();
        let (service, session, resource) = fixture(temp.path(), SOURCE);
        let before = service.read_case(&session, &resource).unwrap();
        let mut edit = CaseEdit::from(before.model.clone());
        edit.title.clear();
        assert_eq!(
            service
                .save_case(&session, &resource, &before.revision, edit)
                .unwrap_err()
                .code,
            RepositoryErrorCode::InvalidCaseEdit
        );
        assert_eq!(
            fs::read_to_string(temp.path().join("case.md")).unwrap(),
            SOURCE
        );
        let external = SOURCE.replace("Original", "External");
        fs::write(temp.path().join("case.md"), &external).unwrap();
        assert_eq!(
            service
                .save_case(
                    &session,
                    &resource,
                    &before.revision,
                    CaseEdit::from(before.model)
                )
                .unwrap_err()
                .code,
            RepositoryErrorCode::ExternalChange
        );
        assert_eq!(
            fs::read_to_string(temp.path().join("case.md")).unwrap(),
            external
        );
    }
    #[test]
    fn concurrent_saves_are_serialized_and_only_one_original_revision_succeeds() {
        let temp = tempfile::tempdir().unwrap();
        let (service, session, resource) = fixture(temp.path(), SOURCE);
        let before = service.read_case(&session, &resource).unwrap();
        let service = Arc::new(service);
        let workers: Vec<_> = ["one", "two"]
            .into_iter()
            .map(|title| {
                let service = Arc::clone(&service);
                let session = session.clone();
                let resource = resource.clone();
                let revision = before.revision.clone();
                let mut edit = CaseEdit::from(before.model.clone());
                edit.title = title.into();
                thread::spawn(move || service.save_case(&session, &resource, &revision, edit))
            })
            .collect();
        let results: Vec<_> = workers
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .collect();
        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert_eq!(results.iter().filter(|result| matches!(result, Err(error) if error.code == RepositoryErrorCode::ExternalChange)).count(), 1);
    }
    #[test]
    fn missing_id_keeps_original_file_and_closed_session_is_invalid() {
        let temp = tempfile::tempdir().unwrap();
        let no_id = SOURCE.replace("id: stable-case\r\n", "");
        let (service, session, resource) = fixture(temp.path(), &no_id);
        let before = service.read_case(&session, &resource).unwrap();
        assert_eq!(
            service
                .save_case(
                    &session,
                    &resource,
                    &before.revision,
                    CaseEdit::from(before.model)
                )
                .unwrap_err()
                .code,
            RepositoryErrorCode::ReadOnlyCase
        );
        assert_eq!(
            fs::read_to_string(temp.path().join("case.md")).unwrap(),
            no_id
        );
        service.close(&session).unwrap();
        assert!(service.read_case(&session, &resource).is_err());
    }
    #[test]
    fn read_only_target_refuses_save_without_changing_bytes() {
        let temp = tempfile::tempdir().unwrap();
        let (service, session, resource) = fixture(temp.path(), SOURCE);
        let before = service.read_case(&session, &resource).unwrap();
        let path = temp.path().join("case.md");
        let original_permissions = fs::metadata(&path).unwrap().permissions();
        let mut readonly = original_permissions.clone();
        readonly.set_readonly(true);
        fs::set_permissions(&path, readonly).unwrap();
        let mut edit = CaseEdit::from(before.model);
        edit.title = "Must not save".into();
        let result = service.save_case(&session, &resource, &before.revision, edit);
        fs::set_permissions(&path, original_permissions).unwrap();
        assert_eq!(result.unwrap_err().code, RepositoryErrorCode::SaveFailed);
        assert_eq!(fs::read_to_string(path).unwrap(), SOURCE);
    }
}
