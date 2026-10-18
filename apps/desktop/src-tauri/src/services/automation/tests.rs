use super::{
    contracts::{Attempt, Expected, Logs, Operation, Outcome, Profile, Source, State, Status},
    store::{atomic, bounded, digest, existing},
    v2::*,
    *,
};
use crate::{mutation_queue::MutationQueues, services::repository::RepositoryService};
use sha2::Digest;
use std::{
    collections::{BTreeMap, BTreeSet},
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
if(op==='discover')fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify({schemaVersion:2,executionId:m.executionId,profileId:m.profileId,profileRevision:m.profileRevision,catalogRevision:'b'.repeat(64),tests:[{...key,title:'Кириллица',file:'x.spec.mjs',expectedStatus:'passed'}],dependencies:[]}));
else {
 const {profile,outputRoot,operation,invocations,sourceKind,...correlation}=m;
 const tests=invocations.map(inv=>({invocationId:inv.invocationId,caseId:inv.binding.caseId,automationId:inv.autotest.selector.automationId,project:inv.autotest.selector.project,variantId:inv.autotest.selector.variantId,title:'Кириллица '+inv.resolvedArguments.baseUrl,file:'x.spec.mjs',expectedStatus:'passed',outcome:'expected',attempts:[{retry:0,repeatEachIndex:0,status:'passed',startedAt:m.createdAt,durationMs:1,errors:[],stdout:mode==='large'?'x'.repeat(1024*1024):'',stderr:'',attachments:[]}]}));
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({...correlation,state:'completed',reason:null,startedAt:m.createdAt,finishedAt:m.createdAt,complete:true,tests,runnerErrors:[],logs:{stdout:'',stderr:'',truncated:false},attachments:[]}));
 fs.writeFileSync(path.join(out,'junit.xml'),'<?xml version="1.0"?><testsuites/>');
}
"#;
fn autotest() -> Autotest {
    Autotest {
        schema_version: 2,
        id: "11111111-1111-4111-8111-000000000001".into(),
        title: "Оплата картой".into(),
        description: String::new(),
        archived: false,
        revision: "rev-1".into(),
        profile_id: "local".into(),
        selector: AutotestSelector {
            automation_id: "A1".into(),
            project: "unit".into(),
            variant_id: "default".into(),
        },
        argument_definitions: vec![ArgumentDefinition {
            key: "baseUrl".into(),
            label: "Адрес стенда".into(),
            description: String::new(),
            required: true,
            kind: ArgumentType::String,
            format: Some(StringFormat::Url),
            default: None,
            options: None,
            min: None,
            max: None,
        }],
        defaults: BTreeMap::new(),
    }
}
fn binding(autotest_id: &str, overrides: BTreeMap<String, ArgumentValue>) -> CaseAutotestBinding {
    CaseAutotestBinding {
        schema_version: 2,
        id: "22222222-2222-4222-8222-000000000001".into(),
        case_id: "C1".into(),
        autotest_id: autotest_id.into(),
        revision: "rev-1".into(),
        enabled: true,
        argument_overrides: overrides,
    }
}
fn environment(id: &str, revision: &str, archived: bool) -> EnvironmentEntry {
    let mut values = BTreeMap::new();
    values.insert(
        "baseUrl".to_owned(),
        Primitive::Text("https://stage.example".into()),
    );
    EnvironmentEntry {
        id: id.into(),
        kind: EnvironmentKind::Environment,
        title: "Stage".into(),
        description: String::new(),
        archived,
        revision: revision.into(),
        values,
    }
}
fn environment_reference(entry_id: &str, key: &str) -> ArgumentValue {
    ArgumentValue {
        kind: ValueSource::Environment,
        value: None,
        entry_id: Some(entry_id.into()),
        key: Some(key.into()),
    }
}
fn literal(value: &str) -> ArgumentValue {
    ArgumentValue::literal(Primitive::Text(value.into()))
}
fn input(
    test: &Autotest,
    binding: &CaseAutotestBinding,
    run_overrides: BTreeMap<String, ArgumentValue>,
    environments: Vec<EnvironmentEntry>,
) -> InvocationInput {
    InvocationInput {
        invocation_id: uuid::Uuid::new_v4().to_string(),
        created_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        case_revision: "case-rev-1".into(),
        autotest: test.clone(),
        binding: binding.clone(),
        run_overrides,
        environments,
    }
}
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
    /// Каталог, привязка и окружение, достаточные для запуска одного invocation.
    fn catalog(&self) -> AutomationView {
        let test = autotest();
        let view = self
            .service
            .save_autotest(&self.session, &self.view().revision, &test, "rev-1")
            .unwrap();
        let mut overrides = BTreeMap::new();
        overrides.insert(
            "baseUrl".to_owned(),
            environment_reference("33333333-3333-4333-8333-000000000001", "baseUrl"),
        );
        let view = self
            .service
            .save_binding(
                &self.session,
                &view.revision,
                &binding(&test.id, overrides),
                "rev-1",
            )
            .unwrap();
        self.service
            .save_environments(
                &self.session,
                &view.revision,
                vec![environment(
                    "33333333-3333-4333-8333-000000000001",
                    "env-1",
                    false,
                )],
            )
            .unwrap()
    }
    fn view(&self) -> AutomationView {
        self.service.read(&self.session).unwrap()
    }
    fn request() -> InvocationRequest {
        InvocationRequest {
            binding_id: "22222222-2222-4222-8222-000000000001".into(),
            run_overrides: BTreeMap::new(),
        }
    }
    fn start(
        &self,
        p: &ProfileView,
        operation: Operation,
        catalog: Option<&ExecutionSummary>,
    ) -> ExecutionSummary {
        let preview = if operation == Operation::Run {
            self.service
                .preview(&self.session, &self.run, &[Self::request()])
                .unwrap()
                .snapshots
        } else {
            vec![]
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
                    invocations: if operation == Operation::Run {
                        vec![Self::request()]
                    } else {
                        vec![]
                    },
                    parent_execution_id: None,
                    preview,
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
fn manifest_serialization_matches_the_browser_safe_runner_schema() {
    let test = autotest();
    let mut overrides = BTreeMap::new();
    overrides.insert(
        "baseUrl".to_owned(),
        environment_reference("33333333-3333-4333-8333-000000000001", "baseUrl"),
    );
    let snapshot = create_invocation_snapshot(&input(
        &test,
        &binding(&test.id, overrides),
        BTreeMap::new(),
        vec![environment(
            "33333333-3333-4333-8333-000000000001",
            "env-1",
            false,
        )],
    ))
    .unwrap();
    let manifest = Manifest {
        schema_version: 2,
        run_id: ".casewright/runs/example".into(),
        execution_id: uuid::Uuid::new_v4().to_string(),
        parent_execution_id: None,
        profile_id: "local".into(),
        profile_revision: "a".repeat(64),
        catalog_revision: Some("b".repeat(64)),
        created_at: "2026-10-18T00:00:00.000Z".into(),
        source: Source {
            commit: None,
            branch: Some("main".into()),
            dirty: false,
        },
        invocations: vec![snapshot],
        operation: Operation::Run,
        profile: Fixture::profile(5000),
        output_root: "C:/temporary/execution".into(),
        source_kind: SourceKind::Run,
    };
    let value = serde_json::to_value(&manifest).unwrap();
    let keys = value
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect::<BTreeSet<_>>();
    assert_eq!(
        keys,
        [
            "catalogRevision",
            "createdAt",
            "executionId",
            "invocations",
            "operation",
            "outputRoot",
            "parentExecutionId",
            "profile",
            "profileId",
            "profileRevision",
            "runId",
            "schemaVersion",
            "source",
            "sourceKind",
        ]
        .into_iter()
        .map(str::to_owned)
        .collect::<BTreeSet<_>>()
    );
    let invocation = &value["invocations"][0];
    for key in [
        "schemaVersion",
        "invocationId",
        "createdAt",
        "caseRevision",
        "autotest",
        "binding",
        "runOverrides",
        "environments",
        "resolvedArguments",
        "sources",
    ] {
        assert!(invocation.get(key).is_some(), "invocation must carry {key}");
    }
    let source = &invocation["sources"][0];
    assert!(
        source.get("reference").is_some() && source.get("revision").is_some(),
        "source must carry nullable reference/revision"
    );
    assert_eq!(source["reference"]["kind"], "environment");
    assert_eq!(
        invocation["resolvedArguments"]["baseUrl"],
        "https://stage.example"
    );
}
#[test]
fn bridge_version_two_report_fixture_passes_independent_validation() {
    let report: Report = serde_json::from_slice(include_bytes!(
        "../../../../../../tools/playwright-automation/fixtures/report-v2.json"
    ))
    .unwrap();
    report.validate_shape().unwrap();
    assert_eq!(report.state, State::Completed);
    assert_eq!(report.tests.len(), 3);
    assert!(
        report
            .tests
            .iter()
            .all(|test| super::contracts::uuid(&test.invocation_id))
    );
}
#[test]
fn argument_resolution_priority_and_typed_issues() {
    let mut test = autotest();
    test.argument_definitions[0].default = Some(Primitive::Text("https://default.example".into()));
    let mut test_defaults = BTreeMap::new();
    test_defaults.insert("baseUrl".to_owned(), literal("https://autotest.example"));
    test.defaults = test_defaults;
    let mut binding_overrides = BTreeMap::new();
    binding_overrides.insert("baseUrl".to_owned(), literal("https://binding.example"));
    let base = binding(&test.id, binding_overrides);

    // Слой привязки перекрывает автотест, запуск перекрывает привязку.
    let snapshot =
        create_invocation_snapshot(&input(&test, &base, BTreeMap::new(), vec![])).unwrap();
    assert_eq!(snapshot.sources[0].layer, Layer::Binding);
    let mut run_overrides = BTreeMap::new();
    run_overrides.insert("baseUrl".to_owned(), literal("https://run.example"));
    let snapshot = create_invocation_snapshot(&input(&test, &base, run_overrides, vec![])).unwrap();
    assert_eq!(snapshot.sources[0].layer, Layer::Run);
    assert_eq!(
        snapshot.resolved_arguments.get("baseUrl"),
        Some(&Primitive::Text("https://run.example".into()))
    );

    // Явная ссылка на окружение подставляет значение и фиксирует ревизию записи.
    let mut environment_binding = binding(&test.id, BTreeMap::new());
    environment_binding.argument_overrides.insert(
        "baseUrl".to_owned(),
        environment_reference("33333333-3333-4333-8333-000000000001", "baseUrl"),
    );
    let snapshot = create_invocation_snapshot(&input(
        &test,
        &environment_binding,
        BTreeMap::new(),
        vec![environment(
            "33333333-3333-4333-8333-000000000001",
            "env-7",
            false,
        )],
    ))
    .unwrap();
    assert_eq!(snapshot.environments.len(), 1);
    assert_eq!(snapshot.sources[0].revision.as_deref(), Some("env-7"));

    // Архивное окружение, неизвестный аргумент, обязательное значение и неверный формат.
    let archived = create_invocation_snapshot(&input(
        &test,
        &environment_binding,
        BTreeMap::new(),
        vec![environment(
            "33333333-3333-4333-8333-000000000001",
            "env-7",
            true,
        )],
    ))
    .unwrap_err();
    assert_eq!(archived[0].code, IssueCode::EnvironmentUnavailable);
    let mut unknown = BTreeMap::new();
    unknown.insert("nope".to_owned(), literal("1"));
    assert_eq!(
        create_invocation_snapshot(&input(&test, &base, unknown, vec![])).unwrap_err()[0].code,
        IssueCode::UnknownArgument
    );
    let mut without_default = test.clone();
    without_default.argument_definitions[0].default = None;
    without_default.defaults.clear();
    let required = create_invocation_snapshot(&input(
        &without_default,
        &binding(&without_default.id, BTreeMap::new()),
        BTreeMap::new(),
        vec![],
    ))
    .unwrap_err();
    assert_eq!(required[0].code, IssueCode::Required);
    let mut invalid = BTreeMap::new();
    invalid.insert("baseUrl".to_owned(), literal("not-a-url"));
    let invalid_binding = binding(&test.id, invalid);
    assert_eq!(
        create_invocation_snapshot(&input(&test, &invalid_binding, BTreeMap::new(), vec![]))
            .unwrap_err()[0]
            .code,
        IssueCode::InvalidValue
    );

    // Изменение источника после preview делает снимок устаревшим.
    let current = input(&test, &base, BTreeMap::new(), vec![]);
    let snapshot = create_invocation_snapshot(&current).unwrap();
    validate_invocation_preview(&snapshot, &current).unwrap();
    let mut changed = test.clone();
    changed.revision = "rev-2".into();
    let stale = input(&changed, &base, BTreeMap::new(), vec![]);
    assert_eq!(
        validate_invocation_preview(&snapshot, &stale).unwrap_err()[0].code,
        IssueCode::Stale
    );
}
#[test]
fn report_and_manifest_contracts_are_strict() {
    let test = autotest();
    let mut overrides = BTreeMap::new();
    overrides.insert("baseUrl".to_owned(), literal("https://stage.example"));
    let snapshot = create_invocation_snapshot(&input(
        &test,
        &binding(&test.id, overrides),
        BTreeMap::new(),
        vec![],
    ))
    .unwrap();
    let profile = Fixture::profile(5000);
    let created = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let manifest = Manifest {
        schema_version: 2,
        run_id: ".casewright/runs/example".into(),
        execution_id: uuid::Uuid::new_v4().to_string(),
        parent_execution_id: None,
        profile_id: "local".into(),
        profile_revision: "a".repeat(64),
        catalog_revision: Some("b".repeat(64)),
        created_at: created.clone(),
        source: Source {
            commit: None,
            branch: Some("main".into()),
            dirty: false,
        },
        invocations: vec![snapshot.clone()],
        operation: Operation::Run,
        profile,
        output_root: "/tmp/output".into(),
        source_kind: SourceKind::Run,
    };
    manifest.validate().unwrap();
    let attempt = Attempt {
        retry: 0,
        repeat_each_index: 0,
        status: Status::Passed,
        started_at: Some(created.clone()),
        duration_ms: 1.0,
        errors: vec![],
        stdout: String::new(),
        stderr: String::new(),
        attachments: vec![],
    };
    let report = Report {
        schema_version: 2,
        run_id: manifest.run_id.clone(),
        execution_id: manifest.execution_id.clone(),
        parent_execution_id: None,
        profile_id: manifest.profile_id.clone(),
        profile_revision: manifest.profile_revision.clone(),
        catalog_revision: manifest.catalog_revision.clone(),
        created_at: created.clone(),
        source: manifest.source.clone(),
        state: State::Completed,
        reason: None,
        started_at: created.clone(),
        finished_at: created,
        complete: true,
        tests: vec![InvocationTest {
            invocation_id: snapshot.invocation_id.clone(),
            case_id: "C1".into(),
            automation_id: "A1".into(),
            project: "unit".into(),
            variant_id: "default".into(),
            title: "Кириллица".into(),
            file: "x.spec.mjs".into(),
            expected_status: Expected::Passed,
            outcome: Outcome::Expected,
            attempts: vec![attempt],
        }],
        runner_errors: vec![],
        logs: Logs {
            stdout: String::new(),
            stderr: String::new(),
            truncated: false,
        },
        attachments: vec![],
    };
    report.validate(&manifest).unwrap();
    // Чужой executionId и неизвестный invocation не принимаются.
    let mut broken = report.clone();
    broken.execution_id = uuid::Uuid::new_v4().to_string();
    assert!(broken.validate(&manifest).is_err());
    let mut broken = report.clone();
    broken.tests[0].invocation_id = uuid::Uuid::new_v4().to_string();
    assert!(broken.validate(&manifest).is_err());
    // Импорт без discovery-каталога допустим только с sourceKind=import.
    let mut imported = manifest.clone();
    imported.catalog_revision = None;
    assert!(imported.validate().is_err());
    imported.source_kind = SourceKind::Import;
    imported.validate().unwrap();
    // Лишнее поле в JSON отвергается строгим разбором.
    let mut raw = serde_json::to_value(&manifest).unwrap();
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
                invocations: vec![],
                parent_execution_id: None,
                preview: vec![],
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
fn catalog_crud_keeps_revisions_duplicates_and_archives_consistent() {
    let f = Fixture::new();
    let test = autotest();
    let view = f.view();
    let view = f
        .service
        .save_autotest(&f.session, &view.revision, &test, "rev-1")
        .unwrap();
    assert_eq!(view.autotests.len(), 1);
    // Устаревшая ревизия отвергается, повторное сохранение той же ревизии — нет.
    assert_eq!(
        f.service
            .save_autotest(&f.session, "deadbeef", &test, "rev-2")
            .unwrap_err()
            .code,
        Code::StaleResource
    );
    let mut overrides = BTreeMap::new();
    overrides.insert("baseUrl".to_owned(), literal("https://stage.example"));
    let view = f
        .service
        .save_binding(
            &f.session,
            &view.revision,
            &binding(&test.id, overrides.clone()),
            "rev-1",
        )
        .unwrap();
    assert_eq!(view.bindings.len(), 1);
    // Дубликат «тот же кейс + тот же автотест + те же значения» отвергается.
    let mut duplicate = binding(&test.id, overrides);
    duplicate.id = "44444444-4444-4444-8444-000000000004".into();
    assert_eq!(
        f.service
            .save_binding(&f.session, &view.revision, &duplicate, "rev-1")
            .unwrap_err()
            .code,
        Code::InvalidRequest
    );
    let view = f
        .service
        .archive_autotest(&f.session, &view.revision, &test.id, true, "rev-2")
        .unwrap();
    assert!(view.autotests[0].archived);
    // Архивный автотест нельзя запустить, но снимок читается.
    let request = InvocationRequest {
        binding_id: view.bindings[0].id.clone(),
        run_overrides: BTreeMap::new(),
    };
    let preview = f.service.preview(&f.session, &f.run, &[request]).unwrap();
    assert_eq!(preview.issues[0].code, IssueCode::Unavailable);
    let view = f
        .service
        .archive_autotest(&f.session, &view.revision, &test.id, false, "rev-3")
        .unwrap();
    // Удаление автотеста удаляет и его привязки.
    let view = f
        .service
        .delete_autotest(&f.session, &view.revision, &test.id)
        .unwrap();
    assert!(view.autotests.is_empty() && view.bindings.is_empty());
}
#[test]
fn real_node_discover_run_persistence_and_bounded_poll() {
    let f = Fixture::new();
    fs::write(f.root().join("playwright.config.mjs"), "large").unwrap();
    let p = f.trusted(5000);
    let view = f.catalog();
    assert_eq!(view.autotests.len(), 1);
    assert_eq!(view.environments.len(), 1);
    let d = f.start(&p, Operation::Discover, None);
    let discovery = f.wait(&d.execution_id);
    assert_eq!(discovery.execution.state, State::Completed);
    assert_eq!(discovery.catalog.unwrap().tests.len(), 1);
    let r = f.start(&p, Operation::Run, Some(&d));
    let result = f.wait(&r.execution_id);
    assert_eq!(result.execution.state, State::Completed);
    assert_eq!(result.tests.len(), 1);
    // Снимок аргументов опубликован рядом со строкой результата того же invocation.
    assert_eq!(result.invocations.len(), 1);
    assert_eq!(
        result.invocations[0].resolved_arguments.get("baseUrl"),
        Some(&Primitive::Text("https://stage.example".into()))
    );
    assert_eq!(
        result.tests[0].invocation_id,
        result.invocations[0].invocation_id
    );
    assert!(result.tests[0].title.contains("https://stage.example"));
    assert!(result.details_truncated);
    assert!(result.tests[0].attempts[0].stdout.len() < 100);
    assert!(serde_json::to_vec(&result).unwrap().len() < 256 * 1024);
    let history = f.service.read(&f.session).unwrap().history;
    assert_eq!(history.len(), 2);
    assert!(history.iter().all(|e| e.state == State::Completed));
    // Отчёты публикуются в папку прогона, повторный вызов идемпотентен, Git index не меняется.
    let saved = f
        .service
        .save_reports(&f.session, &f.run, &r.execution_id)
        .unwrap();
    assert_eq!(saved.len(), 2);
    assert!(saved.iter().all(|item| item.sha256.len() == 64));
    assert_eq!(
        f.service
            .save_reports(&f.session, &f.run, &r.execution_id)
            .unwrap()
            .len(),
        2
    );
    assert!(
        f.root()
            .join(format!("{}/automation/{}", f.run, r.execution_id))
            .is_dir()
    );
    let index = Command::new("git")
        .args(["diff", "--cached", "--name-only"])
        .current_dir(f.root())
        .output()
        .unwrap();
    assert!(index.stdout.is_empty());
    assert!(
        fs::read_to_string(f.root().join(".casewright/runs/example/001-C1.md"))
            .unwrap()
            .contains("result: pass")
    );
    f.service.shutdown().unwrap();
}
#[test]
fn run_requires_fresh_preview_and_discovery_catalog() {
    let f = Fixture::new();
    let p = f.trusted(5000);
    f.catalog();
    let d = f.start(&p, Operation::Discover, None);
    f.wait(&d.execution_id);
    // Запуск без ссылки на discovery отвергается.
    assert_eq!(
        f.service
            .start(
                &f.session,
                Start {
                    profile_id: "local".into(),
                    profile_revision: p.revision.clone(),
                    run_id: f.run.clone(),
                    operation: Operation::Run,
                    catalog_execution_id: None,
                    catalog_revision: None,
                    invocations: vec![Fixture::request()],
                    parent_execution_id: None,
                    preview: vec![],
                },
            )
            .unwrap_err()
            .code,
        Code::StaleProfile
    );
    // Устаревший preview (изменённое окружение) блокирует старт.
    let stale = f
        .service
        .preview(&f.session, &f.run, &[Fixture::request()])
        .unwrap()
        .snapshots;
    let view = f.view();
    let mut updated = view.environments.clone();
    updated[0].revision = "env-2".into();
    f.service
        .save_environments(&f.session, &view.revision, updated)
        .unwrap();
    assert_eq!(
        f.service
            .start(
                &f.session,
                Start {
                    profile_id: "local".into(),
                    profile_revision: p.revision.clone(),
                    run_id: f.run.clone(),
                    operation: Operation::Run,
                    catalog_execution_id: Some(d.execution_id.clone()),
                    catalog_revision: Some("b".repeat(64)),
                    invocations: vec![Fixture::request()],
                    parent_execution_id: None,
                    preview: stale,
                },
            )
            .unwrap_err()
            .code,
        Code::StaleProfile
    );
    // Свежий preview запускается и завершается.
    let r = f.start(&p, Operation::Run, Some(&d));
    assert_eq!(f.wait(&r.execution_id).execution.state, State::Completed);
    f.service.shutdown().unwrap();
}
#[test]
fn import_preview_is_passive_and_apply_is_idempotent() {
    let f = Fixture::new();
    f.trusted(5000);
    f.catalog();
    let source = serde_json::json!({
        "schemaVersion": 1,
        "runId": f.run,
        "executionId": uuid::Uuid::new_v4().to_string(),
        "parentExecutionId": null,
        "profileId": "local",
        "profileRevision": "a".repeat(64),
        "catalogRevision": null,
        "createdAt": "2026-10-18T10:00:00.000Z",
        "source": { "commit": null, "branch": "main", "dirty": false },
        "selection": [{ "caseId": "C1", "automationId": "A1", "project": "unit", "variantId": "default" }],
        "state": "completed",
        "reason": null,
        "startedAt": "2026-10-18T10:00:00.000Z",
        "finishedAt": "2026-10-18T10:00:05.000Z",
        "complete": true,
        "tests": [{
            "caseId": "C1", "automationId": "A1", "project": "unit", "variantId": "default",
            "title": "Оплата картой", "file": "x.spec.mjs", "expectedStatus": "passed", "outcome": "expected",
            "attempts": [{ "retry": 0, "repeatEachIndex": 0, "status": "passed", "startedAt": "2026-10-18T10:00:00.000Z", "durationMs": 12.0, "errors": [], "stdout": "", "stderr": "", "attachments": [] }]
        }],
        "runnerErrors": [],
        "logs": { "stdout": "", "stderr": "", "truncated": false },
        "attachments": []
    })
    .to_string();
    let before = fs::read(f.root().join(".casewright/runs/example/001-C1.md")).unwrap();
    let preview = f
        .service
        .preview_import(&f.session, &f.run, &source)
        .unwrap();
    assert_eq!(preview.matched, 1);
    assert_eq!(preview.rows[0].status, super::import::RowStatus::Matched);
    assert!(!preview.duplicate_import);
    // Предпросмотр ничего не записал.
    assert_eq!(
        fs::read(f.root().join(".casewright/runs/example/001-C1.md")).unwrap(),
        before
    );
    let view = f.view();
    let summary = f
        .service
        .apply_import(&f.session, &f.run, &source, &view.revision)
        .unwrap();
    assert_eq!(summary.state, State::Completed);
    let polled = f
        .service
        .poll(&f.session, &f.run, &summary.execution_id, 0)
        .unwrap();
    assert_eq!(polled.tests.len(), 1);
    assert_eq!(polled.invocations.len(), 1);
    // Повторный импорт того же источника отвергается, ручные файлы не изменились.
    let view = f.view();
    assert_eq!(
        f.service
            .apply_import(&f.session, &f.run, &source, &view.revision)
            .unwrap_err()
            .code,
        Code::InvalidRequest
    );
    assert_eq!(
        fs::read(f.root().join(".casewright/runs/example/001-C1.md")).unwrap(),
        before
    );
    // Чужой ключ остаётся несопоставленным.
    let foreign = source.replace("\"A1\"", "\"A2\"");
    let preview = f
        .service
        .preview_import(&f.session, &f.run, &foreign)
        .unwrap();
    assert_eq!(preview.rows[0].status, super::import::RowStatus::Unmatched);
    assert_eq!(preview.matched, 0);
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
                    invocations: vec![],
                    parent_execution_id: None,
                    preview: vec![],
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
