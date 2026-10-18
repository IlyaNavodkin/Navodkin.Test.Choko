use super::{
    Code, Error, Result,
    contracts::{MAX_LOG, MAX_REPORT, Operation, Outcome, State, Status, hash, id, relative, uuid},
    store::{
        Active, AutomationService, ExecutionSummary, Poll, atomic, bounded, decode_required,
        directory, existing, io,
    },
    v2::{
        ArgumentValue, Discovery, InvocationInput, InvocationSnapshot, Manifest, Report,
        create_invocation_snapshot,
    },
};
use serde::{Deserialize, Serialize};
use std::{
    collections::{BTreeMap, HashSet},
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};
/// Один запрошенный invocation: привязка и значения, переопределённые перед запуском.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InvocationRequest {
    pub binding_id: String,
    #[serde(default)]
    pub run_overrides: BTreeMap<String, ArgumentValue>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Start {
    pub profile_id: String,
    pub profile_revision: String,
    pub run_id: String,
    pub operation: Operation,
    pub catalog_execution_id: Option<String>,
    pub catalog_revision: Option<String>,
    pub invocations: Vec<InvocationRequest>,
    pub parent_execution_id: Option<String>,
    /// Снимки, показанные пользователю перед запуском: расхождение источников блокирует старт.
    #[serde(default)]
    pub preview: Vec<InvocationSnapshot>,
}
/// Предпросмотр invocation до запуска: снимки значений и типизированные диагностики.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    pub snapshots: Vec<InvocationSnapshot>,
    pub issues: Vec<PreviewIssue>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewIssue {
    pub binding_id: String,
    pub code: super::v2::IssueCode,
    pub key: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedReport {
    pub name: String,
    pub relative_path: String,
    pub size: u64,
    pub sha256: String,
}
impl AutomationService {
    /// Собирает снимки invocation по приоритету аргументов, без запуска кода.
    pub fn preview(
        &self,
        session: &str,
        run: &str,
        requests: &[InvocationRequest],
    ) -> Result<Preview> {
        let root = self.root(session)?;
        if !relative(run) || requests.len() > super::v2::MAX_AUTOTESTS {
            return Err(Error::new(Code::InvalidRequest));
        }
        let cases = self.run_cases(session, run)?;
        let (settings, _) = self.settings(&root)?;
        let created = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let mut snapshots = Vec::new();
        let mut issues = Vec::new();
        for request in requests {
            if !uuid(&request.binding_id) {
                return Err(Error::new(Code::InvalidRequest));
            }
            let input = Self::invocation_input(&settings, &cases, request, &created)?;
            match create_invocation_snapshot(&input) {
                Ok(snapshot) => snapshots.push(snapshot),
                Err(list) => {
                    for issue in list {
                        issues.push(PreviewIssue {
                            binding_id: request.binding_id.clone(),
                            code: issue.code,
                            key: issue.key,
                        });
                    }
                }
            }
        }
        Ok(Preview { snapshots, issues })
    }
    pub(super) fn run_cases(&self, session: &str, run: &str) -> Result<Vec<super::store::RunCase>> {
        let runs = self
            .repositories
            .catalog_runs(session)
            .map_err(|_| Error::new(Code::InvalidRequest))?;
        let entry = runs
            .runs
            .iter()
            .find(|item| item.run_id == run)
            .ok_or_else(|| Error::new(Code::InvalidRequest))?;
        Ok(entry
            .cases
            .iter()
            .map(|case| super::store::RunCase {
                case_id: case.case_id.clone(),
                path: case.path.clone(),
            })
            .collect())
    }
    fn invocation_input(
        settings: &super::store::Settings,
        cases: &[super::store::RunCase],
        request: &InvocationRequest,
        created: &str,
    ) -> Result<InvocationInput> {
        let binding = settings
            .catalog
            .bindings
            .iter()
            .find(|item| item.id == request.binding_id)
            .ok_or_else(|| Error::new(Code::InvalidRequest))?;
        let autotest = settings
            .catalog
            .autotests
            .iter()
            .find(|item| item.id == binding.autotest_id)
            .ok_or_else(|| Error::new(Code::InvalidRequest))?;
        let case = cases
            .iter()
            .find(|item| item.case_id == binding.case_id)
            .ok_or_else(|| Error::new(Code::InvalidRequest))?;
        Ok(InvocationInput {
            invocation_id: uuid::Uuid::new_v4().to_string(),
            created_at: created.to_owned(),
            case_revision: super::store::digest(case.path.as_bytes()),
            autotest: autotest.clone(),
            binding: binding.clone(),
            run_overrides: request.run_overrides.clone(),
            environments: settings.environments.clone(),
        })
    }
    #[allow(clippy::too_many_lines)] // Одна admission-транзакция: trust, invocation и publication.
    pub fn start(self: &Arc<Self>, session: &str, start: Start) -> Result<ExecutionSummary> {
        let root = self.root(session)?;
        if self.closing.lock().map_err(io)?.contains(session) {
            return Err(Error::new(Code::InvalidSession));
        }
        // BUSY не должен ждать чтения большого runtime binary/config.
        if self.active.lock().map_err(io)?.values().any(|a| {
            a.session == session
                && a.worker
                    .as_ref()
                    .is_some_and(|worker| !worker.is_finished())
        }) {
            return Err(Error::new(Code::Busy));
        }
        let unique: HashSet<&String> = start
            .invocations
            .iter()
            .map(|request| &request.binding_id)
            .collect();
        if !relative(&start.run_id)
            || !id(&start.profile_id)
            || !hash(&start.profile_revision)
            || start.invocations.len() > super::v2::MAX_AUTOTESTS
            || unique.len() != start.invocations.len()
            || start
                .parent_execution_id
                .as_ref()
                .is_some_and(|parent| !uuid(parent))
        {
            return Err(Error::new(Code::InvalidRequest));
        }
        let (profile, node) = self.trusted(&root, &start.profile_id, &start.profile_revision)?;
        let cases = self.run_cases(session, &start.run_id)?;
        let (settings, _) = self.settings(&root)?;
        let created = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let mut snapshots = Vec::new();
        for request in &start.invocations {
            let input = Self::invocation_input(&settings, &cases, request, &created)?;
            if !profile.projects.contains(&input.autotest.selector.project) {
                return Err(Error::new(Code::InvalidRequest));
            }
            if let Some(preview) = start
                .preview
                .iter()
                .find(|snapshot| snapshot.binding.id == request.binding_id)
            {
                super::v2::validate_invocation_preview(preview, &input)
                    .map_err(|_| Error::new(Code::StaleProfile))?;
            }
            let snapshot =
                create_invocation_snapshot(&input).map_err(|_| Error::new(Code::InvalidRequest))?;
            snapshots.push(snapshot);
        }
        let mut catalog_revision = None;
        if start.operation == Operation::Run {
            if snapshots.is_empty() {
                return Err(Error::new(Code::InvalidRequest));
            }
            let previous = start
                .catalog_execution_id
                .as_deref()
                .ok_or_else(|| Error::new(Code::StaleProfile))?;
            let dir = self.execution_dir(&root, &start.run_id, previous, false)?;
            let discovery: Discovery =
                decode_required(&bounded(&dir.join("catalog.json"), MAX_REPORT)?)
                    .map_err(|_| Error::new(Code::StaleProfile))?;
            let m: Manifest =
                decode_required(&bounded(&dir.join("manifest.json"), MAX_REPORT)?).map_err(io)?;
            discovery.validate(&m)?;
            if m.profile_id != profile.profile_id
                || m.profile_revision != start.profile_revision
                || Some(&discovery.catalog_revision) != start.catalog_revision.as_ref()
                || snapshots.iter().any(|snapshot| {
                    let selector = &snapshot.autotest.selector;
                    !discovery.tests.iter().any(|test| {
                        test.automation_id == selector.automation_id
                            && test.project == selector.project
                            && test.variant_id == selector.variant_id
                    })
                })
            {
                return Err(Error::new(Code::StaleProfile));
            }
            catalog_revision = Some(discovery.catalog_revision);
        } else if !start.invocations.is_empty()
            || start.catalog_revision.is_some()
            || start.catalog_execution_id.is_some()
            || start.parent_execution_id.is_some()
        {
            return Err(Error::new(Code::InvalidRequest));
        }
        if let Some(parent) = &start.parent_execution_id {
            let dir = self.execution_dir(&root, &start.run_id, parent, false)?;
            let m: Manifest =
                decode_required(&bounded(&dir.join("manifest.json"), MAX_REPORT)?).map_err(io)?;
            let report: Report =
                decode_required(&bounded(&dir.join("report.json"), MAX_REPORT)?).map_err(io)?;
            report.validate(&m)?;
            if report.profile_id != profile.profile_id
                || snapshots.iter().any(|snapshot| {
                    let selector = &snapshot.autotest.selector;
                    !report.tests.iter().any(|test| {
                        test.automation_id == selector.automation_id
                            && test.project == selector.project
                            && test.variant_id == selector.variant_id
                            && test.outcome == Outcome::Unexpected
                            && test
                                .attempts
                                .iter()
                                .any(|a| matches!(a.status, Status::Failed | Status::TimedOut))
                    })
                })
            {
                return Err(Error::new(Code::InvalidRequest));
            }
        }
        let mut active = self.active.lock().map_err(io)?;
        if self.closing.lock().map_err(io)?.contains(session) {
            return Err(Error::new(Code::InvalidSession));
        }
        if active
            .values()
            .any(|a| a.session == session && a.worker.as_ref().is_some_and(|w| !w.is_finished()))
        {
            return Err(Error::new(Code::Busy));
        }
        let execution_id = uuid::Uuid::new_v4().to_string();
        let summary = ExecutionSummary {
            execution_id: execution_id.clone(),
            run_id: start.run_id.clone(),
            profile_id: profile.profile_id.clone(),
            operation: start.operation,
            state: State::Running,
            reason: None,
            created_at: created.clone(),
        };
        let output = self.output_dir(&execution_id)?;
        let source = self
            .repositories
            .automation_source(session)
            .map_err(|_| Error::new(Code::Io))?;
        let manifest = Manifest {
            schema_version: 2,
            run_id: start.run_id,
            execution_id: execution_id.clone(),
            parent_execution_id: start.parent_execution_id,
            profile_id: profile.profile_id.clone(),
            profile_revision: start.profile_revision,
            catalog_revision,
            created_at: created,
            source,
            invocations: snapshots,
            operation: start.operation,
            profile,
            output_root: output.to_string_lossy().into_owned(),
            source_kind: super::v2::SourceKind::Run,
        };
        manifest.validate()?;
        atomic(&output, "manifest.json", &manifest)?;
        let persistent = self.execution_dir(&root, &manifest.run_id, &execution_id, true)?;
        atomic(&persistent, "manifest.json", &manifest)?;
        atomic(&persistent, "status.json", &summary)?;
        let cancel = Arc::new(AtomicBool::new(false));
        let worker_cancel = Arc::clone(&cancel);
        let service = Arc::clone(self);
        let worker_session = session.to_owned();
        let status = summary.clone();
        let worker = thread::Builder::new()
            .name("automation-worker".into())
            .spawn(move || {
                service.execute(
                    &worker_session,
                    &root,
                    &node,
                    &manifest,
                    &worker_cancel,
                    status,
                )
            })
            .map_err(io)?;
        active.insert(
            execution_id,
            Active {
                session: session.into(),
                cancel,
                summary: summary.clone(),
                worker: Some(worker),
            },
        );
        Ok(summary)
    }
    fn output_dir(&self, execution: &str) -> Result<PathBuf> {
        fs::create_dir_all(&self.app_data).map_err(io)?;
        let root = fs::canonicalize(&self.app_data).map_err(io)?;
        directory(&root, &format!("automation-output/{execution}"))
    }
    fn execute(
        &self,
        session: &str,
        root: &Path,
        node: &Path,
        manifest: &Manifest,
        cancel: &AtomicBool,
        mut summary: ExecutionSummary,
    ) -> Result<()> {
        let output = Path::new(&manifest.output_root);
        let timeout = Duration::from_millis(if manifest.operation == Operation::Discover {
            manifest.profile.timeout_ms.min(60_000)
        } else {
            manifest.profile.timeout_ms
        });
        let result = execute_process(
            node,
            &self.bridge,
            root,
            &output.join("manifest.json"),
            manifest.operation,
            timeout,
            cancel,
        );
        let mut report = None;
        let mut catalog = None;
        summary.state = match result {
            Ok(success) => {
                let parsed: Result<State> = (|| {
                    if manifest.operation == Operation::Discover {
                        if !success {
                            return Err(Error::new(Code::InvalidReport));
                        }
                        let value: Discovery =
                            decode_required(&bounded(&output.join("catalog.json"), MAX_REPORT)?)
                                .map_err(io)?;
                        value.validate(manifest)?;
                        catalog = Some(value);
                        Ok(State::Completed)
                    } else {
                        let mut value: Report =
                            decode_required(&bounded(&output.join("report.json"), MAX_REPORT)?)
                                .map_err(io)?;
                        value.validate(manifest)?;
                        if value.state == State::Completed && !success {
                            return Err(Error::new(Code::InvalidReport));
                        }
                        // Artifact paths remain app-data owned and never become frontend file authority.
                        Self::retain_attachments(output, &mut value);
                        let state = value.state;
                        report = Some(value);
                        Ok(state)
                    }
                })();
                parsed.unwrap_or(State::RunnerError)
            }
            Err(e) if e.code == Code::Cancelled => State::Interrupted,
            Err(e) if e.code == Code::Busy => State::TimedOut,
            Err(_) => State::RunnerError,
        };
        if summary.state != State::Completed {
            summary.reason = Some(
                match summary.state {
                    State::Interrupted => "Выполнение остановлено.",
                    State::TimedOut => "Истёк лимит времени.",
                    _ => "Runner не предоставил подтверждённый полный результат.",
                }
                .into(),
            );
        }
        let ticket = self.queues.admit(session, false).map_err(Error::from)?;
        tauri::async_runtime::block_on(async {
            let lease = ticket.await.map_err(Error::from)?;
            let result = (|| {
                self.root(session)?;
                let persistent =
                    self.execution_dir(root, &manifest.run_id, &manifest.execution_id, false)?;
                if let Some(report) = &report {
                    atomic(&persistent, "report.json", report)?;
                }
                if let Some(catalog) = &catalog {
                    atomic(&persistent, "catalog.json", catalog)?;
                }
                // JUnit-экспорт bridge хранится рядом с отчётом, чтобы попасть в папку прогона.
                let junit = output.join("junit.xml");
                if junit.exists() && !persistent.join("junit.xml").exists() {
                    crate::services::repository::atomic::create(
                        &persistent.join("junit.xml"),
                        &bounded(&junit, MAX_REPORT)?,
                        None,
                    )
                    .map_err(io)?;
                }
                atomic(&persistent, "status.json", &summary)
            })();
            lease.complete(result.is_ok());
            result
        })?;
        if let Some(active) = self
            .active
            .lock()
            .map_err(io)?
            .get_mut(&manifest.execution_id)
        {
            active.summary = summary;
        }
        Ok(())
    }
    fn retain_attachments(output: &Path, report: &mut Report) {
        // Runner-generated blobs already live outside Git. Invalid references become unavailable.
        for a in &mut report.attachments {
            if let Some(path) = &a.path {
                let valid = existing(output, path).and_then(|p| {
                    let m = fs::metadata(&p).map_err(io)?;
                    if m.is_file() && m.len() == a.size {
                        Ok(())
                    } else {
                        Err(Error::new(Code::InvalidReport))
                    }
                });
                if valid.is_err() {
                    a.path = None;
                    a.unavailable_reason = Some("Вложение недоступно или путь отклонён.".into());
                }
            }
        }
    }
    /// Копирует отчёты в папку прогона: без перезаписи, без Git staging и без правки ручных файлов.
    pub fn save_reports(
        &self,
        session: &str,
        run: &str,
        execution: &str,
    ) -> Result<Vec<SavedReport>> {
        let root = self.root(session)?;
        let cases = self.run_cases(session, run)?;
        let _ = cases;
        let source = self.execution_dir(&root, run, execution, false)?;
        let folder = directory(&root, &format!("{run}/automation/{execution}"))?;
        let mut saved = Vec::new();
        for name in ["report.json", "junit.xml"] {
            let from = source.join(name);
            if !from.exists() {
                continue;
            }
            let bytes = bounded(&from, MAX_REPORT)?;
            let digest = super::store::digest(&bytes);
            let destination = folder.join(name);
            if destination.exists() {
                if super::store::digest(&bounded(&destination, MAX_REPORT)?) != digest {
                    return Err(Error::new(Code::StaleResource));
                }
            } else {
                crate::services::repository::atomic::create(&destination, &bytes, None)
                    .map_err(io)?;
            }
            saved.push(SavedReport {
                name: name.to_owned(),
                relative_path: format!("{run}/automation/{execution}/{name}"),
                size: u64::try_from(bytes.len()).unwrap_or(u64::MAX),
                sha256: digest,
            });
        }
        Ok(saved)
    }
    #[allow(clippy::too_many_lines)] // Полная валидация и bounded paging читаются как один контракт.
    pub fn poll(&self, session: &str, run: &str, execution: &str, cursor: usize) -> Result<Poll> {
        let root = self.root(session)?;
        let persistent = self.execution_dir(&root, run, execution, false)?;
        let m: Manifest = decode_required(&bounded(&persistent.join("manifest.json"), MAX_REPORT)?)
            .map_err(io)?;
        m.validate()?;
        if m.execution_id != execution || m.run_id != run {
            return Err(Error::new(Code::InvalidReport));
        }
        let mut summary: ExecutionSummary =
            decode_required(&bounded(&persistent.join("status.json"), 8192)?).map_err(io)?;
        let active = self.active.lock().map_err(io)?;
        if let Some(a) = active.get(execution)
            && a.session != session
        {
            return Err(Error::new(Code::InvalidSession));
        }
        if summary.state == State::Running
            && active.get(execution).is_none_or(|a| {
                a.worker
                    .as_ref()
                    .is_none_or(std::thread::JoinHandle::is_finished)
            })
        {
            summary.state = State::Interrupted;
            summary.reason = Some("Предыдущее выполнение прервано.".into());
        }
        drop(active);
        let mut page = Poll {
            details_truncated: false,
            execution: summary,
            cursor,
            next_cursor: None,
            tests: vec![],
            invocations: vec![],
            catalog: None,
            report: None,
        };
        if persistent.join("catalog.json").exists() {
            let mut c: Discovery =
                decode_required(&bounded(&persistent.join("catalog.json"), MAX_REPORT)?)
                    .map_err(io)?;
            c.validate(&m)?;
            if cursor > c.tests.len() {
                return Err(Error::new(Code::InvalidRequest));
            }
            let all = std::mem::take(&mut c.tests);
            let mut budget = 0;
            for test in all.iter().skip(cursor) {
                let size = serde_json::to_vec(test).map_err(io)?.len();
                if budget + size > 64 * 1024 {
                    break;
                }
                budget += size;
                c.tests.push(test.clone());
            }
            let next = cursor + c.tests.len();
            page.next_cursor = (next < all.len()).then_some(next);
            page.catalog = Some(c);
        }
        if persistent.join("report.json").exists() {
            let r: Report = decode_required(&bounded(&persistent.join("report.json"), MAX_REPORT)?)
                .map_err(io)?;
            r.validate(&m)?;
            if cursor > r.tests.len() {
                return Err(Error::new(Code::InvalidRequest));
            }
            let mut budget = 0;
            for test in r.tests.iter().skip(cursor) {
                let before = serde_json::to_vec(test).map_err(io)?.len();
                let mut test = test.clone();
                for a in &mut test.attempts {
                    clip(&mut a.stdout, 64);
                    clip(&mut a.stderr, 64);
                    a.errors.truncate(1);
                    a.attachments.truncate(4);
                    for e in &mut a.errors {
                        clip(&mut e.message, 128);
                        if let Some(s) = &mut e.stack {
                            clip(s, 128);
                        }
                    }
                }
                let size = serde_json::to_vec(&test).map_err(io)?.len();
                page.details_truncated |= before != size;
                let size = if size > 64 * 1024 && page.tests.is_empty() {
                    // Валидная тяжёлая строка остаётся читаемой: все статусы/попытки сохранены.
                    for attempt in &mut test.attempts {
                        attempt.stdout.clear();
                        attempt.stderr.clear();
                        attempt.errors.clear();
                        attempt.attachments.clear();
                    }
                    clip(&mut test.title, 256);
                    clip(&mut test.file, 256);
                    page.details_truncated = true;
                    serde_json::to_vec(&test).map_err(io)?.len()
                } else {
                    size
                };
                if budget + size > 64 * 1024 {
                    break;
                }
                budget += size;
                // Снимок аргументов публикуется вместе со строкой результата того же invocation.
                if let Some(snapshot) = m
                    .invocations
                    .iter()
                    .find(|invocation| invocation.invocation_id == test.invocation_id)
                {
                    page.invocations.push(snapshot.clone());
                }
                page.tests.push(test);
            }
            let next = cursor + page.tests.len();
            page.next_cursor = (next < r.tests.len()).then_some(next);
            let mut overview = super::v2::Overview::new(&r);
            let before = serde_json::to_vec(&overview).map_err(io)?.len();
            clip(&mut overview.logs.stdout, 8192);
            clip(&mut overview.logs.stderr, 8192);
            for e in &mut overview.runner_errors {
                clip(&mut e.message, 128);
                if let Some(s) = &mut e.stack {
                    clip(s, 256);
                }
            }
            for a in &mut overview.attachments {
                a.path = None;
                if a.unavailable_reason.is_none() {
                    a.unavailable_reason = Some(
                        "Содержимое хранится локально; просмотр по ID требует отдельной команды."
                            .into(),
                    );
                }
            }
            overview.details_truncated = serde_json::to_vec(&overview).map_err(io)?.len() != before;
            page.report = Some(overview);
        }
        if serde_json::to_vec(&page).map_err(io)?.len() > 256 * 1024 {
            return Err(Error::new(Code::InvalidReport));
        }
        Ok(page)
    }
}
fn clip(s: &mut String, max: usize) {
    if s.len() > max {
        let mut end = max;
        while !s.is_char_boundary(end) {
            end -= 1;
        }
        s.truncate(end);
        s.push('…');
    }
}
pub(super) fn execute_process(
    node: &Path,
    bridge: &Path,
    root: &Path,
    manifest: &Path,
    operation: Operation,
    timeout: Duration,
    cancel: &AtomicBool,
) -> Result<bool> {
    let stdout = tempfile::tempfile().map_err(io)?;
    let stderr = tempfile::tempfile().map_err(io)?;
    let mut command = Command::new(node);
    command
        .arg(bridge)
        .arg(if operation == Operation::Discover {
            "discover"
        } else {
            "run"
        })
        .arg(manifest)
        .arg("--await-start")
        .current_dir(root)
        .stdin(Stdio::piped())
        .stdout(stdout.try_clone().map_err(io)?)
        .stderr(stderr.try_clone().map_err(io)?);
    for (key, _) in std::env::vars_os() {
        let upper = key.to_string_lossy().to_ascii_uppercase();
        if upper.starts_with("NODE_") || upper.starts_with("TESTORITTO_") {
            command.env_remove(key);
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .spawn()
        .map_err(|_| Error::new(Code::AutomationUnavailable))?;
    let Ok(containment) = Containment::attach(&child) else {
        let _ = child.kill();
        let _ = child.wait();
        return Err(Error::new(Code::AutomationUnavailable));
    };
    let result = (|| {
        child
            .stdin
            .take()
            .ok_or_else(|| Error::new(Code::Io))?
            .write_all(b"START\n")
            .map_err(io)?;
        let start = Instant::now();
        loop {
            if cancel.load(Ordering::Acquire) {
                return Err(Error::new(Code::Cancelled));
            }
            if start.elapsed() >= timeout {
                return Err(Error::new(Code::Busy));
            }
            if stdout.metadata().map_err(io)?.len() > MAX_LOG as u64
                || stderr.metadata().map_err(io)?.len() > MAX_LOG as u64
            {
                return Err(Error::new(Code::InvalidReport));
            }
            if let Some(status) = child.try_wait().map_err(io)? {
                return Ok(status.success());
            }
            thread::sleep(Duration::from_millis(10));
        }
    })();
    drop(containment);
    let _ = child.kill();
    child.wait().map_err(io)?;
    // Bound every allocation even when the bridge crashes before producing a final envelope.
    let mut text = String::new();
    stdout
        .take(MAX_LOG as u64)
        .read_to_string(&mut text)
        .map_err(io)?;
    result
}
#[cfg(windows)]
#[allow(unsafe_code)]
struct Containment(windows_sys::Win32::Foundation::HANDLE);
#[cfg(windows)]
#[allow(unsafe_code)]
impl Containment {
    fn attach(child: &Child) -> std::result::Result<Self, ()> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
            SetInformationJobObject,
        };
        // SAFETY: null security/name create a new unnamed owned job; all pointers remain valid through calls.
        let handle = unsafe { CreateJobObjectW(std::ptr::null(), std::ptr::null()) };
        if handle.is_null() {
            return Err(());
        }
        let owned = Self(handle);
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        // SAFETY: initialized repr(C) structure and its exact size; job/child handles are live. No user code starts before START.
        if unsafe {
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                (&raw const info).cast(),
                u32::try_from(std::mem::size_of_val(&info)).map_err(|_| ())?,
            )
        } == 0
            || unsafe { AssignProcessToJobObject(handle, child.as_raw_handle()) } == 0
        {
            return Err(());
        }
        Ok(owned)
    }
}
#[cfg(windows)]
#[allow(unsafe_code)]
impl Drop for Containment {
    fn drop(&mut self) {
        // SAFETY: this wrapper exclusively owns a live job; termination covers only its descendants.
        unsafe {
            windows_sys::Win32::System::JobObjects::TerminateJobObject(self.0, 1);
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}
#[cfg(unix)]
struct Containment(rustix::process::Pid);
#[cfg(unix)]
impl Containment {
    fn attach(child: &Child) -> std::result::Result<Self, ()> {
        rustix::process::Pid::from_raw(i32::try_from(child.id()).map_err(|_| ())?)
            .map(Self)
            .ok_or(())
    }
}
#[cfg(unix)]
impl Drop for Containment {
    fn drop(&mut self) {
        let _ = rustix::process::kill_process_group(self.0, rustix::process::Signal::KILL);
    }
}
