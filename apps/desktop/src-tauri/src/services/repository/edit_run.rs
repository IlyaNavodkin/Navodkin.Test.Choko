use super::{
    MAX_REPOSITORY_FILE_BYTES, RepositoryError, RepositoryErrorCode, RepositoryService,
    ResourceKind, RunResourceDocumentDto, atomic, invalid_resource, invalid_session,
    read_utf8_limited, registry_error, resolve_regular_file, stale_resource,
};
use crate::domain::formats::{
    RunCaseDocument, RunCaseModel, RunCheckState, RunChecklistItem, RunResult,
};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunCheckEdit {
    pub key: String,
    pub state: RunCheckState,
    pub fail_note: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, process::Command};
    const SOURCE: &str = "---\r\ncase_id: stable\r\ntitle: Frozen\r\nresult: not_run\r\ncustom: {owner: QA}\r\ntest_date: '2026-10-14'\r\n---\r\n\r\n## Steps\r\n- [ ] 1. 1. Numeric text\r\n- [ ] 2. Next step\r\n\r\n## Notes\r\n${variable}\r\n\r\n## Vendor\r\nKeep exactly.\r\n";
    fn fixture(root: &std::path::Path) -> (RepositoryService, String, String) {
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
        fs::write(root.join(".casewright/runs/run/case.md"), SOURCE).unwrap();
        fs::write(root.join(".casewright/runs/run/_run.md"), "---\nname: Run\nstatus: open\ntester_approval: {name: QA, at: today}\n---\n## Notes\n${value}\n").unwrap();
        fs::write(root.join("foreign.txt"), "index untouched").unwrap();
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
        let resource = service.catalog_runs(&session).unwrap().runs[0].cases[0]
            .resource_id
            .clone();
        (service, session, resource)
    }
    fn data(value: RunResourceDocumentDto) -> (RunCaseModel, String) {
        match value {
            RunResourceDocumentDto::Case {
                model, revision, ..
            } => (model, revision),
            RunResourceDocumentDto::Details { .. } => panic!("run case"),
        }
    }
    #[test]
    fn save_reopen_preserves_numeric_text_unknown_crlf_and_unrelated_files() {
        let temp = tempfile::tempdir().unwrap();
        let (service, session, resource) = fixture(temp.path());
        let index = fs::read(temp.path().join(".git/index")).unwrap();
        let details = fs::read(temp.path().join(".casewright/runs/run/_run.md")).unwrap();
        let (model, revision) = data(service.read_run(&session, &resource).unwrap());
        let mut edit = RunCaseEdit::from(model);
        edit.result = RunResult::Fail;
        edit.tester = "QA".into();
        edit.executed_at = "2026-10-14T12:00:00Z".into();
        edit.steps[0].state = RunCheckState::Fail;
        edit.steps[0].fail_note = "Actual differs".into();
        edit.notes = "${variable}\nSaved note".into();
        let (saved, next) = data(
            service
                .save_run_case(&session, &resource, &revision, edit)
                .unwrap(),
        );
        assert_ne!(next, revision);
        assert_eq!(saved.steps[0].text, "1. Numeric text");
        assert_eq!(saved.steps[0].fail_note, "Actual differs");
        assert_eq!(saved.test_date.as_deref(), Some("2026-10-14"));
        assert_eq!(
            saved,
            data(service.read_run(&session, &resource).unwrap()).0
        );
        let output = fs::read_to_string(temp.path().join(".casewright/runs/run/case.md")).unwrap();
        assert!(output.contains("custom: {owner: QA}"));
        assert!(output.contains("## Vendor\r\nKeep exactly."));
        assert!(!output.replace("\r\n", "").contains('\n'));
        assert_eq!(index, fs::read(temp.path().join(".git/index")).unwrap());
        assert_eq!(
            details,
            fs::read(temp.path().join(".casewright/runs/run/_run.md")).unwrap()
        );
    }
    #[test]
    fn all_results_and_check_states_round_trip_without_editing_snapshot_bytes() {
        let temp = tempfile::tempdir().unwrap();
        let (service, session, resource) = fixture(temp.path());
        let snapshot = temp.path().join(".casewright/runs/run/case.source");
        fs::write(&snapshot, "Unknown raw source\r\n${variable}\r\n").unwrap();
        let original = fs::read(&snapshot).unwrap();
        for result in [
            RunResult::NotRun,
            RunResult::InProgress,
            RunResult::Pass,
            RunResult::Fail,
            RunResult::Blocked,
            RunResult::Skipped,
        ] {
            let (model, revision) = data(service.read_run(&session, &resource).unwrap());
            let mut edit = RunCaseEdit::from(model);
            edit.result = result;
            edit.steps[0].state = if result == RunResult::Fail {
                RunCheckState::Fail
            } else if result == RunResult::Pass {
                RunCheckState::Pass
            } else {
                RunCheckState::None
            };
            edit.steps[0].fail_note = if result == RunResult::Fail {
                "failure".into()
            } else {
                String::new()
            };
            let saved = data(
                service
                    .save_run_case(&session, &resource, &revision, edit)
                    .unwrap(),
            )
            .0;
            assert_eq!(saved.result, result);
            assert_eq!(saved.steps[0].text, "1. Numeric text");
            assert_eq!(
                saved,
                data(service.read_run(&session, &resource).unwrap()).0
            );
        }
        assert_eq!(original, fs::read(snapshot).unwrap());
    }
    #[test]
    fn read_only_sidecar_and_wrong_resource_kind_are_refused() {
        let temp = tempfile::tempdir().unwrap();
        let (service, session, resource) = fixture(temp.path());
        let (model, revision) = data(service.read_run(&session, &resource).unwrap());
        let mut edit = RunCaseEdit::from(model);
        edit.result = RunResult::Pass;
        let path = temp.path().join(".casewright/runs/run/case.md");
        let permissions = fs::metadata(&path).unwrap().permissions();
        let mut readonly = permissions.clone();
        readonly.set_readonly(true);
        fs::set_permissions(&path, readonly).unwrap();
        let error = service
            .save_run_case(&session, &resource, &revision, edit.clone())
            .unwrap_err();
        fs::set_permissions(&path, permissions).unwrap();
        assert_eq!(error.code, RepositoryErrorCode::SaveFailed);
        assert_eq!(fs::read_to_string(&path).unwrap(), SOURCE);
        let details = service.catalog_runs(&session).unwrap().runs[0]
            .details_resource_id
            .clone()
            .unwrap();
        assert_eq!(
            service
                .save_run_case(&session, &details, &revision, edit)
                .unwrap_err()
                .code,
            RepositoryErrorCode::InvalidResource
        );
    }
    #[test]
    fn stale_revision_and_changed_check_keys_never_overwrite() {
        let temp = tempfile::tempdir().unwrap();
        let (service, session, resource) = fixture(temp.path());
        let (model, revision) = data(service.read_run(&session, &resource).unwrap());
        let mut edit = RunCaseEdit::from(model.clone());
        edit.steps[0].key = "steps:other".into();
        assert_eq!(
            service
                .save_run_case(&session, &resource, &revision, edit)
                .unwrap_err()
                .code,
            RepositoryErrorCode::InvalidRunEdit
        );
        let path = temp.path().join(".casewright/runs/run/case.md");
        assert_eq!(fs::read_to_string(&path).unwrap(), SOURCE);
        let external = SOURCE.replace("Frozen", "External");
        fs::write(&path, &external).unwrap();
        assert_eq!(
            service
                .save_run_case(&session, &resource, &revision, RunCaseEdit::from(model))
                .unwrap_err()
                .code,
            RepositoryErrorCode::ExternalChange
        );
        assert_eq!(fs::read_to_string(path).unwrap(), external);
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunCaseEdit {
    pub result: RunResult,
    pub tester: String,
    pub executed_at: String,
    pub test_date: Option<String>,
    pub notes: String,
    pub setup: Vec<RunCheckEdit>,
    pub steps: Vec<RunCheckEdit>,
    pub accept: Vec<RunCheckEdit>,
}

fn invalid_edit() -> RepositoryError {
    RepositoryError::new(
        RepositoryErrorCode::InvalidRunEdit,
        "Поля результата или структура прогона недопустимы.",
    )
}

impl RunCaseEdit {
    pub(crate) fn validate(&self) -> Result<(), RepositoryError> {
        if self.tester.len() > 4096
            || self.executed_at.len() > 4096
            || self
                .test_date
                .as_ref()
                .is_some_and(|date| date.len() > 4096)
            || self.setup.len() > 2000
            || self.steps.len() > 2000
            || self.accept.len() > 2000
            || self
                .setup
                .iter()
                .chain(&self.steps)
                .chain(&self.accept)
                .any(|item| {
                    item.key.len() > 64
                        || item.fail_note.len() > 4096
                        || item.fail_note.contains(['\r', '\n'])
                })
            || serde_json::to_vec(self).map_err(|_| invalid_edit())?.len()
                > MAX_REPOSITORY_FILE_BYTES
        {
            return Err(invalid_edit());
        }
        Ok(())
    }

    fn apply(self, document: &mut RunCaseDocument) -> Result<(), RepositoryError> {
        let original = document.model().clone();
        let setup = checks(&original.setup, self.setup)?;
        let steps = checks(&original.steps, self.steps)?;
        let accept = checks(&original.accept, self.accept)?;
        document.set_result(self.result);
        document.set_tester(self.tester);
        document.set_executed_at(self.executed_at);
        document.set_test_date(self.test_date);
        // Only edited sections are serialized; malformed untouched checklist lines stay intact.
        if setup != original.setup {
            document.set_setup(setup).map_err(|_| invalid_edit())?;
        }
        if steps != original.steps {
            document.set_steps(steps).map_err(|_| invalid_edit())?;
        }
        if accept != original.accept {
            document.set_accept(accept).map_err(|_| invalid_edit())?;
        }
        if self.notes.trim() != original.notes {
            document
                .set_notes(self.notes.replace("\r\n", "\n").trim().to_owned())
                .map_err(|_| invalid_edit())?;
        }
        Ok(())
    }
}

fn checks(
    original: &[RunChecklistItem],
    edits: Vec<RunCheckEdit>,
) -> Result<Vec<RunChecklistItem>, RepositoryError> {
    if original.len() != edits.len() {
        return Err(invalid_edit());
    }
    original
        .iter()
        .zip(edits)
        .map(|(item, edit)| {
            if item.key != edit.key {
                return Err(invalid_edit());
            }
            Ok(RunChecklistItem {
                key: item.key.clone(),
                text: item.text.clone(),
                state: edit.state,
                fail_note: if edit.state == RunCheckState::Fail {
                    edit.fail_note.trim().to_owned()
                } else {
                    String::new()
                },
            })
        })
        .collect()
}

impl From<RunCaseModel> for RunCaseEdit {
    fn from(model: RunCaseModel) -> Self {
        fn edits(items: Vec<RunChecklistItem>) -> Vec<RunCheckEdit> {
            items
                .into_iter()
                .map(|item| RunCheckEdit {
                    key: item.key,
                    state: item.state,
                    fail_note: item.fail_note,
                })
                .collect()
        }
        Self {
            result: model.result,
            tester: model.tester,
            executed_at: model.executed_at,
            test_date: model.test_date,
            notes: model.notes,
            setup: edits(model.setup),
            steps: edits(model.steps),
            accept: edits(model.accept),
        }
    }
}

impl RepositoryService {
    /// Saves only execution fields of a registered run sidecar, with optimistic revision checks.
    /// # Errors
    /// Rejects invalid edits, wrong resource kinds, stale paths/revisions and failed writes.
    pub fn save_run_case(
        &self,
        token: &str,
        resource_id: &str,
        expected_revision: &str,
        edit: RunCaseEdit,
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
        if resource.kind != ResourceKind::RunCase {
            return Err(invalid_resource());
        }
        let path = resolve_regular_file(&session.root, &resource.relative)?;
        if path != resource.canonical {
            return Err(stale_resource());
        }
        let raw = read_utf8_limited(&path, MAX_REPOSITORY_FILE_BYTES)?;
        let external = || {
            RepositoryError::new(
                RepositoryErrorCode::ExternalChange,
                "Файл изменён извне; черновик не записан.",
            )
        };
        if atomic::revision(raw.as_bytes()) != expected_revision {
            return Err(external());
        }
        let mut document = RunCaseDocument::parse(&raw).map_err(|_| invalid_edit())?;
        if document.model().case_id.trim().is_empty() {
            return Err(invalid_edit());
        }
        edit.apply(&mut document)?;
        let next = document.to_text().map_err(|_| invalid_edit())?;
        if next != raw
            && !atomic::replace(&path, expected_revision, next.as_bytes()).map_err(|_| {
                RepositoryError::new(
                    RepositoryErrorCode::SaveFailed,
                    "Не удалось сохранить результат; черновик остаётся в редакторе.",
                )
            })?
        {
            return Err(external());
        }
        let saved = RunCaseDocument::parse(&next).map_err(|_| invalid_edit())?;
        let mut warnings = saved.warnings().to_vec();
        let snapshot = if let Ok(snapshot) =
            super::create_run::read_snapshot(&session.root, &resource.relative, &saved)
        {
            snapshot.map(Box::new)
        } else {
            warnings.push(crate::domain::formats::RunWarning { code: crate::domain::formats::RunWarningCode::InvalidFrontmatter, message: "Snapshot исходника отсутствует, изменён или некорректен; результаты прогона остаются доступны.".into(), line: None });
            None
        };
        Ok(RunResourceDocumentDto::Case {
            model: saved.model().clone(),
            warnings,
            revision: atomic::revision(next.as_bytes()),
            snapshot,
        })
    }
}
