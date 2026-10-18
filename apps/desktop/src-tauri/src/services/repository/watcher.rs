//! Native notifications are hints only; all reads/writes retain canonical/revision checks.
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::{
    fs,
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU8, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

const CONTENT: u8 = 1;
const METADATA: u8 = 2;
const GIT: u8 = 4;
const RESCAN: u8 = 8;
const ERROR: u8 = 16;
pub type EventSink = Arc<dyn Fn(RepositoryChange) + Send + Sync>;
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryChange {
    pub session_id: String,
    pub epoch: u64,
    pub kind: &'static str,
    pub error_code: Option<&'static str>,
}

pub(super) struct RepositoryWatcher {
    native: Option<RecommendedWatcher>,
    active: Arc<AtomicBool>,
    worker: Option<thread::JoinHandle<()>>,
}
impl std::fmt::Debug for RepositoryWatcher {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RepositoryWatcher").finish_non_exhaustive()
    }
}
impl RepositoryWatcher {
    pub(super) fn start(root: &Path, session_id: String, sink: EventSink) -> notify::Result<Self> {
        let pending = Arc::new(AtomicU8::new(0));
        let active = Arc::new(AtomicBool::new(true));
        let event_pending = Arc::clone(&pending);
        let event_root = root.to_path_buf();
        let mut native = RecommendedWatcher::new(
            move |event: notify::Result<Event>| {
                let flags = classify(&event_root, &event);
                event_pending.fetch_or(flags, Ordering::Release);
            },
            Config::default().with_follow_symlinks(false),
        )?;
        native.watch(root, RecursiveMode::Recursive)?;
        if let Some(parent) = root.parent() {
            native.watch(parent, RecursiveMode::NonRecursive)?;
        }
        let worker_active = Arc::clone(&active);
        let worker = thread::Builder::new()
            .name("repository-watch".into())
            .spawn(move || {
                let mut flags = 0;
                let mut first = None;
                let mut last = Instant::now();
                let mut epoch = 0;
                while worker_active.load(Ordering::Acquire) {
                    thread::sleep(Duration::from_millis(40));
                    let next = pending.swap(0, Ordering::AcqRel);
                    if next != 0 {
                        flags |= next;
                        first.get_or_insert_with(Instant::now);
                        last = Instant::now();
                    }
                    if let Some(start) = first
                        && (last.elapsed() >= Duration::from_millis(160)
                            || start.elapsed() >= Duration::from_millis(600))
                    {
                        epoch += 1;
                        if worker_active.load(Ordering::Acquire) {
                            sink(RepositoryChange {
                                session_id: session_id.clone(),
                                epoch,
                                kind: if flags & (ERROR | RESCAN) != 0 {
                                    "rescan"
                                } else if flags & METADATA != 0 {
                                    "metadata"
                                } else if flags == GIT {
                                    "git"
                                } else {
                                    "content"
                                },
                                error_code: (flags & ERROR != 0).then_some("WATCHER_UNAVAILABLE"),
                            });
                        }
                        flags = 0;
                        first = None;
                    }
                }
            })
            .map_err(notify::Error::io)?;
        Ok(Self {
            native: Some(native),
            active,
            worker: Some(worker),
        })
    }
}
impl Drop for RepositoryWatcher {
    fn drop(&mut self) {
        self.active.store(false, Ordering::Release);
        self.native.take();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
fn classify(root: &Path, result: &notify::Result<Event>) -> u8 {
    let Ok(event) = result else {
        return ERROR | RESCAN;
    };
    if event.paths.iter().any(|path| path == root)
        && matches!(
            event.kind,
            EventKind::Remove(_) | EventKind::Modify(notify::event::ModifyKind::Name(_))
        )
    {
        return ERROR | RESCAN;
    }
    if event.need_rescan() {
        return RESCAN;
    }
    if matches!(event.kind, EventKind::Access(_)) {
        return 0;
    }
    event
        .paths
        .iter()
        .fold(0, |flags, path| flags | classify_path(root, path))
}
fn classify_path(root: &Path, path: &Path) -> u8 {
    let Ok(relative) = path.strip_prefix(root) else {
        return 0;
    };
    let name = relative.to_string_lossy().replace('\\', "/");
    let git = name == ".git" || name.starts_with(".git/");
    if git
        && name != ".git"
        && !matches!(
            name.as_str(),
            ".git/HEAD" | ".git/index" | ".git/config" | ".git/packed-refs" | ".git/MERGE_HEAD"
        )
        && !name.starts_with(".git/refs/")
    {
        return 0;
    }
    if !git
        && (name.starts_with(".casewright/cache/")
            || name.split('/').any(|part| part.starts_with(".testoritto-")))
    {
        return 0;
    }
    // Never follow links, including replaced ancestors; deleted paths remain useful hints.
    let mut current = root.to_path_buf();
    for part in relative.components() {
        if !matches!(part, std::path::Component::Normal(_)) {
            return 0;
        }
        current.push(part);
        if fs::symlink_metadata(&current).is_ok_and(|meta| meta.file_type().is_symlink()) {
            return 0;
        }
    }
    if git {
        return GIT;
    }
    if name == ".casewright" || name == ".casewright/config.yaml" {
        return METADATA;
    }
    CONTENT
}
#[cfg(test)]
mod tests;
