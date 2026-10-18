use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use sha2::{Digest, Sha256};
use tempfile::TempDir;

use super::git::find_git_executable;
use super::*;

const CONFIG: &str = "version: 1\nname: Root QA\ndisplayIdPrefix: RT\ndescription: Root workspace\nworkspaces:\n  - .\n  - ./\n  - areas/Payments QA/\n  - areas/Payments QA\n  - missing-workspace\n  - ../escape\n  - /\n  - ////\n";

fn fixture() -> TempDir {
    let temp = tempfile::tempdir().expect("temporary fixture root");
    let root = temp.path();
    git(root, &["init", "--initial-branch=main"]);
    write(root, ".casewright/config.yaml", CONFIG);
    write(
        root,
        "areas/Payments QA.md",
        "---\nname: Payments QA\ndisplayIdPrefix: PAY\ncustom: keep\n---\n\nBilling and payments.\n",
    );
    write(
        root,
        "areas/Payments QA/PAY-0042-reset.md",
        "---\nid: stable-case-id\ntitle: Reset password\nstatus: draft\n---\n\n## Steps\n\n- Enter token\n",
    );
    write(
        root,
        "areas/Payments QA/.order",
        "PAY-0042-reset\nBilling\n",
    );
    write(
        root,
        ".casewright/runs/2026-06-09-regression/_run.md",
        "---\nname: Regression\nstatus: open\n---\n\n## Summary\n\nRun summary.\n",
    );
    write(
        root,
        ".casewright/runs/2026-06-09-regression/001-stable-case-id.md",
        "---\ncase_id: stable-case-id\nresult: pass\n---\n\n## Steps\n\n- [x] Enter token\n",
    );
    git(root, &["add", "--", "."]);
    temp
}

fn write(root: &Path, relative: &str, text: &str) {
    let path = root.join(relative);
    fs::create_dir_all(path.parent().expect("parent")).expect("create fixture directory");
    fs::write(path, text).expect("write fixture file");
}

fn git(root: &Path, args: &[&str]) {
    let output = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .expect("Git CLI available");
    assert!(
        output.status.success(),
        "git {:?} failed: {}",
        args,
        String::from_utf8_lossy(&output.stderr)
    );
}

fn content_hashes(root: &Path) -> BTreeMap<PathBuf, String> {
    fn visit(root: &Path, dir: &Path, hashes: &mut BTreeMap<PathBuf, String>) {
        for entry in fs::read_dir(dir).expect("list fixture") {
            let entry = entry.expect("fixture entry");
            if entry.file_name() == ".git" {
                continue;
            }
            let path = entry.path();
            if entry.file_type().expect("entry type").is_dir() {
                visit(root, &path, hashes);
            } else {
                let relative = path.strip_prefix(root).expect("within fixture").to_owned();
                let digest = Sha256::digest(fs::read(&path).expect("hash file"));
                hashes.insert(relative, format!("{digest:x}"));
            }
        }
    }
    let mut hashes = BTreeMap::new();
    visit(root, root, &mut hashes);
    hashes
}

fn git_metadata_hashes(root: &Path) -> BTreeMap<PathBuf, String> {
    [".git/config", ".git/index"]
        .into_iter()
        .filter_map(|relative| {
            let path = root.join(relative);
            fs::read(&path).ok().map(|bytes| {
                (
                    PathBuf::from(relative),
                    format!("{:x}", Sha256::digest(bytes)),
                )
            })
        })
        .collect()
}

#[test]
fn opens_canonical_git_root_reads_workspace_metadata_and_never_changes_files() {
    let temp = fixture();
    let before = content_hashes(temp.path());
    let git_before = git_metadata_hashes(temp.path());
    assert!(git_before.contains_key(Path::new(".git/index")));
    let service = RepositoryService::default();
    let opened = service.open(temp.path()).expect("open fixture repo");
    assert_eq!(
        uuid::Uuid::parse_str(&opened.session_id)
            .expect("opaque session UUID")
            .get_version_num(),
        4
    );

    assert!(!opened.needs_initialization);
    assert_eq!(opened.display_name, "Root QA");
    assert_eq!(opened.workspaces.len(), 2);
    assert_eq!(opened.workspaces[0].path, "");
    let payments = opened
        .workspaces
        .iter()
        .find(|workspace| workspace.path == "areas/Payments QA")
        .expect("normalized workspace");
    assert_eq!(payments.name, "Payments QA");
    assert_eq!(payments.display_id_prefix, "PAY");
    assert_eq!(payments.description, "Billing and payments.");
    assert!(
        opened
            .warnings
            .iter()
            .any(|warning| warning.code == RepositoryWarningCode::DuplicateWorkspace)
    );
    assert!(
        opened
            .warnings
            .iter()
            .any(|warning| warning.code == RepositoryWarningCode::MissingWorkspace)
    );
    assert!(
        opened
            .warnings
            .iter()
            .any(|warning| warning.code == RepositoryWarningCode::InvalidWorkspacePath)
    );
    assert!(
        opened
            .warnings
            .iter()
            .filter(|warning| warning.code == RepositoryWarningCode::InvalidWorkspacePath)
            .count()
            >= 3
    );

    assert_eq!(
        service
            .read_text(&opened.session_id, "areas/Payments QA/PAY-0042-reset.md")
            .expect("bounded case read"),
        "---\nid: stable-case-id\ntitle: Reset password\nstatus: draft\n---\n\n## Steps\n\n- Enter token\n"
    );
    assert!(
        service
            .read_text(
                &opened.session_id,
                ".casewright/runs/2026-06-09-regression/_run.md"
            )
            .is_ok()
    );
    assert!(
        service
            .read_text(&opened.session_id, "areas/Payments QA/.order")
            .is_ok()
    );
    assert_eq!(content_hashes(temp.path()), before);
    assert_eq!(git_metadata_hashes(temp.path()), git_before);
}

#[test]
#[allow(clippy::too_many_lines)] // Keeps the repository catalog/read contract in one fixture flow.
fn workspace_catalog_registers_opaque_case_resources_and_selected_reads_are_scoped() {
    let temp = fixture();
    fs::create_dir_all(temp.path().join("areas/Payments QA/Billing")).expect("nested folder");
    write(
        temp.path(),
        "areas/Payments QA/Billing.md",
        "---\nname: Billing\ndisplayIdPrefix: BILL\n---\n\nBilling notes.\n",
    );
    write(
        temp.path(),
        "areas/Payments QA/nested.md",
        "---\nid: stable-case-id\ntitle: Duplicate identity\n---\n\n## Steps\n\n- Keep body\n",
    );
    write(
        temp.path(),
        "areas/Payments QA/.hidden-case.md",
        "---\nid: hidden-case\ntitle: Hidden markdown remains visible\nstatus: invented\n---\n",
    );
    write(
        temp.path(),
        "areas/Payments QA/.hidden-dir/ignored.md",
        "---\nid: ignored\ntitle: Hidden directory\n---\n",
    );
    git(temp.path(), &["add", "--", "."]);
    let service = RepositoryService::default();
    let opened = service.open(temp.path()).expect("open fixture repo");
    let before = content_hashes(temp.path());
    let git_before = git_metadata_hashes(temp.path());
    let catalog = service
        .catalog_workspace(&opened.session_id, "areas/Payments QA")
        .expect("catalog declared workspace");
    let cases: Vec<_> = catalog
        .entries
        .iter()
        .filter_map(|entry| match entry {
            CatalogEntryDto::Case {
                resource_id, path, ..
            } => Some((resource_id, path)),
            CatalogEntryDto::Folder { .. } => None,
        })
        .collect();
    assert_eq!(cases.len(), 3);
    assert!(
        cases
            .iter()
            .any(|(_, path)| path.ends_with(".hidden-case.md"))
    );
    assert!(!catalog.entries.iter().any(|entry| match entry {
        CatalogEntryDto::Case { path, .. } => path.contains(".hidden-dir"),
        CatalogEntryDto::Folder { .. } => false,
    }));
    assert!(
        matches!(catalog.entries.first(), Some(CatalogEntryDto::Case { path, order: 0, .. }) if path.ends_with("PAY-0042-reset.md"))
    );
    assert!(catalog.entries.iter().any(|entry| matches!(entry, CatalogEntryDto::Folder { path, name, description, .. } if path == "areas/Payments QA/Billing" && name == "Billing" && description == "Billing notes.")));
    assert!(
        catalog
            .warnings
            .iter()
            .any(|warning| warning.code == RepositoryWarningCode::DuplicateCaseId)
    );
    let hidden_json = serde_json::to_value(catalog.entries.iter().find(|entry| matches!(entry, CatalogEntryDto::Case { path, .. } if path.ends_with(".hidden-case.md"))).unwrap()).unwrap();
    assert!(hidden_json["metadata"]["resourceId"].as_str().is_some());
    assert_eq!(
        hidden_json["metadata"]["parentResourceId"],
        serde_json::Value::Null
    );
    assert!(
        catalog
            .warnings
            .iter()
            .any(
                |warning| warning.path.as_deref() == Some("areas/Payments QA/.hidden-case.md")
                    && warning.resource_id.is_some()
            )
    );
    let resource_id = cases
        .iter()
        .find(|(_, path)| path.ends_with("PAY-0042-reset.md"))
        .unwrap()
        .0;
    let document = service
        .read_case(&opened.session_id, resource_id)
        .expect("read listed case");
    assert_eq!(document.model.id.as_deref(), Some("stable-case-id"));
    assert_eq!(document.model.title, "Reset password");
    assert!(document.warnings.is_empty());
    let response_json = serde_json::to_value(&document).unwrap();
    assert!(response_json["model"].is_object());
    assert!(response_json["warnings"].is_array());

    let other = RepositoryService::default();
    let other_opened = other.open(temp.path()).expect("other service session");
    assert_eq!(
        other
            .read_case(&other_opened.session_id, resource_id)
            .unwrap_err()
            .code,
        RepositoryErrorCode::InvalidResource
    );
    assert_eq!(
        service
            .catalog_workspace(&opened.session_id, "../")
            .unwrap_err()
            .code,
        RepositoryErrorCode::InvalidRelativePath
    );
    assert_eq!(
        service
            .read_case(&opened.session_id, "../../secret.md")
            .unwrap_err()
            .code,
        RepositoryErrorCode::InvalidResource
    );
    assert_eq!(content_hashes(temp.path()), before);
    assert_eq!(git_metadata_hashes(temp.path()), git_before);

    let root_catalog = service
        .catalog_workspace(&opened.session_id, "")
        .expect("root traversal follows source workspace behavior");
    assert!(root_catalog.entries.iter().any(|entry| matches!(entry, CatalogEntryDto::Case { path, .. } if path == "areas/Payments QA/PAY-0042-reset.md")));
    assert!(
        service.read_case(&opened.session_id, resource_id).is_ok(),
        "catalog refresh preserves IDs carried by pending requests"
    );
}

#[test]
fn run_catalog_registers_details_and_sidecars_with_order_and_read_only_hashes() {
    let temp = fixture();
    write(
        temp.path(),
        ".casewright/runs/2026-06-09-regression/.order",
        "x.md\n001-stable-case-id\nunknown\n",
    );
    write(
        temp.path(),
        ".casewright/runs/2026-06-09-regression/x.md.md",
        "---\ncase_id: repeated-extension\nresult: skipped\n---\n",
    );
    write(
        temp.path(),
        ".casewright/runs/abcd-ef-gh-run/_run.md",
        "---\nname: No date\n---\n",
    );
    git(temp.path(), &["add", "--", "."]);
    let before = content_hashes(temp.path());
    let git_before = git_metadata_hashes(temp.path());
    let service = RepositoryService::default();
    let opened = service.open(temp.path()).expect("open fixture repo");
    let catalog = service
        .catalog_runs(&opened.session_id)
        .expect("catalog runs");
    assert_eq!(catalog.runs.len(), 2);
    let run = catalog
        .runs
        .iter()
        .find(|run| run.name == "Regression")
        .unwrap();
    assert_eq!(run.name, "Regression");
    assert_eq!(run.created, "2026-06-09");
    assert_eq!(run.test_date, "2026-06-09");
    assert_eq!(run.cases.len(), 2);
    assert!(
        run.cases[0].path.ends_with("x.md.md"),
        ".order stem removes exactly one .md suffix"
    );
    assert_eq!(run.cases[0].case_id, "repeated-extension");
    assert_eq!(
        run.cases[0].result,
        crate::domain::formats::RunResult::Skipped
    );
    let details_id = run
        .details_resource_id
        .as_deref()
        .expect("details resource");
    assert!(
        matches!(service.read_run(&opened.session_id, details_id).unwrap(), RunResourceDocumentDto::Details { model, .. } if model.summary == "Run summary.")
    );
    let stable_case = run
        .cases
        .iter()
        .find(|item| item.case_id == "stable-case-id")
        .unwrap();
    let case_id = &stable_case.resource_id;
    assert!(
        matches!(service.read_run(&opened.session_id, case_id).unwrap(), RunResourceDocumentDto::Case { model, .. } if model.case_id == "stable-case-id")
    );
    assert_eq!(
        service
            .read_case(&opened.session_id, case_id)
            .unwrap_err()
            .code,
        RepositoryErrorCode::InvalidResource
    );
    assert_eq!(
        service
            .read_run(&opened.session_id, "../../outside.md")
            .unwrap_err()
            .code,
        RepositoryErrorCode::InvalidResource
    );
    let other = RepositoryService::default();
    let other_opened = other.open(temp.path()).expect("second repository service");
    assert_eq!(
        other
            .read_run(&other_opened.session_id, details_id)
            .unwrap_err()
            .code,
        RepositoryErrorCode::InvalidResource
    );
    assert_eq!(content_hashes(temp.path()), before);
    assert_eq!(git_metadata_hashes(temp.path()), git_before);
    let no_date = catalog
        .runs
        .iter()
        .find(|run| run.name == "No date")
        .unwrap();
    assert_eq!(
        no_date.created, "",
        "run folder only supplies a date when its prefix matches YYYY-MM-DD"
    );
}

#[test]
fn empty_runs_refresh_invalidates_previously_registered_run_resources() {
    let temp = fixture();
    write(
        temp.path(),
        ".casewright/runs/2026-06-09-regression/_run.md",
        "---\nname: Regression\n---\n",
    );
    write(
        temp.path(),
        ".casewright/runs/2026-06-09-regression/001-case.md",
        "---\ncase_id: stable-case-id\n---\n",
    );
    git(temp.path(), &["add", "--", "."]);
    let service = RepositoryService::default();
    let opened = service.open(temp.path()).expect("open fixture");
    let catalog = service
        .catalog_runs(&opened.session_id)
        .expect("initial runs");
    let details = catalog.runs[0]
        .details_resource_id
        .as_ref()
        .expect("details resource")
        .clone();
    let sidecar = catalog.runs[0].cases[0].resource_id.clone();

    fs::rename(
        temp.path().join(".casewright/runs"),
        temp.path().join(".casewright/runs-disabled"),
    )
    .expect("remove runs root from catalog scope");
    assert!(
        service
            .catalog_runs(&opened.session_id)
            .expect("empty refreshed runs")
            .runs
            .is_empty()
    );
    assert_eq!(
        service
            .read_run(&opened.session_id, &details)
            .unwrap_err()
            .code,
        RepositoryErrorCode::InvalidResource
    );
    assert_eq!(
        service
            .read_run(&opened.session_id, &sidecar)
            .unwrap_err()
            .code,
        RepositoryErrorCode::InvalidResource
    );
}

#[test]
fn small_catalog_budget_helpers_stop_before_crossing_limits() {
    assert!(super::entry_budget_allows(0, 2));
    assert!(super::entry_budget_allows(1, 2));
    assert!(!super::entry_budget_allows(2, 2));
    assert!(super::read_budget_allows(3, 4, 7));
    assert!(!super::read_budget_allows(3, 5, 7));
    assert!(!super::read_budget_allows(usize::MAX, 1, usize::MAX));
}

#[test]
fn catalog_read_stops_at_small_total_budget_and_reports_the_limit_once() {
    let temp = tempfile::tempdir().expect("temporary catalog files");
    let first = temp.path().join("first.md");
    let second = temp.path().join("second.md");
    fs::write(&first, "123").expect("first file");
    fs::write(&second, "456").expect("second file");
    let mut total = 0;
    let mut warnings = Vec::new();
    let mut stopped = false;
    let mut reported = false;
    assert_eq!(
        super::catalog_read_with_limit(
            &first,
            "first.md",
            8,
            3,
            &mut total,
            &mut warnings,
            &mut stopped,
            &mut reported
        )
        .unwrap(),
        "123"
    );
    assert!(
        super::catalog_read_with_limit(
            &second,
            "second.md",
            8,
            3,
            &mut total,
            &mut warnings,
            &mut stopped,
            &mut reported
        )
        .is_err()
    );
    assert!(stopped);
    assert_eq!(warnings.len(), 1);
    assert_eq!(warnings[0].code, RepositoryWarningCode::CatalogLimit);
    assert_eq!(warnings[0].path, None);
    assert!(
        super::catalog_read_with_limit(
            &first,
            "first.md",
            8,
            3,
            &mut total,
            &mut warnings,
            &mut stopped,
            &mut reported
        )
        .is_err()
    );
    assert_eq!(warnings.len(), 1, "stopped catalogs report the cap once");
}

#[test]
fn workspace_catalog_orders_mixed_case_names_deterministically_without_misclassifying_dirs() {
    let temp = fixture();
    fs::create_dir_all(temp.path().join("areas/Payments QA/Zulu")).expect("directory");
    write(
        temp.path(),
        "areas/Payments QA/alpha.md",
        "---\nid: alpha\ntitle: Alpha\n---\n",
    );
    write(
        temp.path(),
        "areas/Payments QA/Zulu.md",
        "---\nname: Zulu\n---\nZulu notes.\n",
    );
    git(temp.path(), &["add", "--", "."]);
    let service = RepositoryService::default();
    let opened = service.open(temp.path()).expect("open repository");
    let catalog = service
        .catalog_workspace(&opened.session_id, "areas/Payments QA")
        .expect("catalog workspace");
    assert!(catalog.entries.iter().any(
        |entry| matches!(entry, CatalogEntryDto::Case { path, .. } if path.ends_with("alpha.md"))
    ));
    assert!(catalog.entries.iter().any(
        |entry| matches!(entry, CatalogEntryDto::Folder { path, .. } if path.ends_with("/Zulu"))
    ));
}

#[test]
fn missing_config_is_explicit_initialization_without_writes_and_same_root_reuses_session() {
    let temp = tempfile::tempdir().expect("tempdir");
    git(temp.path(), &["init", "--initial-branch=main"]);
    let service = RepositoryService::default();
    let first = service.open(temp.path()).expect("open empty git repo");
    let second = service.open(temp.path()).expect("reuse open repo");
    assert!(first.needs_initialization);
    assert_eq!(first.session_id, second.session_id);
    assert!(!temp.path().join(".casewright").exists());
    assert!(first.workspaces.is_empty());
}

#[test]
fn rejects_subdirectories_nonrepositories_and_bare_repositories() {
    let temp = fixture();
    let git_exe = find_git_executable(temp.path()).expect("absolute system git executable");
    assert!(git_exe.is_absolute());
    assert!(!git_exe.starts_with(temp.path()));
    let subdir = temp.path().join("areas");
    assert_eq!(
        RepositoryService::default().open(&subdir).unwrap_err().code,
        RepositoryErrorCode::SelectedSubdirectory
    );

    let nonrepo = tempfile::tempdir().expect("non repo");
    assert_eq!(
        RepositoryService::default()
            .open(nonrepo.path())
            .unwrap_err()
            .code,
        RepositoryErrorCode::NotGitRepository
    );

    let bare_parent = tempfile::tempdir().expect("bare parent");
    let bare = bare_parent.path().join("bare.git");
    fs::create_dir(&bare).expect("bare directory");
    git(&bare, &["init", "--bare"]);
    assert_eq!(
        RepositoryService::default().open(&bare).unwrap_err().code,
        RepositoryErrorCode::BareRepository
    );
}

#[test]
fn validates_sessions_relative_paths_utf8_and_bounded_reads() {
    let temp = fixture();
    write(temp.path(), "unicode-雪.txt", "Привет мир\n");
    fs::write(temp.path().join("invalid-utf8.txt"), [0xFF, 0xFE]).expect("invalid UTF-8 fixture");
    write(
        temp.path(),
        "oversized.txt",
        &"x".repeat(MAX_REPOSITORY_FILE_BYTES + 1),
    );
    let service = RepositoryService::default();
    let opened = service.open(temp.path()).expect("open repo");

    assert_eq!(
        service
            .read_text(&opened.session_id, "unicode-雪.txt")
            .unwrap(),
        "Привет мир\n"
    );
    for path in [
        "../outside.txt",
        "C:/outside.txt",
        "//server/share/file",
        "file.txt:stream",
        ".GIT/config",
    ] {
        assert!(
            service.read_text(&opened.session_id, path).is_err(),
            "accepted unsafe path {path}"
        );
    }
    assert_eq!(
        service
            .read_text(&opened.session_id, ".git/config")
            .unwrap_err()
            .code,
        RepositoryErrorCode::InvalidRelativePath
    );
    assert_eq!(
        service
            .read_text(&opened.session_id, "oversized.txt")
            .unwrap_err()
            .code,
        RepositoryErrorCode::FileTooLarge
    );
    assert_eq!(
        service
            .read_text(&opened.session_id, "invalid-utf8.txt")
            .unwrap_err()
            .code,
        RepositoryErrorCode::InvalidUtf8
    );
    assert_eq!(
        service
            .read_text("invalid-token", "unicode-雪.txt")
            .unwrap_err()
            .code,
        RepositoryErrorCode::InvalidSession
    );
    service.close(&opened.session_id).expect("close token");
    assert_eq!(
        service
            .read_text(&opened.session_id, "unicode-雪.txt")
            .unwrap_err()
            .code,
        RepositoryErrorCode::InvalidSession
    );
}

#[test]
fn unsupported_config_versions_and_legacy_layouts_are_diagnostics_without_migration() {
    let temp = fixture();
    write(
        temp.path(),
        ".casewright/config.yaml",
        "version: 3\nworkspaces: [.]\n",
    );
    let service = RepositoryService::default();
    assert_eq!(
        service.open(temp.path()).unwrap_err().code,
        RepositoryErrorCode::UnsupportedVersion
    );

    fs::remove_file(temp.path().join(".casewright/config.yaml")).expect("remove current config");
    write(temp.path(), ".casewright/casewright.yaml", "name: Legacy\n");
    assert_eq!(
        service.open(temp.path()).unwrap_err().code,
        RepositoryErrorCode::UnsupportedLegacyFormat
    );
    assert!(!temp.path().join(".casewright/config.yaml").exists());
}

#[test]
#[cfg(windows)]
fn rejects_symlink_escape_when_windows_can_create_junctions() {
    use std::os::windows::fs::symlink_dir;

    let temp = fixture();
    let outside = tempfile::tempdir().expect("outside dir");
    write(outside.path(), "secret.txt", "outside");
    let link = temp.path().join("linked-outside");
    if symlink_dir(outside.path(), &link).is_err() {
        let junction = Command::new("cmd.exe")
            .args(["/d", "/c", "mklink", "/J"])
            .arg(&link)
            .arg(outside.path())
            .output()
            .expect("run Windows junction command");
        assert!(
            junction.status.success(),
            "Windows denied both symlink and junction creation: {}",
            String::from_utf8_lossy(&junction.stderr)
        );
    }
    let loop_link = temp.path().join("loop-to-root");
    let loop_linked = Command::new("cmd.exe")
        .args(["/d", "/c", "mklink", "/J"])
        .arg(&loop_link)
        .arg(temp.path())
        .output()
        .expect("create a directory loop junction");
    assert!(
        loop_linked.status.success(),
        "failed to create loop junction: {}",
        String::from_utf8_lossy(&loop_linked.stderr)
    );
    let service = RepositoryService::default();
    let opened = service.open(temp.path()).expect("open fixture repo");
    assert!(
        service
            .read_text(&opened.session_id, "linked-outside/secret.txt")
            .is_err()
    );
    let catalog = service
        .catalog_workspace(&opened.session_id, "")
        .expect("catalog does not follow junctions");
    assert!(!catalog.entries.iter().any(|entry| match entry {
        CatalogEntryDto::Case { path, .. } | CatalogEntryDto::Folder { path, .. } => {
            path.starts_with("linked-outside/") || path.starts_with("loop-to-root/")
        }
    }));
    assert!(
        catalog
            .warnings
            .iter()
            .any(|warning| warning.path.as_deref() == Some("linked-outside")
                || warning.path.as_deref() == Some("loop-to-root")),
        "warnings: {:?}",
        catalog.warnings
    );
}

#[test]
#[cfg(windows)]
fn read_case_rejects_a_registered_path_whose_canonical_target_changes() {
    use std::os::windows::fs::symlink_dir;

    let temp = fixture();
    write(
        temp.path(),
        "areas/Payments QA/Nested/selected.md",
        "---\nid: selected\ntitle: Selected\n---\n",
    );
    git(temp.path(), &["add", "--", "."]);
    let service = RepositoryService::default();
    let opened = service.open(temp.path()).expect("open repository");
    let catalog = service
        .catalog_workspace(&opened.session_id, "areas/Payments QA")
        .expect("catalog workspace");
    let resource_id = catalog
        .entries
        .iter()
        .find_map(|entry| match entry {
            CatalogEntryDto::Case {
                resource_id, path, ..
            } if path.ends_with("Nested/selected.md") => Some(resource_id.clone()),
            _ => None,
        })
        .expect("case resource");
    let outside = tempfile::tempdir().expect("outside directory");
    write(
        outside.path(),
        "selected.md",
        "---\nid: selected\ntitle: outside\n---\n",
    );
    let nested = temp.path().join("areas/Payments QA/Nested");
    fs::remove_file(nested.join("selected.md")).expect("remove original case");
    fs::remove_dir(&nested).expect("remove original folder");
    if symlink_dir(outside.path(), &nested).is_err() {
        let junction = Command::new("cmd.exe")
            .args(["/d", "/c", "mklink", "/J"])
            .arg(&nested)
            .arg(outside.path())
            .output()
            .expect("create replacement junction");
        assert!(
            junction.status.success(),
            "junction creation failed: {}",
            String::from_utf8_lossy(&junction.stderr)
        );
    }
    assert_eq!(
        service
            .read_case(&opened.session_id, &resource_id)
            .unwrap_err()
            .code,
        RepositoryErrorCode::StaleResource
    );
}

#[test]
fn missing_config_still_rejects_an_escaping_casewright_directory_link() {
    use std::os::windows::fs::symlink_dir;

    let temp = tempfile::tempdir().expect("tempdir");
    git(temp.path(), &["init", "--initial-branch=main"]);
    let outside = tempfile::tempdir().expect("outside dir");
    fs::create_dir(temp.path().join(".casewright")).expect("create real folder");
    fs::remove_dir(temp.path().join(".casewright")).expect("remove real folder");
    let link = temp.path().join(".casewright");
    if symlink_dir(outside.path(), &link).is_err() {
        let junction = Command::new("cmd.exe")
            .args(["/d", "/c", "mklink", "/J"])
            .arg(&link)
            .arg(outside.path())
            .output()
            .expect("run Windows junction command");
        assert!(
            junction.status.success(),
            "junction creation failed: {}",
            String::from_utf8_lossy(&junction.stderr)
        );
    }
    assert_eq!(
        RepositoryService::default()
            .open(temp.path())
            .unwrap_err()
            .code,
        RepositoryErrorCode::PathEscapesRepository
    );
}

#[test]
fn repeated_catalog_preserves_case_folder_and_run_ids_for_pending_requests() {
    let temp = fixture();
    let service = RepositoryService::default();
    let opened = service.open(temp.path()).unwrap();
    let first = service.catalog_workspace(&opened.session_id, "").unwrap();
    let runs = service.catalog_runs(&opened.session_id).unwrap();
    assert_eq!(
        service.catalog_workspace(&opened.session_id, "").unwrap(),
        first
    );
    assert_eq!(service.catalog_runs(&opened.session_id).unwrap(), runs);
    for run in runs.runs {
        if let Some(id) = run.details_resource_id {
            assert!(service.read_run(&opened.session_id, &id).is_ok());
        }
        for case in run.cases {
            assert!(
                service
                    .read_run(&opened.session_id, &case.resource_id)
                    .is_ok()
            );
        }
    }
}

#[test]
fn metadata_refresh_preserves_resources_and_git_ownership_and_blocks_invalid_config() {
    let fixture = fixture();
    let service = RepositoryService::default();
    let opened = service.open(fixture.path()).unwrap();
    service
        .catalog_workspace(&opened.session_id, "areas/Payments QA")
        .unwrap();
    let resources = {
        let mut sessions = service.sessions.lock().unwrap();
        let session = sessions.by_id.get_mut(&opened.session_id).unwrap();
        session.git_sync_blocked = true;
        session.git_recovery = true;
        session.resources.keys().cloned().collect::<Vec<_>>()
    };
    let next = service.refresh_metadata(&opened.session_id).unwrap();
    assert_eq!(next.session_id, opened.session_id);
    {
        let sessions = service.sessions.lock().unwrap();
        let session = sessions.by_id.get(&opened.session_id).unwrap();
        assert!(session.git_recovery && session.git_sync_blocked);
        assert!(
            resources
                .iter()
                .all(|id| session.resources.contains_key(id))
        );
    }
    write(
        fixture.path(),
        ".casewright/config.yaml",
        "version: [invalid",
    );
    assert_eq!(
        service
            .refresh_metadata(&opened.session_id)
            .unwrap_err()
            .code,
        RepositoryErrorCode::InvalidConfig
    );
    assert_eq!(
        service
            .catalog_workspace(&opened.session_id, "areas/Payments QA")
            .unwrap_err()
            .code,
        RepositoryErrorCode::InvalidConfig
    );
    {
        let sessions = service.sessions.lock().unwrap();
        let session = sessions.by_id.get(&opened.session_id).unwrap();
        assert!(git_sync::ensure_writable(session).is_err());
    }
    write(
        fixture.path(),
        ".casewright/config.yaml",
        "version: 1\nworkspaces: [.]\n",
    );
    assert_eq!(
        service
            .catalog_workspace(&opened.session_id, "areas/Payments QA")
            .unwrap_err()
            .code,
        RepositoryErrorCode::ExternalChange
    );
    service.refresh_metadata(&opened.session_id).unwrap();
    assert!(
        service
            .catalog_workspace(&opened.session_id, "areas/Payments QA")
            .is_err()
    );
}
#[test]
fn service_open_initialize_close_and_drop_own_native_watcher() {
    let temp = tempfile::tempdir().unwrap();
    git(temp.path(), &["init", "--initial-branch=main"]);
    let (tx, rx) = std::sync::mpsc::channel();
    let service = RepositoryService::with_event_sink(std::sync::Arc::new(move |event| {
        let _ = tx.send(event);
    }));
    let opened = service.open(temp.path()).unwrap();
    let same = service.open(temp.path()).unwrap();
    assert_eq!(same.session_id, opened.session_id);
    service.initialize_repository(&opened.session_id).unwrap();
    let event = rx.recv_timeout(std::time::Duration::from_secs(5)).unwrap();
    assert_eq!(event.session_id, opened.session_id);
    service.close(&opened.session_id).unwrap();
    while rx.try_recv().is_ok() {}
    write(temp.path(), "after.md", "closed");
    assert!(
        rx.recv_timeout(std::time::Duration::from_millis(400))
            .is_err()
    );
    let reopened = service.open(temp.path()).unwrap();
    assert_ne!(reopened.session_id, opened.session_id);
    assert!(service.refresh_metadata(&opened.session_id).is_err());
    drop(service);
    write(temp.path(), "after.md", "dropped");
    assert!(
        rx.recv_timeout(std::time::Duration::from_millis(400))
            .is_err()
    );
}

#[test]
fn removed_workspace_revokes_old_case_ids_and_watcher_warning_survives_refresh() {
    let fixture = fixture();
    let service = RepositoryService::default();
    let opened = service.open(fixture.path()).unwrap();
    let catalog = service
        .catalog_workspace(&opened.session_id, "areas/Payments QA")
        .unwrap();
    let id = catalog
        .entries
        .iter()
        .find_map(|entry| {
            if let CatalogEntryDto::Case { resource_id, .. } = entry {
                Some(resource_id.clone())
            } else {
                None
            }
        })
        .unwrap();
    let document = service.read_case(&opened.session_id, &id).unwrap();
    let file = fixture.path().join("areas/Payments QA/PAY-0042-reset.md");
    let before = fs::read(&file).unwrap();
    {
        let mut sessions = service.sessions.lock().unwrap();
        sessions
            .by_id
            .get_mut(&opened.session_id)
            .unwrap()
            .opened
            .warnings
            .push(RepositoryWarning {
                code: RepositoryWarningCode::WatcherUnavailable,
                message: "safe warning".into(),
            });
    }
    write(
        fixture.path(),
        ".casewright/config.yaml",
        "version: 1\nworkspaces: [.]\n",
    );
    let refreshed = service.refresh_metadata(&opened.session_id).unwrap();
    assert!(
        refreshed
            .warnings
            .iter()
            .any(|warning| warning.code == RepositoryWarningCode::WatcherUnavailable)
    );
    assert_eq!(
        service.read_case(&opened.session_id, &id).unwrap_err().code,
        RepositoryErrorCode::InvalidResource
    );
    let model = document.model;
    let edit = CaseEdit {
        display_id: model.display_id,
        title: "Must not write".into(),
        slug: model.slug,
        status: model.status,
        tags: model.tags,
        objective: model.objective,
        systems: model.systems,
        setup: model.setup,
        steps: model.steps,
        acceptance_criteria: model.acceptance_criteria,
    };
    assert_eq!(
        service
            .save_case(&opened.session_id, &id, &document.revision, edit)
            .unwrap_err()
            .code,
        RepositoryErrorCode::InvalidResource
    );
    assert_eq!(fs::read(file).unwrap(), before);
}
