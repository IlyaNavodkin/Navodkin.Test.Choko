use super::{
    MAX_CATALOG_READ_BYTES, MAX_REPOSITORY_FILE_BYTES, RepositoryError, RepositoryErrorCode,
    RepositoryService, ResourceKind, atomic, invalid_resource, invalid_session, read_utf8_limited,
    registry_error, resolve_directory, resolve_regular_file, stale_resource,
};
use crate::domain::formats::{CaseDocument, CaseModel, RunCaseDocument, RunDetailsDocument};
use chrono::{NaiveDate, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, io, path::PathBuf};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunCaseSelection {
    pub resource_id: String,
    pub expected_revision: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RunCreation {
    pub workspace_path: String,
    pub name: String,
    pub scope: String,
    pub test_date: String,
    pub cases: Vec<RunCaseSelection>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCreationDto {
    pub run_id: String,
}

fn failure(message: &str) -> RepositoryError {
    RepositoryError::new(RepositoryErrorCode::SaveFailed, message)
}
fn changed() -> RepositoryError {
    RepositoryError::new(
        RepositoryErrorCode::ExternalChange,
        "Один из выбранных кейсов изменён извне.",
    )
}
impl RunCreation {
    pub(crate) fn validate(&self) -> Result<(), RepositoryError> {
        if self.workspace_path.len() > 1024
            || self.name.trim().is_empty()
            || self.name.len() > 4096
            || self.scope.len() > 4096
            || self.cases.is_empty()
            || self.cases.len() > 500
            || self.test_date.len() != 10
            || NaiveDate::parse_from_str(&self.test_date, "%Y-%m-%d").is_err()
            || self.cases.iter().any(|item| {
                item.expected_revision.len() != 64
                    || !item
                        .expected_revision
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            })
        {
            return Err(RepositoryError::new(
                RepositoryErrorCode::InvalidRunCreation,
                "Параметры прогона недопустимы.",
            ));
        }
        Ok(())
    }
}
fn scalar(value: &str) -> Result<String, RepositoryError> {
    serde_json::to_string(value).map_err(|_| failure("Не удалось подготовить metadata."))
}
fn checklist(values: impl IntoIterator<Item = String>) -> String {
    values
        .into_iter()
        .enumerate()
        .map(|(index, text)| format!("- [ ] {}. {text}", index + 1))
        .collect::<Vec<_>>()
        .join("\n")
}
fn sidecar(model: &CaseModel, filename: &str, revision: &str) -> Result<String, RepositoryError> {
    let text = format!(
        "---\ncase_id: {}\ndisplay_id: {}\ntitle: {}\nresult: not_run\ntester: ''\nexecuted_at: ''\nsource_snapshot: {}\nsource_sha256: {}\n---\n\n## Setup\n\n{}\n\n## Steps\n\n{}\n\n## Acceptance Criteria\n\n{}\n\n## Notes\n",
        scalar(model.id.as_deref().ok_or_else(invalid_resource)?)?,
        scalar(&model.display_id)?,
        scalar(&model.title)?,
        scalar(filename)?,
        scalar(revision)?,
        checklist(model.setup.iter().map(|item| item.name.clone())),
        checklist(model.steps.iter().map(|item| item.text.clone())),
        checklist(model.acceptance_criteria.clone())
    );
    let parsed = RunCaseDocument::parse(&text)
        .map_err(|_| failure("Не удалось подготовить совместимый sidecar."))?;
    if parsed
        .model()
        .steps
        .iter()
        .map(|item| &item.text)
        .ne(model.steps.iter().map(|item| &item.text))
        || parsed
            .model()
            .setup
            .iter()
            .map(|item| &item.text)
            .ne(model.setup.iter().map(|item| &item.name))
        || parsed
            .model()
            .accept
            .iter()
            .map(|item| &item.text)
            .ne(model.acceptance_criteria.iter())
    {
        return Err(failure("Checklist невозможно записать без потери текста."));
    }
    Ok(text)
}

impl RepositoryService {
    /// Creates a new compatible snapshot folder from revision-checked registered cases.
    ///
    /// # Errors
    /// Refuses invalid/duplicate identities, stale versions, unsafe paths, budgets and publication failures.
    pub fn create_run(
        &self,
        token: &str,
        request: &RunCreation,
    ) -> Result<RunCreationDto, RepositoryError> {
        request.validate()?;
        let sessions = self.sessions.lock().map_err(|_| registry_error())?;
        let session = sessions.by_id.get(token).ok_or_else(invalid_session)?;
        super::git_sync::ensure_writable(session)?;
        if session.opened.needs_initialization
            || !session
                .opened
                .workspaces
                .iter()
                .any(|workspace| workspace.path == request.workspace_path)
        {
            return Err(invalid_resource());
        }
        let metadata_root = resolve_directory(&session.root, ".casewright")?;
        let now = Utc::now();
        let run_id = format!("{}-{}", now.format("%Y-%m-%d"), Uuid::new_v4());
        let details = format!(
            "---\nname: {}\nstatus: open\ncreated: {}\ntest_date: {}\nscope: {}\n---\n\n## Summary\n\n## Notes\n",
            scalar(request.name.trim())?,
            scalar(&now.to_rfc3339_opts(SecondsFormat::Secs, true))?,
            scalar(&request.test_date)?,
            scalar(&request.scope)?
        );
        RunDetailsDocument::parse(&details)
            .map_err(|_| failure("Не удалось проверить metadata прогона."))?;
        let mut files = vec![atomic::StagedFile {
            name: "_run.md".into(),
            bytes: details.into_bytes(),
            source: None,
        }];
        let sources = collect_cases(session, request, &mut files)?;
        let runs = metadata_root.join("runs");
        atomic::ensure_directory(&runs)
            .map_err(|_| failure("Не удалось открыть каталог прогонов."))?;
        let published = atomic::publish_directory(&runs, &run_id, &files, || {
            for (relative, path, revision) in &sources {
                let resolved = resolve_regular_file(&session.root, relative)
                    .map_err(|_| io::Error::other("source unavailable"))?;
                if resolved != *path {
                    return Ok(false);
                }
                let raw = read_utf8_limited(path, MAX_REPOSITORY_FILE_BYTES)
                    .map_err(|_| io::Error::other("source unavailable"))?;
                if atomic::revision(raw.as_bytes()) != *revision {
                    return Ok(false);
                }
            }
            Ok(true)
        })
        .map_err(|_| {
            failure("Не удалось опубликовать прогон; существующие данные не перезаписаны.")
        })?;
        if !published {
            return Err(changed());
        }
        Ok(RunCreationDto {
            run_id: format!(".casewright/runs/{run_id}"),
        })
    }
}

pub(super) fn read_snapshot(
    root: &super::path::RepoRoot,
    relative: &str,
    document: &RunCaseDocument,
) -> Result<Option<super::CaseDocumentDto>, RepositoryError> {
    let Some((name, revision)) = document
        .snapshot_reference()
        .map_err(|_| invalid_resource())?
    else {
        return Ok(None);
    };
    let stem = std::path::Path::new(relative)
        .file_stem()
        .and_then(|name| name.to_str())
        .ok_or_else(invalid_resource)?;
    if name != format!("{stem}.source")
        || revision.len() != 64
        || !revision
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(invalid_resource());
    }
    let parent = relative
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .ok_or_else(invalid_resource)?;
    let path = resolve_regular_file(root, &format!("{parent}/{name}"))?;
    let raw = read_utf8_limited(&path, MAX_REPOSITORY_FILE_BYTES)?;
    if atomic::revision(raw.as_bytes()) != revision {
        return Err(changed());
    }
    let parsed = CaseDocument::parse(&raw).map_err(|_| invalid_resource())?;
    if parsed.model().id.as_deref() != Some(document.model().case_id.as_str()) {
        return Err(invalid_resource());
    }
    Ok(Some(super::CaseDocumentDto {
        model: parsed.model().clone(),
        warnings: parsed.warnings().to_vec(),
        revision,
    }))
}

fn collect_cases(
    session: &super::RepoSession,
    request: &RunCreation,
    files: &mut Vec<atomic::StagedFile>,
) -> Result<Vec<(String, PathBuf, String)>, RepositoryError> {
    let mut ids = HashSet::new();
    let mut resources = HashSet::new();
    let mut sources = Vec::<(String, PathBuf, String)>::new();
    let mut order = Vec::new();
    let mut bytes = 0_usize;
    for (index, item) in request.cases.iter().enumerate() {
        if !resources.insert(&item.resource_id) {
            return Err(invalid_resource());
        }
        let resource = session
            .resources
            .get(&item.resource_id)
            .ok_or_else(invalid_resource)?;
        if resource.kind != ResourceKind::Case
            || (!request.workspace_path.is_empty()
                && !resource
                    .relative
                    .starts_with(&format!("{}/", request.workspace_path)))
        {
            return Err(invalid_resource());
        }
        let path = resolve_regular_file(&session.root, &resource.relative)?;
        if path != resource.canonical {
            return Err(stale_resource());
        }
        let raw = read_utf8_limited(&path, MAX_REPOSITORY_FILE_BYTES)?;
        if atomic::revision(raw.as_bytes()) != item.expected_revision {
            return Err(changed());
        }
        let case = CaseDocument::parse(&raw)
            .map_err(|_| failure("Не удалось прочитать исходный кейс."))?;
        let id = case.model().id.as_ref().ok_or_else(invalid_resource)?;
        if !ids.insert(id.clone()) {
            return Err(failure("В выбранных кейсах повторяется stable ID."));
        }
        let file_id = if id.len() <= 128
            && id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        {
            id.clone()
        } else {
            Uuid::new_v4().to_string()
        };
        let stem = format!("{:03}-{file_id}", index + 1);
        let source_name = format!("{stem}.source");
        let rendered = sidecar(case.model(), &source_name, &item.expected_revision)?;
        bytes = bytes
            .checked_add(raw.len() + rendered.len())
            .ok_or_else(|| failure("Прогон слишком большой."))?;
        if bytes > MAX_CATALOG_READ_BYTES {
            return Err(failure("Прогон превышает лимит snapshot bytes."));
        }
        files.push(atomic::StagedFile {
            name: format!("{stem}.md"),
            bytes: rendered.into_bytes(),
            source: Some(path.clone()),
        });
        files.push(atomic::StagedFile {
            name: source_name,
            bytes: raw.into_bytes(),
            source: Some(path.clone()),
        });
        sources.push((
            resource.relative.clone(),
            path,
            item.expected_revision.clone(),
        ));
        order.push(stem);
    }
    files.push(atomic::StagedFile {
        name: ".order".into(),
        bytes: format!("{}\n", order.join("\n")).into_bytes(),
        source: None,
    });
    Ok(sources)
}

#[cfg(test)]
mod tests {
    use super::super::{CatalogEntryDto, RunResourceDocumentDto};
    use super::*;
    use std::{fs, path::Path, process::Command};
    const FIRST: &str = "---\r\nid: first-id\r\ndisplayId: T-1\r\ntitle: First\r\ncustom: {owner: QA}\r\n---\r\n## Objective\r\nFrozen objective\r\n## Setup\r\n### Account\r\nFull setup body\r\n## Steps\r\n1. 1. Numbered source text\r\n  1. Nested step\r\n## Acceptance Criteria\r\n- Receipt\r\n## Vendor\r\nPreserve me\r\n";
    const SECOND: &str =
        "---\nid: second-id\ndisplayId: T-2\ntitle: Second\n---\n## Steps\n1. Another step\n";
    fn fixture(root: &Path) -> (RepositoryService, String, RunCreation) {
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
            "version: 1\nworkspaces:\n  - .\n",
        )
        .unwrap();
        fs::write(root.join("first.md"), FIRST).unwrap();
        fs::write(root.join("second.md"), SECOND).unwrap();
        fs::write(root.join(".order"), "second\nfirst\nunknown\n").unwrap();
        fs::write(root.join("foreign.txt"), "foreign index").unwrap();
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
        let catalog = service.catalog_workspace(&session, "").unwrap();
        let cases = catalog
            .entries
            .into_iter()
            .filter_map(|entry| match entry {
                CatalogEntryDto::Case {
                    resource_id,
                    revision,
                    ..
                } => Some(RunCaseSelection {
                    resource_id,
                    expected_revision: revision,
                }),
                CatalogEntryDto::Folder { .. } => None,
            })
            .collect();
        (
            service,
            session,
            RunCreation {
                workspace_path: String::new(),
                name: "Frozen run".into(),
                scope: "QA".into(),
                test_date: "2026-10-14".into(),
                cases,
            },
        )
    }
    #[test]
    fn publishes_compatible_ordered_snapshots_that_survive_source_change_move_and_delete() {
        let temp = tempfile::tempdir().unwrap();
        let (service, session, request) = fixture(temp.path());
        let index = fs::read(temp.path().join(".git/index")).unwrap();
        let order = fs::read(temp.path().join(".order")).unwrap();
        let result = service.create_run(&session, &request).unwrap();
        let directory = temp.path().join(&result.run_id);
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 6);
        let details =
            RunDetailsDocument::parse(&fs::read_to_string(directory.join("_run.md")).unwrap())
                .unwrap();
        assert_eq!(details.model().name, "Frozen run");
        assert_eq!(details.model().test_date, "2026-10-14");
        fs::rename(temp.path().join("first.md"), temp.path().join("moved.md")).unwrap();
        fs::write(
            temp.path().join("moved.md"),
            FIRST.replace("Frozen objective", "Changed objective"),
        )
        .unwrap();
        fs::remove_file(temp.path().join("second.md")).unwrap();
        let catalog = service.catalog_runs(&session).unwrap();
        let run = catalog
            .runs
            .iter()
            .find(|run| run.run_id == result.run_id)
            .unwrap();
        assert_eq!(
            run.cases
                .iter()
                .map(|case| case.case_id.as_str())
                .collect::<Vec<_>>(),
            vec!["second-id", "first-id"]
        );
        let first = service
            .read_run(&session, &run.cases[1].resource_id)
            .unwrap();
        let RunResourceDocumentDto::Case {
            model,
            snapshot: Some(snapshot),
            ..
        } = first
        else {
            panic!("case snapshot");
        };
        assert_eq!(
            model.steps[0].text,
            CaseDocument::parse(FIRST).unwrap().model().steps[0].text
        );
        assert_eq!(model.steps[1].text, "Nested step");
        assert_eq!(snapshot.model.objective, "Frozen objective");
        assert_eq!(snapshot.model.setup[0].body, "Full setup body");
        assert_eq!(snapshot.model.steps[1].depth, 1);
        let raw_snapshot = fs::read_dir(&directory)
            .unwrap()
            .filter_map(Result::ok)
            .find(|entry| {
                entry
                    .path()
                    .extension()
                    .is_some_and(|extension| extension == "source")
                    && fs::read_to_string(entry.path()).unwrap() == FIRST
            })
            .unwrap();
        assert_eq!(fs::read(raw_snapshot.path()).unwrap(), FIRST.as_bytes());
        assert_eq!(fs::read(temp.path().join(".git/index")).unwrap(), index);
        assert_eq!(fs::read(temp.path().join(".order")).unwrap(), order);
        fs::write(raw_snapshot.path(), "corrupt snapshot").unwrap();
        let RunResourceDocumentDto::Case {
            snapshot, warnings, ..
        } = service
            .read_run(&session, &run.cases[1].resource_id)
            .unwrap()
        else {
            panic!("case");
        };
        assert!(snapshot.is_none());
        assert!(
            warnings
                .iter()
                .any(|warning| warning.message.contains("Snapshot"))
        );
    }
    #[test]
    fn stale_revision_duplicate_selection_and_invalid_date_do_not_publish_a_run() {
        let temp = tempfile::tempdir().unwrap();
        let (service, session, mut request) = fixture(temp.path());
        fs::write(
            temp.path().join("second.md"),
            SECOND.replace("Second", "Changed"),
        )
        .unwrap();
        assert_eq!(
            service.create_run(&session, &request).unwrap_err().code,
            RepositoryErrorCode::ExternalChange
        );
        fs::write(temp.path().join("second.md"), SECOND).unwrap();
        request.cases.push(RunCaseSelection {
            resource_id: request.cases[0].resource_id.clone(),
            expected_revision: request.cases[0].expected_revision.clone(),
        });
        assert!(service.create_run(&session, &request).is_err());
        request.cases.pop();
        request.test_date = "2026-02-30".into();
        assert_eq!(
            service.create_run(&session, &request).unwrap_err().code,
            RepositoryErrorCode::InvalidRunCreation
        );
        assert!(!temp.path().join(".casewright/runs").exists());
        assert_eq!(
            fs::read_to_string(temp.path().join("first.md")).unwrap(),
            FIRST
        );
    }
    #[test]
    fn late_rejection_and_destination_collision_leave_no_partial_run_or_staging_files() {
        let temp = tempfile::tempdir().unwrap();
        let files = vec![atomic::StagedFile {
            name: "_run.md".into(),
            bytes: b"data".to_vec(),
            source: None,
        }];
        assert!(!atomic::publish_directory(temp.path(), "new-run", &files, || Ok(false)).unwrap());
        assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 0);
        fs::create_dir(temp.path().join("existing")).unwrap();
        assert!(atomic::publish_directory(temp.path(), "existing", &files, || Ok(true)).is_err());
        assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 1);
        assert_eq!(
            fs::read_dir(temp.path().join("existing")).unwrap().count(),
            0
        );
    }
}
