//! Нативный импорт отчётов Testoritto: пассивный разбор, сопоставление с привязками и явное применение.
//!
//! Форматы `Playwright` `JSON` и `JUnit` разбираются Node-парсером `tools/playwright-automation`; Rust независимо
//! проверяет version 1/2 контракт Testoritto и сопоставляет строки с текущим каталогом репозитория.
use super::{
    Code, Error, Result,
    contracts::{Attempt, Expected, Outcome, Report as ReportV1, TestRecord as TestRecordV1},
    store::{AutomationService, ExecutionSummary, Settings, digest, io},
    v2::{
        InvocationInput, InvocationTest, Manifest, Report, SourceKind, create_invocation_snapshot,
    },
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub const MAX_IMPORT: usize = 16 * 1024 * 1024;
pub const MAX_IMPORTED_TESTS: usize = 10_000;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RowStatus {
    Matched,
    Duplicate,
    Unmatched,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Row {
    pub index: usize,
    pub status: RowStatus,
    pub outcome: Outcome,
    pub case_id: String,
    pub automation_id: String,
    pub project: String,
    pub variant_id: String,
    pub title: String,
    pub file: String,
}
#[derive(Debug, Clone)]
pub struct ImportedTest {
    pub case_id: String,
    pub automation_id: String,
    pub project: String,
    pub variant_id: String,
    pub title: String,
    pub file: String,
    pub expected_status: Expected,
    pub outcome: Outcome,
    pub attempts: Vec<Attempt>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub source_hash: String,
    pub schema_version: u8,
    pub source_run_id: Option<String>,
    pub foreign_run: bool,
    pub duplicate_import: bool,
    pub matched: usize,
    pub rows: Vec<Row>,
    #[serde(skip)]
    pub tests: Vec<ImportedTest>,
}
fn normalized_v1(report: &ReportV1) -> Vec<ImportedTest> {
    report
        .tests
        .iter()
        .map(|test: &TestRecordV1| ImportedTest {
            case_id: test.case_id.clone(),
            automation_id: test.automation_id.clone(),
            project: test.project.clone(),
            variant_id: test.variant_id.clone(),
            title: test.title.clone(),
            file: test.file.clone(),
            expected_status: test.expected_status,
            outcome: test.outcome,
            attempts: test.attempts.clone(),
        })
        .collect()
}
fn normalized_v2(report: &Report) -> Vec<ImportedTest> {
    report
        .tests
        .iter()
        .map(|test: &InvocationTest| ImportedTest {
            case_id: test.case_id.clone(),
            automation_id: test.automation_id.clone(),
            project: test.project.clone(),
            variant_id: test.variant_id.clone(),
            title: test.title.clone(),
            file: test.file.clone(),
            expected_status: test.expected_status,
            outcome: test.outcome,
            attempts: test.attempts.clone(),
        })
        .collect()
}
fn binding_keys(settings: &Settings) -> Vec<(String, String)> {
    settings
        .catalog
        .bindings
        .iter()
        .filter_map(|binding| {
            let autotest = settings
                .catalog
                .autotests
                .iter()
                .find(|test| test.id == binding.autotest_id)?;
            Some((
                binding.case_id.clone(),
                format!(
                    "{}:{}:{}",
                    autotest.selector.automation_id,
                    autotest.selector.project,
                    autotest.selector.variant_id
                ),
            ))
        })
        .collect()
}
impl AutomationService {
    /// Пассивный предпросмотр: код не исполняется, каталог репозитория не изменяется.
    pub fn preview_import(&self, session: &str, run: &str, source: &str) -> Result<Preview> {
        let root = self.root(session)?;
        if source.is_empty() || source.len() > MAX_IMPORT {
            return Err(Error::new(Code::InvalidReport));
        }
        let value: serde_json::Value =
            serde_json::from_str(source).map_err(|_| Error::new(Code::InvalidReport))?;
        let schema_version = value
            .get("schemaVersion")
            .and_then(serde_json::Value::as_u64)
            .ok_or_else(|| Error::new(Code::InvalidReport))?;
        let (tests, source_run_id) = match schema_version {
            1 => {
                let report: ReportV1 =
                    serde_json::from_value(value).map_err(|_| Error::new(Code::InvalidReport))?;
                report.validate()?;
                (normalized_v1(&report), Some(report.run_id.clone()))
            }
            2 => {
                let report: Report =
                    serde_json::from_value(value).map_err(|_| Error::new(Code::InvalidReport))?;
                report.validate_shape()?;
                (normalized_v2(&report), None)
            }
            _ => return Err(Error::new(Code::InvalidReport)),
        };
        if tests.len() > MAX_IMPORTED_TESTS {
            return Err(Error::new(Code::InvalidReport));
        }
        let source_hash = digest(source.as_bytes());
        let (settings, _) = self.settings(&root)?;
        let keys = binding_keys(&settings);
        let mut counts: std::collections::HashMap<(String, String), usize> =
            std::collections::HashMap::new();
        for key in &keys {
            *counts.entry(key.clone()).or_default() += 1;
        }
        let mut row_counts: std::collections::HashMap<(String, String), usize> =
            std::collections::HashMap::new();
        for test in &tests {
            *row_counts
                .entry((
                    test.case_id.clone(),
                    format!(
                        "{}:{}:{}",
                        test.automation_id, test.project, test.variant_id
                    ),
                ))
                .or_default() += 1;
        }
        let rows = tests
            .iter()
            .enumerate()
            .map(|(index, test)| {
                let key = (
                    test.case_id.clone(),
                    format!(
                        "{}:{}:{}",
                        test.automation_id, test.project, test.variant_id
                    ),
                );
                let bindings = counts.get(&key).copied().unwrap_or_default();
                let status = if bindings == 1 && row_counts.get(&key) == Some(&1) {
                    RowStatus::Matched
                } else if bindings > 0 {
                    RowStatus::Duplicate
                } else {
                    RowStatus::Unmatched
                };
                Row {
                    index,
                    status,
                    outcome: test.outcome,
                    case_id: test.case_id.clone(),
                    automation_id: test.automation_id.clone(),
                    project: test.project.clone(),
                    variant_id: test.variant_id.clone(),
                    title: test.title.clone(),
                    file: test.file.clone(),
                }
            })
            .collect::<Vec<_>>();
        let matched = rows
            .iter()
            .filter(|row| row.status == RowStatus::Matched)
            .count();
        Ok(Preview {
            source_hash: source_hash.clone(),
            schema_version: u8::try_from(schema_version).unwrap_or(u8::MAX),
            foreign_run: source_run_id.as_deref().is_some_and(|value| value != run),
            duplicate_import: settings.imports.contains(&source_hash),
            matched,
            rows,
            tests,
            source_run_id,
        })
    }
    /// Применяет совпавшие строки как новый execution: ручные результаты прогона не изменяются.
    #[allow(clippy::too_many_lines)] // Одна транзакция: сопоставление, снимки и публикация.
    pub fn apply_import(
        self: &std::sync::Arc<Self>,
        session: &str,
        run: &str,
        source: &str,
        expected_revision: &str,
    ) -> Result<ExecutionSummary> {
        let preview = self.preview_import(session, run, source)?;
        if preview.duplicate_import || preview.matched == 0 {
            return Err(Error::new(Code::InvalidRequest));
        }
        let root = self.root(session)?;
        let (settings, revision) = self.settings(&root)?;
        if revision != expected_revision {
            return Err(Error::new(Code::StaleResource));
        }
        let cases = self.run_cases(session, run)?;
        let created = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let execution_id = uuid::Uuid::new_v4().to_string();
        let mut invocations = Vec::new();
        let mut tests = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();
        for row in &preview.rows {
            if row.status != RowStatus::Matched {
                continue;
            }
            let Some(test) = preview.tests.get(row.index) else {
                continue;
            };
            let Some(case) = cases.iter().find(|case| case.case_id == test.case_id) else {
                continue;
            };
            let Some(binding) = settings.catalog.bindings.iter().find(|binding| {
                binding.case_id == test.case_id
                    && settings.catalog.autotests.iter().any(|autotest| {
                        autotest.id == binding.autotest_id
                            && autotest.selector.automation_id == test.automation_id
                            && autotest.selector.project == test.project
                            && autotest.selector.variant_id == test.variant_id
                    })
            }) else {
                continue;
            };
            let Some(autotest) = settings
                .catalog
                .autotests
                .iter()
                .find(|autotest| autotest.id == binding.autotest_id)
            else {
                continue;
            };
            let input = InvocationInput {
                invocation_id: uuid::Uuid::new_v4().to_string(),
                created_at: created.clone(),
                case_revision: digest(case.path.as_bytes()),
                autotest: autotest.clone(),
                binding: binding.clone(),
                run_overrides: std::collections::BTreeMap::new(),
                environments: settings.environments.clone(),
            };
            let snapshot =
                create_invocation_snapshot(&input).map_err(|_| Error::new(Code::InvalidRequest))?;
            if !seen.insert(snapshot.invocation_id.clone()) {
                return Err(Error::new(Code::InvalidRequest));
            }
            tests.push(InvocationTest {
                invocation_id: snapshot.invocation_id.clone(),
                case_id: test.case_id.clone(),
                automation_id: test.automation_id.clone(),
                project: test.project.clone(),
                variant_id: test.variant_id.clone(),
                title: test.title.clone(),
                file: test.file.clone(),
                expected_status: test.expected_status,
                outcome: test.outcome,
                attempts: test.attempts.clone(),
            });
            invocations.push(snapshot);
        }
        if tests.is_empty() {
            return Err(Error::new(Code::InvalidRequest));
        }
        let (profile_id, profile) = settings
            .profiles
            .first()
            .map(|profile| (profile.profile_id.clone(), profile.clone()))
            .ok_or_else(|| Error::new(Code::InvalidRequest))?;
        let source_info = self
            .repositories
            .automation_source(session)
            .map_err(|_| Error::new(Code::Io))?;
        let manifest = Manifest {
            schema_version: 2,
            run_id: run.to_owned(),
            execution_id: execution_id.clone(),
            parent_execution_id: None,
            profile_id: profile_id.clone(),
            profile_revision: digest(&serde_json::to_vec(&profile).map_err(io)?),
            catalog_revision: None,
            created_at: created.clone(),
            source: source_info.clone(),
            invocations,
            operation: super::contracts::Operation::Run,
            profile,
            output_root: String::new(),
            source_kind: SourceKind::Import,
        };
        manifest.validate()?;
        let complete = tests
            .iter()
            .all(|test| !test.attempts.is_empty() && test.outcome != Outcome::Interrupted);
        let report = Report {
            schema_version: 2,
            run_id: run.to_owned(),
            execution_id: execution_id.clone(),
            parent_execution_id: None,
            profile_id,
            profile_revision: manifest.profile_revision.clone(),
            catalog_revision: None,
            created_at: created.clone(),
            source: source_info,
            state: if complete {
                super::contracts::State::Completed
            } else {
                super::contracts::State::RunnerError
            },
            reason: (!complete).then(|| "Импортированный отчёт неполный.".to_owned()),
            started_at: created.clone(),
            finished_at: created.clone(),
            complete: true,
            tests,
            runner_errors: vec![],
            logs: super::contracts::Logs {
                stdout: String::new(),
                stderr: String::new(),
                truncated: false,
            },
            attachments: vec![],
        };
        report.validate(&manifest)?;
        let summary = ExecutionSummary {
            execution_id: execution_id.clone(),
            run_id: run.to_owned(),
            profile_id: manifest.profile_id.clone(),
            operation: super::contracts::Operation::Run,
            state: report.state,
            reason: report.reason.clone(),
            created_at: created,
        };
        let persistent = self.execution_dir(&root, run, &execution_id, true)?;
        super::store::atomic(&persistent, "manifest.json", &manifest)?;
        super::store::atomic(&persistent, "report.json", &report)?;
        super::store::atomic(&persistent, "status.json", &summary)?;
        self.mutate(session, expected_revision, |settings| {
            if !settings.imports.contains(&preview.source_hash) {
                settings.imports.push(preview.source_hash.clone());
            }
            Ok(())
        })?;
        Ok(summary)
    }
}
