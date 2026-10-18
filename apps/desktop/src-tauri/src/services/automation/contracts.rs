#![allow(clippy::struct_field_names)] // Имена совпадают с versioned JSON ABI.
// Независимая проверка version 1, без исполнения импортированного кода.
use super::{Code, Error, Result};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
pub const MAX_REPORT: usize = 16 * 1024 * 1024;
pub const MAX_LOG: usize = 1024 * 1024;
pub fn units(s: &str) -> usize {
    s.encode_utf16().count()
}
pub fn check(ok: bool) -> Result<()> {
    if ok {
        Ok(())
    } else {
        Err(Error::new(Code::InvalidReport))
    }
}
pub fn id(v: &str) -> bool {
    !v.is_empty() && units(v) <= 256 && !v.chars().any(char::is_control)
}
pub fn hash(v: &str) -> bool {
    v.len() == 64
        && v.bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}
pub fn uuid(v: &str) -> bool {
    uuid::Uuid::parse_str(v).is_ok_and(|u| u.to_string() == v)
}
pub fn relative(v: &str) -> bool {
    !v.is_empty()
        && units(v) <= 1024
        && !v.contains(['\\', ':'])
        && !v.chars().any(char::is_control)
        && v.split('/')
            .all(|p| !p.is_empty() && p != "." && p != ".." && !p.eq_ignore_ascii_case(".git"))
}
fn date(v: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(v).is_ok()
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Key {
    pub case_id: String,
    pub automation_id: String,
    pub project: String,
    pub variant_id: String,
}
impl Key {
    pub fn valid(&self) -> bool {
        [
            &self.case_id,
            &self.automation_id,
            &self.project,
            &self.variant_id,
        ]
        .into_iter()
        .all(|s| id(s))
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Profile {
    pub schema_version: u8,
    pub profile_id: String,
    pub label: String,
    pub cwd: String,
    pub config: String,
    pub projects: Vec<String>,
    pub timeout_ms: u64,
    pub retries: u8,
    pub workers: u8,
}
impl Profile {
    pub fn validate(&self) -> Result<()> {
        check(
            self.schema_version == 1
                && id(&self.profile_id)
                && !self.label.is_empty()
                && units(&self.label) <= 200
                && (self.cwd == "." || relative(&self.cwd))
                && relative(&self.config)
                && !self.projects.is_empty()
                && self.projects.len() <= 100
                && self.projects.iter().all(|s| id(s))
                && self.projects.iter().collect::<HashSet<_>>().len() == self.projects.len()
                && (1..=1_800_000).contains(&self.timeout_ms)
                && self.retries <= 10
                && (1..=32).contains(&self.workers),
        )
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Source {
    pub commit: Option<String>,
    pub branch: Option<String>,
    pub dirty: bool,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Operation {
    Discover,
    Run,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum State {
    Running,
    Completed,
    RunnerError,
    Interrupted,
    TimedOut,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Status {
    #[serde(rename = "passed")]
    Passed,
    #[serde(rename = "failed")]
    Failed,
    #[serde(rename = "timedOut")]
    TimedOut,
    #[serde(rename = "skipped")]
    Skipped,
    #[serde(rename = "interrupted")]
    Interrupted,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Expected {
    Passed,
    Failed,
    Skipped,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Outcome {
    Expected,
    Unexpected,
    Flaky,
    Skipped,
    Interrupted,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ErrorRecord {
    pub message: String,
    pub stack: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Logs {
    pub stdout: String,
    pub stderr: String,
    pub truncated: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Attachment {
    pub id: String,
    pub name: String,
    pub content_type: String,
    pub path: Option<String>,
    pub size: u64,
    pub unavailable_reason: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Attempt {
    pub retry: u8,
    pub repeat_each_index: u8,
    pub status: Status,
    pub started_at: Option<String>,
    pub duration_ms: f64,
    pub errors: Vec<ErrorRecord>,
    pub stdout: String,
    pub stderr: String,
    pub attachments: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TestRecord {
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
impl TestRecord {
    pub fn key(&self) -> Key {
        Key {
            case_id: self.case_id.clone(),
            automation_id: self.automation_id.clone(),
            project: self.project.clone(),
            variant_id: self.variant_id.clone(),
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CatalogTest {
    pub case_id: String,
    pub automation_id: String,
    pub project: String,
    pub variant_id: String,
    pub title: String,
    pub file: String,
    pub expected_status: Expected,
}
impl CatalogTest {
    pub fn key(&self) -> Key {
        Key {
            case_id: self.case_id.clone(),
            automation_id: self.automation_id.clone(),
            project: self.project.clone(),
            variant_id: self.variant_id.clone(),
        }
    }
}
fn errors(v: &[ErrorRecord]) -> bool {
    v.len() <= 100
        && v.iter().all(|e| {
            units(&e.message) <= 16_384 && e.stack.as_ref().is_none_or(|s| units(s) <= 32_768)
        })
}
pub fn outcome(expected: Expected, attempts: &[Attempt]) -> Outcome {
    if attempts.is_empty() || attempts.iter().any(|a| a.status == Status::Interrupted) {
        return Outcome::Interrupted;
    }
    if attempts.iter().all(|a| a.status == Status::Skipped) {
        return Outcome::Skipped;
    }
    let expected = match expected {
        Expected::Passed => Status::Passed,
        Expected::Failed => Status::Failed,
        Expected::Skipped => Status::Skipped,
    };
    let mut groups: HashMap<u8, Vec<&Attempt>> = HashMap::new();
    for a in attempts {
        groups.entry(a.repeat_each_index).or_default().push(a);
    }
    let mut flaky = false;
    for group in groups.values_mut() {
        group.sort_by_key(|a| a.retry);
        if group.last().is_none_or(|a| a.status != expected) {
            return Outcome::Unexpected;
        }
        flaky |= group
            .iter()
            .any(|a| a.status != expected && a.status != Status::Skipped);
    }
    if flaky {
        Outcome::Flaky
    } else {
        Outcome::Expected
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Report {
    pub schema_version: u8,
    pub run_id: String,
    pub execution_id: String,
    pub parent_execution_id: Option<String>,
    pub profile_id: String,
    pub profile_revision: String,
    pub catalog_revision: Option<String>,
    pub created_at: String,
    pub source: Source,
    pub selection: Vec<Key>,
    pub state: State,
    pub reason: Option<String>,
    pub started_at: String,
    pub finished_at: String,
    pub complete: bool,
    pub tests: Vec<TestRecord>,
    pub runner_errors: Vec<ErrorRecord>,
    pub logs: Logs,
    pub attachments: Vec<Attachment>,
}
impl Report {
    /// Проверка формы и лимитов version 1 для нативного импорта; корреляцию сверяет вызывающий код.
    pub fn validate(&self) -> Result<()> {
        check(
            self.schema_version == 1
                && relative(&self.run_id)
                && uuid(&self.execution_id)
                && self
                    .parent_execution_id
                    .as_ref()
                    .is_none_or(|s| uuid(s) && s != &self.execution_id)
                && id(&self.profile_id)
                && hash(&self.profile_revision)
                && self.catalog_revision.as_ref().is_none_or(|s| hash(s))
                && date(&self.created_at)
                && date(&self.started_at)
                && date(&self.finished_at)
                && self.complete
                && self.state != State::Running
                && self.reason.as_ref().is_none_or(|s| units(s) <= 4096)
                && self.source.commit.as_ref().is_none_or(|s| {
                    (40..=64).contains(&s.len())
                        && s.bytes()
                            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
                })
                && self.source.branch.as_ref().is_none_or(|s| units(s) <= 1024)
                && self.selection.len() <= 10_000
                && self.tests.len() <= 10_000
                && self.attachments.len() <= 100
                && errors(&self.runner_errors),
        )?;
        let selected: HashSet<_> = self.selection.iter().collect();
        check(selected.len() == self.selection.len() && self.selection.iter().all(Key::valid))?;
        let ids: HashSet<_> = self.attachments.iter().map(|a| &a.id).collect();
        check(
            ids.len() == self.attachments.len()
                && self.attachments.iter().all(|a| {
                    uuid(&a.id)
                        && units(&a.name) <= 256
                        && a.content_type.len() <= 100
                        && a.size <= 25 * 1024 * 1024
                        && a.path.as_ref().is_none_or(|p| relative(p))
                        && a.unavailable_reason
                            .as_ref()
                            .is_none_or(|s| units(s) <= 256)
                        && (a.path.is_some() || a.unavailable_reason.is_some())
                })
                && self.attachments.iter().map(|a| a.size).sum::<u64>() <= 100 * 1024 * 1024,
        )?;
        let mut keys = HashSet::new();
        let mut logs = self.logs.stdout.len() + self.logs.stderr.len();
        for t in &self.tests {
            check(
                t.key().valid()
                    && keys.insert(t.key())
                    && selected.contains(&t.key())
                    && units(&t.title) <= 4096
                    && units(&t.file) <= 1024
                    && t.attempts.len() <= 100
                    && t.outcome == outcome(t.expected_status, &t.attempts),
            )?;
            let mut attempts = HashSet::new();
            for a in &t.attempts {
                check(
                    a.retry <= 99
                        && a.repeat_each_index <= 99
                        && attempts.insert((a.repeat_each_index, a.retry))
                        && a.started_at.as_ref().is_none_or(|s| date(s))
                        && a.duration_ms.is_finite()
                        && a.duration_ms >= 0.0
                        && errors(&a.errors)
                        && a.attachments.len() <= 100
                        && a.attachments.iter().all(|i| ids.contains(i)),
                )?;
                logs += a.stdout.len() + a.stderr.len();
            }
        }
        check(
            logs <= MAX_LOG
                && (self.state != State::Completed
                    || (self.runner_errors.is_empty()
                        && self.tests.len() == self.selection.len()
                        && self
                            .tests
                            .iter()
                            .all(|t| !t.attempts.is_empty() && t.outcome != Outcome::Interrupted))),
        )?;
        Ok(())
    }
}
