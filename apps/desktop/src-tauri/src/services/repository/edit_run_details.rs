use super::{
    MAX_RUN_DETAILS_FILE_BYTES, RepositoryError, RepositoryErrorCode, RepositoryService,
    ResourceKind, RunResourceDocumentDto, atomic, invalid_resource, invalid_session,
    read_utf8_limited, registry_error, resolve_regular_file, stale_resource,
};
use crate::domain::formats::{RunDetailsDocument, RunStatus};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunDetailsEdit {
    pub status: RunStatus,
    pub summary: String,
    pub notes: String,
}

fn invalid_edit() -> RepositoryError {
    RepositoryError::new(
        RepositoryErrorCode::InvalidRunEdit,
        "Поля или структура прогона недопустимы.",
    )
}
impl RunDetailsEdit {
    pub(crate) fn validate(&self) -> Result<(), RepositoryError> {
        if serde_json::to_vec(self).map_err(|_| invalid_edit())?.len() > MAX_RUN_DETAILS_FILE_BYTES
        {
            return Err(invalid_edit());
        }
        Ok(())
    }
}

impl RepositoryService {
    /// Saves explicit status, Summary and Notes edits without changing approvals or other metadata.
    /// # Errors
    /// Rejects invalid payloads/resources, changed files, ambiguous sections and failed writes.
    pub fn save_run_details(
        &self,
        token: &str,
        resource_id: &str,
        expected_revision: &str,
        edit: &RunDetailsEdit,
    ) -> Result<RunResourceDocumentDto, RepositoryError> {
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
        if resource.kind != ResourceKind::RunDetails {
            return Err(invalid_resource());
        }
        let path = resolve_regular_file(&session.root, &resource.relative)?;
        if path != resource.canonical {
            return Err(stale_resource());
        }
        let raw = read_utf8_limited(&path, MAX_RUN_DETAILS_FILE_BYTES)?;
        let external = || {
            RepositoryError::new(
                RepositoryErrorCode::ExternalChange,
                "Файл изменён извне; черновик не записан.",
            )
        };
        if atomic::revision(raw.as_bytes()) != expected_revision {
            return Err(external());
        }
        let mut document = RunDetailsDocument::parse(&raw).map_err(|_| invalid_edit())?;
        let original = document.model().clone();
        document.set_status(edit.status);
        let summary = edit.summary.replace("\r\n", "\n").trim().to_owned();
        let notes = edit.notes.replace("\r\n", "\n").trim().to_owned();
        if summary != original.summary {
            document.set_summary(summary).map_err(|_| invalid_edit())?;
        }
        if notes != original.notes {
            document.set_notes(notes).map_err(|_| invalid_edit())?;
        }
        let next = document.to_text().map_err(|_| invalid_edit())?;
        let saved = RunDetailsDocument::parse(&next).map_err(|_| invalid_edit())?;
        if next != raw
            && !atomic::replace(&path, expected_revision, next.as_bytes()).map_err(|_| {
                RepositoryError::new(
                    RepositoryErrorCode::SaveFailed,
                    "Не удалось сохранить прогон; черновик остаётся в редакторе.",
                )
            })?
        {
            return Err(external());
        }
        Ok(RunResourceDocumentDto::Details {
            model: saved.model().clone(),
            warnings: saved.warnings().to_vec(),
            revision: atomic::revision(next.as_bytes()),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, process::Command};
    const SOURCE: &str = "---\r\n# approval comment\r\nname: Frozen run\r\nstatus: open\r\ncreated: '2026-10-14T12:00:00Z'\r\ntest_date: '2026-10-14'\r\nscope: '${scope}'\r\ntester_approval: {name: QA, at: '2026-10-14', extension: keep}\r\nreviewer_approval: {name: Reviewer, at: today}\r\ncustom: {nested: [one, two]}\r\n---\r\n\r\n## Summary\r\nOriginal summary\r\n\r\n## Notes\r\n${variable}\r\n\r\n## Vendor\r\nKeep exactly.\r\n";
    fn fixture(root: &std::path::Path, source: &str) -> (RepositoryService, String, String) {
        assert!(
            Command::new("git")
                .args(["init", "--quiet"])
                .current_dir(root)
                .status()
                .unwrap()
                .success()
        );
        fs::create_dir_all(root.join(".casewright/runs/run")).unwrap();
        fs::write(
            root.join(".casewright/config.yaml"),
            "version: 1\nworkspaces:\n  - .\n",
        )
        .unwrap();
        fs::write(root.join(".casewright/runs/run/_run.md"), source).unwrap();
        fs::write(
            root.join(".casewright/runs/run/case.md"),
            "---\ncase_id: stable\nresult: not_run\n---\n## Notes\n${value}\n",
        )
        .unwrap();
        fs::write(root.join("foreign.txt"), "index unchanged").unwrap();
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
        let resource = service.catalog_runs(&session).unwrap().runs[0]
            .details_resource_id
            .clone()
            .unwrap();
        (service, session, resource)
    }
    fn data(value: RunResourceDocumentDto) -> (crate::domain::formats::RunDetailsModel, String) {
        match value {
            RunResourceDocumentDto::Details {
                model, revision, ..
            } => (model, revision),
            RunResourceDocumentDto::Case { .. } => panic!("details"),
        }
    }
    fn edit() -> RunDetailsEdit {
        RunDetailsEdit {
            status: RunStatus::Closed,
            summary: "Updated summary".into(),
            notes: "${variable}\nExecution notes".into(),
        }
    }
    #[test]
    fn close_reopen_preserves_approvals_dates_unknown_content_and_unrelated_files() {
        let temp = tempfile::tempdir().unwrap();
        let (service, session, resource) = fixture(temp.path(), SOURCE);
        let index = fs::read(temp.path().join(".git/index")).unwrap();
        let case = fs::read(temp.path().join(".casewright/runs/run/case.md")).unwrap();
        let (original, revision) = data(service.read_run(&session, &resource).unwrap());
        let (closed, revision) = data(
            service
                .save_run_details(&session, &resource, &revision, &edit())
                .unwrap(),
        );
        assert_eq!(closed.status, RunStatus::Closed);
        assert_eq!(closed.notes, "${variable}\nExecution notes");
        assert_eq!(closed.tester_approval, original.tester_approval);
        assert_eq!(closed.reviewer_approval, original.reviewer_approval);
        assert_eq!(closed.test_date, original.test_date);
        assert_eq!(closed.scope, original.scope);
        assert_eq!(closed.created, original.created);
        let mut reopened = edit();
        reopened.status = RunStatus::Open;
        let (saved, _) = data(
            service
                .save_run_details(&session, &resource, &revision, &reopened)
                .unwrap(),
        );
        assert_eq!(
            saved,
            data(service.read_run(&session, &resource).unwrap()).0
        );
        let output = fs::read_to_string(temp.path().join(".casewright/runs/run/_run.md")).unwrap();
        for fragment in [
            "# approval comment",
            "tester_approval: {name: QA, at: '2026-10-14', extension: keep}",
            "custom: {nested: [one, two]}",
            "## Vendor\r\nKeep exactly.",
        ] {
            assert!(output.contains(fragment), "{fragment}");
        }
        assert!(!output.replace("\r\n", "").contains('\n'));
        assert_eq!(index, fs::read(temp.path().join(".git/index")).unwrap());
        assert_eq!(
            case,
            fs::read(temp.path().join(".casewright/runs/run/case.md")).unwrap()
        );
    }
    #[test]
    fn external_change_and_duplicate_notes_refuse_overwrite() {
        let temp = tempfile::tempdir().unwrap();
        let (service, session, resource) = fixture(temp.path(), SOURCE);
        let (_, revision) = data(service.read_run(&session, &resource).unwrap());
        let path = temp.path().join(".casewright/runs/run/_run.md");
        let external = format!("{SOURCE}\r\n## Notes\r\nDuplicate\r\n");
        fs::write(&path, &external).unwrap();
        assert_eq!(
            service
                .save_run_details(&session, &resource, &revision, &edit())
                .unwrap_err()
                .code,
            RepositoryErrorCode::ExternalChange
        );
        let (_, current) = data(service.read_run(&session, &resource).unwrap());
        assert_eq!(
            service
                .save_run_details(&session, &resource, &current, &edit())
                .unwrap_err()
                .code,
            RepositoryErrorCode::InvalidRunEdit
        );
        assert_eq!(fs::read_to_string(path).unwrap(), external);
    }
}
