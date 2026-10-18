use super::{
    contracts::*,
    store::{atomic, bounded, digest, existing},
    *,
};
use crate::{mutation_queue::MutationQueues, services::repository::RepositoryService};
use sha2::Digest;
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};
fn node() -> PathBuf {
    std::env::split_paths(&std::env::var_os("PATH").unwrap())
        .map(|p| p.join(if cfg!(windows) { "node.exe" } else { "node" }))
        .find(|p| p.is_file())
        .and_then(|p| fs::canonicalize(p).ok())
        .expect("Node fixture runtime")
}
fn write(root: &Path, name: &str, text: &str) {
    let path = root.join(name);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}
const BRIDGE: &str = r#"
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';
await new Promise(resolve=>process.stdin.once('data',data=>{if(data.toString()!=='START\n')process.exit(3);process.stdin.pause();resolve();}));
const op=process.argv[2],m=JSON.parse(fs.readFileSync(process.argv[3],'utf8')),out=m.outputRoot;
const mode=fs.readFileSync(path.resolve(process.cwd(),m.profile.config),'utf8');
if(mode==='slow'){
 spawn(process.execPath,['-e', "const fs=require('node:fs');fs.writeFileSync('descendant-ready','yes');setInterval(()=>{if(fs.existsSync('probe-descendant'))fs.writeFileSync('descendant-escaped','bad')},20)"],{stdio:'ignore',windowsHide:true});
 fs.writeFileSync('spawned','yes');await new Promise(()=>{});
}
const key={caseId:'C1',automationId:'A1',project:'unit',variantId:'default'};
if(op==='discover')fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify({schemaVersion:1,executionId:m.executionId,profileId:m.profileId,profileRevision:m.profileRevision,catalogRevision:'b'.repeat(64),tests:[{...key,title:'Кириллица',file:'x.spec.mjs',expectedStatus:'passed'}],dependencies:[]}));
else {
 const {profile,outputRoot,operation,...correlation}=m;
 const tests=m.selection.map(key=>({...key,title:'Кириллица',file:'x.spec.mjs',expectedStatus:'passed',outcome:'expected',attempts:[{retry:0,repeatEachIndex:0,status:'passed',startedAt:m.createdAt,durationMs:1,errors:[],stdout:mode==='large'?'x'.repeat(1024*1024):'',stderr:'',attachments:[]}]}));
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({...correlation,state:'completed',reason:null,startedAt:m.createdAt,finishedAt:m.createdAt,complete:true,tests,runnerErrors:[],logs:{stdout:'',stderr:'',truncated:false},attachments:[]}));
}
"#;
struct Fixture {
    temp: tempfile::TempDir,
    service: Arc<AutomationService>,
    session: String,
    run: String,
}
impl Fixture {
    fn new() -> Self {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().join("repo");
        fs::create_dir(&root).unwrap();
        assert!(
            Command::new("git")
                .args(["init", "--initial-branch=main"])
                .current_dir(&root)
                .output()
                .unwrap()
                .status
                .success()
        );
        write(
            &root,
            ".casewright/config.yaml",
            "version: 1\nname: Tests\ndisplayIdPrefix: QA\nworkspaces:\n  - .\n",
        );
        write(
            &root,
            ".casewright/runs/example/_run.md",
            "---\nname: Example\nstatus: open\n---\n\n## Summary\nKeep\n",
        );
        write(
            &root,
            ".casewright/runs/example/001-C1.md",
            "---\ncase_id: C1\nresult: pass\nunknown: keep\n---\n\n## Notes\nKeep\n",
        );
        write(&root, "playwright.config.mjs", "normal");
        write(
            &root,
            "node_modules/@playwright/test/package.json",
            r#"{"version":"1.64.1"}"#,
        );
        write(&root, "node_modules/@playwright/test/cli.js", "// fixture");
        write(temp.path(), "bridge.mjs", BRIDGE);
        let repositories = Arc::new(RepositoryService::default());
        let opened = repositories.open(&root).unwrap();
        let runs = repositories.catalog_runs(&opened.session_id).unwrap();
        assert_eq!(runs.runs.len(), 1);
        let service = Arc::new(AutomationService::new(
            repositories,
            Arc::new(MutationQueues::default()),
            temp.path().join("app-data"),
            temp.path().join("bridge.mjs"),
        ));
        Self {
            temp,
            service,
            session: opened.session_id,
            run: runs.runs[0].run_id.clone(),
        }
    }
    fn root(&self) -> PathBuf {
        self.temp.path().join("repo")
    }
    fn profile(timeout: u64) -> Profile {
        Profile {
            schema_version: 1,
            profile_id: "local".into(),
            label: "Локальный профиль".into(),
            cwd: ".".into(),
            config: "playwright.config.mjs".into(),
            projects: vec!["unit".into()],
            timeout_ms: timeout,
            retries: 0,
            workers: 1,
        }
    }
    fn save(&self, timeout: u64) -> ProfileView {
        let v = self.service.read(&self.session).unwrap();
        self.service
            .save_profile(
                &self.session,
                &v.revision,
                &Self::profile(timeout),
                &node().to_string_lossy(),
            )
            .unwrap()
            .profiles
            .remove(0)
    }
    fn trusted(&self, timeout: u64) -> ProfileView {
        let p = self.save(timeout);
        self.service
            .trust(&self.session, "local", &p.revision, true)
            .unwrap()
            .profiles
            .remove(0)
    }
    fn start(
        &self,
        p: &ProfileView,
        operation: Operation,
        catalog: Option<&ExecutionSummary>,
    ) -> ExecutionSummary {
        let key = Key {
            case_id: "C1".into(),
            automation_id: "A1".into(),
            project: "unit".into(),
            variant_id: "default".into(),
        };
        self.service
            .start(
                &self.session,
                Start {
                    profile_id: "local".into(),
                    profile_revision: p.revision.clone(),
                    run_id: self.run.clone(),
                    operation,
                    catalog_execution_id: catalog.map(|c| c.execution_id.clone()),
                    catalog_revision: catalog.map(|_| "b".repeat(64)),
                    selection: if operation == Operation::Run {
                        vec![key]
                    } else {
                        vec![]
                    },
                    parent_execution_id: None,
                },
            )
            .unwrap()
    }
    fn wait(&self, id: &str) -> Poll {
        let start = Instant::now();
        loop {
            let p = self.service.poll(&self.session, &self.run, id, 0).unwrap();
            if p.execution.state != State::Running {
                return p;
            }
            assert!(start.elapsed() < Duration::from_secs(10));
            thread::sleep(Duration::from_millis(20));
        }
    }
}
#[test]
fn shared_contract_fixture_and_strict_correlation() {
    let m: Manifest = serde_json::from_slice(include_bytes!(
        "../../../../../../tools/playwright-automation/fixtures/manifest.json"
    ))
    .unwrap();
    let mut r: Report = serde_json::from_slice(include_bytes!(
        "../../../../../../tools/playwright-automation/fixtures/report.json"
    ))
    .unwrap();
    r.validate(Some(&m)).unwrap();
    r.tests[0].title = "я".repeat(4096);
    r.validate(Some(&m)).unwrap();
    r.tests[0].outcome = Outcome::Flaky;
    assert!(r.validate(Some(&m)).is_err());
    r.tests[0].outcome = Outcome::Expected;
    r.execution_id = uuid::Uuid::new_v4().to_string();
    assert!(r.validate(Some(&m)).is_err());
    let mut raw = serde_json::to_value(&m).unwrap();
    raw["shell"] = serde_json::json!("bad");
    assert!(serde_json::from_value::<Manifest>(raw).is_err());
}
#[test]
fn profile_open_is_readonly_and_trust_revokes_on_config_changes() {
    let f = Fixture::new();
    let case = fs::read(f.root().join(".casewright/runs/example/001-C1.md")).unwrap();
    assert!(f.service.read(&f.session).unwrap().profiles.is_empty());
    assert!(!f.root().join(".testoritto").exists());
    assert!(!f.temp.path().join("app-data").exists());
    let p = f.save(5000);
    let e = f
        .service
        .start(
            &f.session,
            Start {
                profile_id: "local".into(),
                profile_revision: p.revision.clone(),
                run_id: f.run.clone(),
                operation: Operation::Discover,
                catalog_execution_id: None,
                catalog_revision: None,
                selection: vec![],
                parent_execution_id: None,
            },
        )
        .unwrap_err();
    assert_eq!(e.code, Code::AutomationUntrusted);
    assert!(!f.root().join("spawned").exists());
    f.service
        .trust(&f.session, "local", &p.revision, true)
        .unwrap();
    assert!(f.service.read(&f.session).unwrap().profiles[0].trusted);
    fs::write(f.root().join("playwright.config.mjs"), "changed").unwrap();
    assert!(!f.service.read(&f.session).unwrap().profiles[0].trusted);
    assert_eq!(
        f.service
            .trust(&f.session, "local", &p.revision, true)
            .unwrap_err()
            .code,
        Code::StaleProfile
    );
    assert_eq!(
        fs::read(f.root().join(".casewright/runs/example/001-C1.md")).unwrap(),
        case
    );
    assert_eq!(
        f.service
            .read(&uuid::Uuid::new_v4().to_string())
            .unwrap_err()
            .code,
        Code::InvalidSession
    );
}
#[test]
fn real_node_discover_run_persistence_and_bounded_poll() {
    let f = Fixture::new();
    fs::write(f.root().join("playwright.config.mjs"), "large").unwrap();
    let p = f.trusted(5000);
    let view = f.service.read(&f.session).unwrap();
    f.service
        .save_bindings(
            &f.session,
            &view.revision,
            vec![Binding {
                case_id: "C1".into(),
                automation_id: "A1".into(),
                project: "unit".into(),
                variant_id: "default".into(),
                profile_id: "local".into(),
            }],
        )
        .unwrap();
    let d = f.start(&p, Operation::Discover, None);
    let discovery = f.wait(&d.execution_id);
    assert_eq!(discovery.execution.state, State::Completed);
    assert_eq!(discovery.catalog.unwrap().tests.len(), 1);
    let r = f.start(&p, Operation::Run, Some(&d));
    let result = f.wait(&r.execution_id);
    assert_eq!(result.execution.state, State::Completed);
    assert_eq!(result.tests.len(), 1);
    assert!(result.details_truncated);
    assert!(result.tests[0].attempts[0].stdout.len() < 100);
    assert!(serde_json::to_vec(&result).unwrap().len() < 256 * 1024);
    let history = f.service.read(&f.session).unwrap().history;
    assert_eq!(history.len(), 2);
    assert!(history.iter().all(|e| e.state == State::Completed));
    let index = Command::new("git")
        .args(["diff", "--cached", "--name-only"])
        .current_dir(f.root())
        .output()
        .unwrap();
    assert!(index.stdout.is_empty());
    f.service.shutdown().unwrap();
}
#[test]
fn stop_and_session_close_kill_descendants_and_do_not_wait_for_timeout() {
    let f = Fixture::new();
    fs::write(f.root().join("playwright.config.mjs"), "slow").unwrap();
    let p = f.trusted(5000);
    let d = f.start(&p, Operation::Discover, None);
    let start = Instant::now();
    while !f.root().join("descendant-ready").exists() {
        assert!(start.elapsed() < Duration::from_secs(5));
        thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(
        f.service
            .start(
                &f.session,
                Start {
                    profile_id: "local".into(),
                    profile_revision: p.revision,
                    run_id: f.run.clone(),
                    operation: Operation::Discover,
                    catalog_execution_id: None,
                    catalog_revision: None,
                    selection: vec![],
                    parent_execution_id: None
                }
            )
            .unwrap_err()
            .code,
        Code::Busy
    );
    let start = Instant::now();
    f.service.cancel(&f.session, &d.execution_id).unwrap();
    f.service.close_session(&f.session).unwrap();
    assert!(start.elapsed() < Duration::from_secs(2));
    assert_eq!(f.wait(&d.execution_id).execution.state, State::Interrupted);
    fs::write(
        f.root().join("probe-descendant"),
        "release after cancel and join",
    )
    .unwrap();
    thread::sleep(Duration::from_millis(1100));
    assert!(!f.root().join("descendant-escaped").exists());
}
#[test]
fn timeout_is_distinct_from_cancellation() {
    let f = Fixture::new();
    fs::write(f.root().join("playwright.config.mjs"), "slow").unwrap();
    let p = f.trusted(300);
    let d = f.start(&p, Operation::Discover, None);
    assert_eq!(f.wait(&d.execution_id).execution.state, State::TimedOut);
    f.service.shutdown().unwrap();
    fs::write(
        f.root().join("probe-descendant"),
        "release after timeout and join",
    )
    .unwrap();
    thread::sleep(Duration::from_millis(1000));
    assert!(!f.root().join("descendant-escaped").exists());
}
#[test]
fn invalid_paths_oversized_reads_and_atomic_conflicts_are_rejected() {
    let temp = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temp.path()).unwrap();
    for path in [
        "../x",
        "a/../b",
        "/absolute",
        "C:/x",
        "a:b",
        "a\\b",
        ".git/config",
    ] {
        assert!(existing(&root, path).is_err());
    }
    atomic(&root, "state.json", &vec!["one"]).unwrap();
    assert!(atomic(&root, "../escape", &"bad").is_err());
    assert!(bounded(&root.join("state.json"), 1).is_err());
    assert_eq!(digest(b""), format!("{:x}", sha2::Sha256::digest(b"")));
    let cancel = AtomicBool::new(false);
    let nonexistent = root.join("missing-node");
    assert_eq!(
        super::runner::execute_process(
            &nonexistent,
            &root.join("bridge.mjs"),
            &root,
            &root.join("manifest.json"),
            Operation::Discover,
            Duration::from_millis(100),
            &cancel
        )
        .unwrap_err()
        .code,
        Code::AutomationUnavailable
    );
    cancel.store(true, Ordering::Relaxed);
}
