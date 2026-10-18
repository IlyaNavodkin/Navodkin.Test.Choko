use super::{
    Code, Error, ReportOverview, Result,
    contracts::{
        Catalog, Key, MAX_LOG, MAX_REPORT, Manifest, Operation, Outcome, Report, State, Status,
        hash, id, relative, uuid,
    },
    store::{
        Active, AutomationService, ExecutionSummary, Poll, atomic, bounded, directory, existing, io,
    },
};
use serde::{Deserialize, Serialize};
use std::{
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
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Start {
    pub profile_id: String,
    pub profile_revision: String,
    pub run_id: String,
    pub operation: Operation,
    pub catalog_execution_id: Option<String>,
    pub catalog_revision: Option<String>,
    pub selection: Vec<Key>,
    pub parent_execution_id: Option<String>,
}
impl AutomationService {
    #[allow(clippy::too_many_lines)] // Одна admission-транзакция: trust, selection и publication.
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
        if !relative(&start.run_id)
            || !id(&start.profile_id)
            || !hash(&start.profile_revision)
            || start.selection.len() > 10_000
            || start.selection.iter().any(|k| !k.valid())
            || start
                .selection
                .iter()
                .collect::<std::collections::HashSet<_>>()
                .len()
                != start.selection.len()
            || start.parent_execution_id.as_ref().is_some_and(|s| !uuid(s))
        {
            return Err(Error::new(Code::InvalidRequest));
        }
        let (profile, node) = self.trusted(&root, &start.profile_id, &start.profile_revision)?;
        // Membership comes from the current repository run catalog, never from a path supplied by the WebView.
        let runs = self
            .repositories
            .catalog_runs(session)
            .map_err(|_| Error::new(Code::InvalidRequest))?;
        let run = runs
            .runs
            .iter()
            .find(|r| r.run_id == start.run_id)
            .ok_or_else(|| Error::new(Code::InvalidRequest))?;
        let (settings, _) = self.settings(&root)?;
        if start.selection.iter().any(|k| {
            !run.cases.iter().any(|c| c.case_id == k.case_id)
                || !settings
                    .bindings
                    .iter()
                    .any(|b| b.profile_id == profile.profile_id && b.key() == *k)
                || !profile.projects.contains(&k.project)
        }) {
            return Err(Error::new(Code::InvalidRequest));
        }
        if start.operation == Operation::Run {
            if start.selection.is_empty() {
                return Err(Error::new(Code::InvalidRequest));
            }
            let previous = start
                .catalog_execution_id
                .as_deref()
                .ok_or_else(|| Error::new(Code::StaleProfile))?;
            let dir = self.execution_dir(&root, &start.run_id, previous, false)?;
            let m: Manifest =
                serde_json::from_slice(&bounded(&dir.join("manifest.json"), MAX_REPORT)?)
                    .map_err(io)?;
            let catalog: Catalog =
                serde_json::from_slice(&bounded(&dir.join("catalog.json"), MAX_REPORT)?)
                    .map_err(io)?;
            catalog.validate(&m)?;
            if m.profile_id != profile.profile_id
                || m.profile_revision != start.profile_revision
                || Some(&catalog.catalog_revision) != start.catalog_revision.as_ref()
                || start
                    .selection
                    .iter()
                    .any(|k| !catalog.tests.iter().any(|t| t.key() == *k))
            {
                return Err(Error::new(Code::StaleProfile));
            }
        } else if !start.selection.is_empty()
            || start.catalog_revision.is_some()
            || start.catalog_execution_id.is_some()
            || start.parent_execution_id.is_some()
        {
            return Err(Error::new(Code::InvalidRequest));
        }
        if let Some(parent) = &start.parent_execution_id {
            let dir = self.execution_dir(&root, &start.run_id, parent, false)?;
            let m: Manifest =
                serde_json::from_slice(&bounded(&dir.join("manifest.json"), MAX_REPORT)?)
                    .map_err(io)?;
            let report: Report =
                serde_json::from_slice(&bounded(&dir.join("report.json"), MAX_REPORT)?)
                    .map_err(io)?;
            report.validate(Some(&m))?;
            if report.profile_id != profile.profile_id
                || start.selection.iter().any(|k| {
                    !report.tests.iter().any(|t| {
                        t.key() == *k
                            && t.outcome == Outcome::Unexpected
                            && t.attempts
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
        let created_at = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let summary = ExecutionSummary {
            execution_id: execution_id.clone(),
            run_id: start.run_id.clone(),
            profile_id: profile.profile_id.clone(),
            operation: start.operation,
            state: State::Running,
            reason: None,
            created_at: created_at.clone(),
        };
        let output = self.output_dir(&execution_id)?;
        let source = self
            .repositories
            .automation_source(session)
            .map_err(|_| Error::new(Code::Io))?;
        let manifest = Manifest {
            schema_version: 1,
            run_id: start.run_id,
            execution_id: execution_id.clone(),
            parent_execution_id: start.parent_execution_id,
            profile_id: profile.profile_id.clone(),
            profile_revision: start.profile_revision,
            catalog_revision: start.catalog_revision,
            created_at,
            source,
            selection: start.selection,
            operation: start.operation,
            profile,
            output_root: output.to_string_lossy().into_owned(),
        };
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
                        let value: Catalog = serde_json::from_slice(&bounded(
                            &output.join("catalog.json"),
                            MAX_REPORT,
                        )?)
                        .map_err(io)?;
                        value.validate(manifest)?;
                        catalog = Some(value);
                        Ok(State::Completed)
                    } else {
                        let mut value: Report = serde_json::from_slice(&bounded(
                            &output.join("report.json"),
                            MAX_REPORT,
                        )?)
                        .map_err(io)?;
                        value.validate(Some(manifest))?;
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
    #[allow(clippy::too_many_lines)] // Полная валидация и bounded paging читаются как один контракт.
    pub fn poll(&self, session: &str, run: &str, execution: &str, cursor: usize) -> Result<Poll> {
        let root = self.root(session)?;
        let persistent = self.execution_dir(&root, run, execution, false)?;
        let m: Manifest =
            serde_json::from_slice(&bounded(&persistent.join("manifest.json"), MAX_REPORT)?)
                .map_err(io)?;
        if m.execution_id != execution || m.run_id != run {
            return Err(Error::new(Code::InvalidReport));
        }
        let mut summary: ExecutionSummary =
            serde_json::from_slice(&bounded(&persistent.join("status.json"), 8192)?).map_err(io)?;
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
            catalog: None,
            report: None,
        };
        if persistent.join("catalog.json").exists() {
            let mut c: Catalog =
                serde_json::from_slice(&bounded(&persistent.join("catalog.json"), MAX_REPORT)?)
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
            let r: Report =
                serde_json::from_slice(&bounded(&persistent.join("report.json"), MAX_REPORT)?)
                    .map_err(io)?;
            r.validate(Some(&m))?;
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
                page.tests.push(test);
            }
            let next = cursor + page.tests.len();
            page.next_cursor = (next < r.tests.len()).then_some(next);
            let mut overview = ReportOverview {
                state: r.state,
                started_at: r.started_at,
                finished_at: r.finished_at,
                source: r.source,
                reason: r.reason,
                logs: r.logs,
                runner_errors: r.runner_errors,
                attachments: r.attachments,
                test_count: r.tests.len(),
                details_truncated: false,
            };
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
