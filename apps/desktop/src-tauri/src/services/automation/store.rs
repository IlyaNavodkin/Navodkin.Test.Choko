use super::{
    Code, Error, Result,
    contracts::{
        Binding, Catalog, MAX_REPORT, Operation, Profile, State, TestRecord, id, relative, uuid,
    },
};
use crate::{mutation_queue::MutationQueues, services::repository::RepositoryService};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::JoinHandle,
};

pub(super) fn io(_: impl std::fmt::Debug) -> Error {
    Error::new(Code::Io)
}
pub(super) fn digest(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
pub(super) fn bounded(path: &Path, limit: usize) -> Result<Vec<u8>> {
    crate::services::repository::atomic::read_automation(path, limit).map_err(io)
}
pub(super) fn existing(root: &Path, rel: &str) -> Result<PathBuf> {
    if !relative(rel) {
        return Err(Error::new(Code::InvalidRequest));
    }
    let mut path = root.to_path_buf();
    for component in rel.split('/') {
        path.push(component);
        let meta = fs::symlink_metadata(&path).map_err(io)?;
        if meta.file_type().is_symlink() {
            return Err(Error::new(Code::InvalidRequest));
        }
    }
    let canonical = fs::canonicalize(&path).map_err(io)?;
    if !canonical.starts_with(root) {
        return Err(Error::new(Code::InvalidRequest));
    }
    Ok(canonical)
}
pub(super) fn directory(root: &Path, rel: &str) -> Result<PathBuf> {
    if !relative(rel) {
        return Err(Error::new(Code::InvalidRequest));
    }
    let mut path = root.to_path_buf();
    for part in rel.split('/') {
        path.push(part);
        match fs::symlink_metadata(&path) {
            Ok(m) if m.is_dir() && !m.file_type().is_symlink() => {}
            Ok(_) => return Err(Error::new(Code::InvalidRequest)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                crate::services::repository::atomic::ensure_directory(&path).map_err(io)?;
            }
            Err(e) => return Err(io(e)),
        }
    }
    let canonical = fs::canonicalize(path).map_err(io)?;
    if !canonical.starts_with(root) {
        return Err(Error::new(Code::InvalidRequest));
    }
    Ok(canonical)
}
pub(super) fn atomic<T: Serialize>(root: &Path, name: &str, value: &T) -> Result<()> {
    if !relative(name) || name.contains('/') {
        return Err(Error::new(Code::InvalidRequest));
    }
    let destination = root.join(name);
    if let Ok(m) = fs::symlink_metadata(&destination)
        && (!m.is_file() || m.file_type().is_symlink())
    {
        return Err(Error::new(Code::InvalidRequest));
    }
    let bytes = serde_json::to_vec(value).map_err(io)?;
    if bytes.len() > MAX_REPORT {
        return Err(Error::new(Code::InvalidReport));
    }
    if destination.exists() {
        let previous = bounded(&destination, MAX_REPORT)?;
        if !crate::services::repository::atomic::replace(&destination, &digest(&previous), &bytes)
            .map_err(io)?
        {
            return Err(Error::new(Code::StaleResource));
        }
    } else {
        crate::services::repository::atomic::create(&destination, &bytes, None).map_err(io)?;
    }
    Ok(())
}
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub profiles: Vec<Profile>,
    pub bindings: Vec<Binding>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Local {
    node: String,
    grant: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileView {
    pub profile: Profile,
    pub revision: String,
    pub trusted: bool,
    pub node_path: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutomationView {
    pub revision: String,
    pub profiles: Vec<ProfileView>,
    pub bindings: Vec<Binding>,
    pub history: Vec<ExecutionSummary>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExecutionSummary {
    pub execution_id: String,
    pub run_id: String,
    pub profile_id: String,
    pub operation: Operation,
    pub state: State,
    pub reason: Option<String>,
    pub created_at: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Poll {
    pub details_truncated: bool,
    pub execution: ExecutionSummary,
    pub cursor: usize,
    pub next_cursor: Option<usize>,
    pub tests: Vec<TestRecord>,
    pub catalog: Option<Catalog>,
    pub report: Option<ReportOverview>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportOverview {
    pub state: State,
    pub started_at: String,
    pub finished_at: String,
    pub source: super::contracts::Source,
    pub reason: Option<String>,
    pub logs: super::contracts::Logs,
    pub runner_errors: Vec<super::contracts::ErrorRecord>,
    pub attachments: Vec<super::contracts::Attachment>,
    pub test_count: usize,
    pub details_truncated: bool,
}
pub(super) struct Active {
    pub session: String,
    pub cancel: Arc<AtomicBool>,
    pub summary: ExecutionSummary,
    pub worker: Option<JoinHandle<Result<()>>>,
}
pub struct AutomationService {
    pub(super) repositories: Arc<RepositoryService>,
    pub(super) queues: Arc<MutationQueues>,
    pub(super) app_data: PathBuf,
    pub(super) bridge: PathBuf,
    pub(super) active: Mutex<HashMap<String, Active>>,
    pub(super) closing: Mutex<std::collections::HashSet<String>>,
    cleanup_failures: Mutex<HashMap<String, Code>>,
}
impl AutomationService {
    pub(crate) fn new(
        repositories: Arc<RepositoryService>,
        queues: Arc<MutationQueues>,
        app_data: PathBuf,
        bridge: PathBuf,
    ) -> Self {
        Self {
            repositories,
            queues,
            app_data,
            bridge,
            active: Mutex::default(),
            closing: Mutex::default(),
            cleanup_failures: Mutex::default(),
        }
    }
    pub(super) fn root(&self, session: &str) -> Result<PathBuf> {
        if !uuid(session) {
            return Err(Error::new(Code::InvalidSession));
        }
        self.repositories
            .canonical_root_for_session(session)
            .map_err(|_| Error::new(Code::InvalidSession))
    }
    #[allow(clippy::unused_self)] // Общий сервисный интерфейс storage.
    pub(super) fn metadata(&self, root: &Path, create: bool) -> Result<Option<PathBuf>> {
        let path = root.join(".testoritto/automation");
        if create {
            directory(root, ".testoritto/automation").map(Some)
        } else if path.exists() {
            existing(root, ".testoritto/automation").map(Some)
        } else {
            Ok(None)
        }
    }
    pub(super) fn settings(&self, root: &Path) -> Result<(Settings, String)> {
        let Some(folder) = self.metadata(root, false)? else {
            return Ok((Settings::default(), digest(b"")));
        };
        let path = folder.join("profiles.json");
        if !path.exists() {
            return Ok((Settings::default(), digest(b"")));
        }
        let bytes = bounded(&path, MAX_REPORT)?;
        let settings: Settings =
            serde_json::from_slice(&bytes).map_err(|_| Error::new(Code::InvalidReport))?;
        validate_settings(&settings)?;
        Ok((settings, digest(&bytes)))
    }
    fn local_dir(&self, root: &Path, create: bool) -> Result<Option<PathBuf>> {
        let rel = format!("automation/{}", digest(root.to_string_lossy().as_bytes()));
        if create {
            fs::create_dir_all(&self.app_data).map_err(io)?;
            let base = fs::canonicalize(&self.app_data).map_err(io)?;
            directory(&base, &rel).map(Some)
        } else {
            if !self.app_data.exists() {
                return Ok(None);
            }
            let base = fs::canonicalize(&self.app_data).map_err(io)?;
            if base.join(&rel).exists() {
                existing(&base, &rel).map(Some)
            } else {
                Ok(None)
            }
        }
    }
    fn local(&self, root: &Path, profile: &str) -> Result<Option<Local>> {
        let Some(folder) = self.local_dir(root, false)? else {
            return Ok(None);
        };
        let file = folder.join(format!("{}.json", digest(profile.as_bytes())));
        if !file.exists() {
            return Ok(None);
        }
        serde_json::from_slice(&bounded(&file, 16 * 1024)?)
            .map(Some)
            .map_err(|_| Error::new(Code::InvalidReport))
    }
    fn fingerprint(root: &Path, profile: &Profile, node: &str) -> Result<String> {
        profile.validate()?;
        let cwd = if profile.cwd == "." {
            root.to_path_buf()
        } else {
            existing(root, &profile.cwd)?
        };
        if !cwd.is_dir() {
            return Err(Error::new(Code::InvalidRequest));
        }
        let config = existing(&cwd, &profile.config)?;
        let node_path = Path::new(node);
        if !node_path.is_absolute() || node.contains(['\0', '\r', '\n']) {
            return Err(Error::new(Code::InvalidRequest));
        }
        let node =
            fs::canonicalize(node_path).map_err(|_| Error::new(Code::AutomationUnavailable))?;
        let mut hash = Sha256::new();
        hash.update(root.to_string_lossy().as_bytes());
        hash.update(serde_json::to_vec(profile).map_err(io)?);
        for p in [&config, &node] {
            hash.update(p.to_string_lossy().as_bytes());
            hash.update(bounded(p, 128 * 1024 * 1024)?);
        }
        // Installed package metadata/CLI are checked without invoking a package manager.
        let package = resolve_package(&cwd, root)?;
        for p in [package.join("package.json"), package.join("cli.js")] {
            hash.update(p.to_string_lossy().as_bytes());
            hash.update(bounded(&p, MAX_REPORT)?);
        }
        for name in [
            "pnpm-lock.yaml",
            "package-lock.json",
            "yarn.lock",
            "bun.lock",
        ] {
            for dir in [&cwd, root] {
                let p = dir.join(name);
                if p.exists() {
                    hash.update(bounded(&p, MAX_REPORT)?);
                }
            }
        }
        Ok(format!("{:x}", hash.finalize()))
    }
    pub fn read(&self, session: &str) -> Result<AutomationView> {
        let root = self.root(session)?;
        let (settings, revision) = self.settings(&root)?;
        let profiles = settings
            .profiles
            .into_iter()
            .map(|profile| {
                let local = self.local(&root, &profile.profile_id)?;
                let node_path = local.as_ref().map(|l| l.node.clone());
                let fingerprint = node_path
                    .as_deref()
                    .and_then(|n| Self::fingerprint(&root, &profile, n).ok());
                Ok(ProfileView {
                    trusted: local
                        .as_ref()
                        .is_some_and(|l| l.grant.is_some() && l.grant == fingerprint),
                    revision: fingerprint.unwrap_or_else(|| {
                        digest(&serde_json::to_vec(&profile).unwrap_or_default())
                    }),
                    profile,
                    node_path,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        Ok(AutomationView {
            revision,
            profiles,
            bindings: settings.bindings,
            history: self.history(&root)?,
        })
    }
    pub fn save_profile(
        &self,
        session: &str,
        expected: &str,
        profile: &Profile,
        node: &str,
    ) -> Result<AutomationView> {
        profile.validate()?;
        let root = self.root(session)?;
        let (mut settings, revision) = self.settings(&root)?;
        if expected != revision {
            return Err(Error::new(Code::StaleResource));
        }
        let node = fs::canonicalize(node)
            .map_err(|_| Error::new(Code::AutomationUnavailable))?
            .to_string_lossy()
            .into_owned();
        Self::fingerprint(&root, profile, &node)?;
        settings
            .profiles
            .retain(|p| p.profile_id != profile.profile_id);
        settings.profiles.push(profile.clone());
        validate_settings(&settings)?;
        let local = self
            .local_dir(&root, true)?
            .ok_or_else(|| Error::new(Code::Io))?;
        atomic(
            &local,
            &format!("{}.json", digest(profile.profile_id.as_bytes())),
            &Local { node, grant: None },
        )?;
        atomic(
            &self
                .metadata(&root, true)?
                .ok_or_else(|| Error::new(Code::Io))?,
            "profiles.json",
            &settings,
        )?;
        self.read(session)
    }
    pub fn save_bindings(
        &self,
        session: &str,
        expected: &str,
        bindings: Vec<Binding>,
    ) -> Result<AutomationView> {
        let root = self.root(session)?;
        let (mut settings, revision) = self.settings(&root)?;
        if expected != revision {
            return Err(Error::new(Code::StaleResource));
        }
        settings.bindings = bindings;
        validate_settings(&settings)?;
        atomic(
            &self
                .metadata(&root, true)?
                .ok_or_else(|| Error::new(Code::Io))?,
            "profiles.json",
            &settings,
        )?;
        self.read(session)
    }
    pub fn trust(
        &self,
        session: &str,
        profile_id: &str,
        expected: &str,
        grant: bool,
    ) -> Result<AutomationView> {
        let root = self.root(session)?;
        let (settings, _) = self.settings(&root)?;
        let profile = settings
            .profiles
            .iter()
            .find(|p| p.profile_id == profile_id)
            .ok_or_else(|| Error::new(Code::InvalidRequest))?;
        let mut local = self
            .local(&root, profile_id)?
            .ok_or_else(|| Error::new(Code::AutomationUnavailable))?;
        let fingerprint = Self::fingerprint(&root, profile, &local.node)?;
        if fingerprint != expected {
            return Err(Error::new(Code::StaleProfile));
        }
        local.grant = grant.then_some(fingerprint);
        let folder = self
            .local_dir(&root, true)?
            .ok_or_else(|| Error::new(Code::Io))?;
        atomic(
            &folder,
            &format!("{}.json", digest(profile_id.as_bytes())),
            &local,
        )?;
        self.read(session)
    }
    pub(super) fn trusted(
        &self,
        root: &Path,
        profile_id: &str,
        revision: &str,
    ) -> Result<(Profile, PathBuf)> {
        let (settings, _) = self.settings(root)?;
        let p = settings
            .profiles
            .into_iter()
            .find(|p| p.profile_id == profile_id)
            .ok_or_else(|| Error::new(Code::InvalidRequest))?;
        let local = self
            .local(root, profile_id)?
            .ok_or_else(|| Error::new(Code::AutomationUntrusted))?;
        let fingerprint = Self::fingerprint(root, &p, &local.node)?;
        if revision != fingerprint {
            return Err(Error::new(Code::StaleProfile));
        }
        if local.grant.as_ref() != Some(&fingerprint) {
            return Err(Error::new(Code::AutomationUntrusted));
        }
        Ok((p, PathBuf::from(local.node)))
    }
    #[allow(clippy::unused_self)] // Общий сервисный интерфейс storage.
    pub(super) fn execution_dir(
        &self,
        root: &Path,
        run: &str,
        execution: &str,
        create: bool,
    ) -> Result<PathBuf> {
        if !relative(run) || !uuid(execution) {
            return Err(Error::new(Code::InvalidRequest));
        }
        let rel = format!(
            ".testoritto/automation/runs/{}/{}",
            digest(run.as_bytes()),
            execution
        );
        if create {
            directory(root, &rel)
        } else {
            existing(root, &rel)
        }
    }
    pub(super) fn history(&self, root: &Path) -> Result<Vec<ExecutionSummary>> {
        let Some(metadata) = self.metadata(root, false)? else {
            return Ok(vec![]);
        };
        let runs = metadata.join("runs");
        if !runs.exists() {
            return Ok(vec![]);
        }
        let mut history = Vec::new();
        for run in fs::read_dir(existing(root, ".testoritto/automation/runs")?)
            .map_err(io)?
            .take(10_001)
        {
            let run = run.map_err(io)?;
            if !run.file_type().map_err(io)?.is_dir() {
                continue;
            }
            for entry in fs::read_dir(run.path()).map_err(io)?.take(10_001) {
                let entry = entry.map_err(io)?;
                if !entry.file_type().map_err(io)?.is_dir() {
                    continue;
                }
                let p = entry.path().join("status.json");
                if !p.exists() {
                    continue;
                }
                let mut status: ExecutionSummary = serde_json::from_slice(&bounded(&p, 8192)?)
                    .map_err(|_| Error::new(Code::InvalidReport))?;
                if !uuid(&status.execution_id)
                    || !relative(&status.run_id)
                    || !id(&status.profile_id)
                    || chrono::DateTime::parse_from_rfc3339(&status.created_at).is_err()
                    || status.reason.as_ref().is_some_and(|s| s.len() > 4096)
                {
                    return Err(Error::new(Code::InvalidReport));
                }
                if status.state == State::Running
                    && !self
                        .active
                        .lock()
                        .map_err(io)?
                        .contains_key(&status.execution_id)
                {
                    status.state = State::Interrupted;
                    status.reason = Some(
                        "Предыдущее выполнение прервано; автоматическое возобновление отключено."
                            .into(),
                    );
                }
                history.push(status);
                if history.len() > 10_000 {
                    return Err(Error::new(Code::InvalidReport));
                }
            }
        }
        history.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(history)
    }
    pub fn cancel(&self, session: &str, execution: &str) -> Result<()> {
        self.root(session)?;
        let active = self.active.lock().map_err(io)?;
        let execution = active
            .get(execution)
            .ok_or_else(|| Error::new(Code::StaleResource))?;
        if execution.session != session {
            return Err(Error::new(Code::InvalidSession));
        }
        execution.cancel.store(true, Ordering::Release);
        Ok(())
    }
    pub(crate) fn close_session(&self, session: &str) -> Result<()> {
        if let Some(code) = self.cleanup_failures.lock().map_err(io)?.get(session) {
            return Err(Error::new(*code));
        }
        self.closing.lock().map_err(io)?.insert(session.into());
        let workers = {
            let mut active = self.active.lock().map_err(io)?;
            active
                .values_mut()
                .filter(|a| a.session == session)
                .map(|a| {
                    a.cancel.store(true, Ordering::Release);
                    a.worker.take()
                })
                .collect::<Vec<_>>()
        };
        for worker in workers.into_iter().flatten() {
            let result = worker
                .join()
                .map_err(|_| Error::new(Code::Internal))
                .and_then(std::convert::identity);
            if let Err(error) = result {
                self.cleanup_failures
                    .lock()
                    .map_err(io)?
                    .insert(session.into(), error.code);
                return Err(error);
            }
        }
        Ok(())
    }
    pub(crate) fn shutdown(&self) -> Result<()> {
        let sessions = self
            .active
            .lock()
            .map_err(io)?
            .values()
            .map(|a| a.session.clone())
            .collect::<Vec<_>>();
        for session in sessions {
            self.close_session(&session)?;
        }
        Ok(())
    }
}
fn validate_settings(s: &Settings) -> Result<()> {
    if s.profiles.len() > 100 || s.bindings.len() > 10_000 {
        return Err(Error::new(Code::InvalidRequest));
    }
    let mut profiles = std::collections::HashSet::new();
    for p in &s.profiles {
        p.validate()?;
        if !profiles.insert(&p.profile_id) {
            return Err(Error::new(Code::InvalidRequest));
        }
    }
    let mut bindings = std::collections::HashSet::new();
    for b in &s.bindings {
        if !b.key().valid()
            || !profiles.contains(&b.profile_id)
            || !bindings.insert((&b.profile_id, b.key()))
        {
            return Err(Error::new(Code::InvalidRequest));
        }
    }
    Ok(())
}
pub(super) fn resolve_package(cwd: &Path, root: &Path) -> Result<PathBuf> {
    let mut dir = cwd;
    loop {
        let candidate = dir.join("node_modules/@playwright/test");
        if candidate.exists() {
            let canonical = fs::canonicalize(candidate).map_err(io)?;
            if !canonical.starts_with(root) {
                return Err(Error::new(Code::InvalidRequest));
            }
            return Ok(canonical);
        }
        if dir == root {
            break;
        }
        dir = dir
            .parent()
            .ok_or_else(|| Error::new(Code::AutomationUnavailable))?;
    }
    Err(Error::new(Code::AutomationUnavailable))
}
