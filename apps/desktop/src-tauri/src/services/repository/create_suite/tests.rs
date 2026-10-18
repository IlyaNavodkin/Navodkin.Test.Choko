use super::*;
use crate::services::repository::{CatalogEntryDto, SuiteCreation};
use std::{path::Path, process::Command};
fn setup(root: &Path) -> (RepositoryService, String) {
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
        "version: 1\nworkspaces: [.]\n",
    )
    .unwrap();
    fs::write(root.join(".order"), "unknown\r\n").unwrap();
    fs::write(root.join("foreign.txt"), "staged").unwrap();
    assert!(
        Command::new("git")
            .args(["add", "--", "foreign.txt"])
            .current_dir(root)
            .status()
            .unwrap()
            .success()
    );
    let service = RepositoryService::default();
    let token = service.open(root).unwrap().session_id;
    (service, token)
}
fn request(name: &str, parent_resource_id: Option<String>) -> SuiteCreation {
    SuiteCreation {
        workspace_path: String::new(),
        parent_resource_id,
        name: name.into(),
    }
}
fn folder_id(service: &RepositoryService, token: &str, path: &str) -> String {
    service
        .catalog_workspace(token, "")
        .unwrap()
        .entries
        .into_iter()
        .find_map(|entry| {
            if let CatalogEntryDto::Folder {
                node_id,
                path: current,
                ..
            } = entry
            {
                (current == path).then_some(node_id)
            } else {
                None
            }
        })
        .unwrap()
}
#[test]
fn creates_root_and_nested_suites_without_rewriting_order_notes_or_git_index() {
    let temp = tempfile::tempdir().unwrap();
    let (service, token) = setup(temp.path());
    let index = fs::read(temp.path().join(".git/index")).unwrap();
    assert_eq!(
        service
            .create_suite(&token, &request("Новая suite", None))
            .unwrap()
            .path,
        "Новая suite"
    );
    let parent = folder_id(&service, &token, "Новая suite");
    fs::write(temp.path().join("Новая suite.md"), "unknown note\r\n").unwrap();
    assert_eq!(
        service
            .create_suite(&token, &request("Nested", Some(parent)))
            .unwrap()
            .path,
        "Новая suite/Nested"
    );
    assert!(temp.path().join("Новая suite/Nested").is_dir());
    assert!(
        fs::read_dir(temp.path().join("Новая suite/Nested"))
            .unwrap()
            .next()
            .is_none()
    );
    assert_eq!(fs::read(temp.path().join(".git/index")).unwrap(), index);
    assert_eq!(
        fs::read_to_string(temp.path().join(".order")).unwrap(),
        "unknown\r\n"
    );
    assert_eq!(
        fs::read_to_string(temp.path().join("Новая suite.md")).unwrap(),
        "unknown note\r\n"
    );
    assert!(!temp.path().join("Новая suite/_suite.md").exists());
}
#[test]
fn refuses_empty_existing_directory_file_and_sibling_note_collisions() {
    let temp = tempfile::tempdir().unwrap();
    let (service, token) = setup(temp.path());
    fs::create_dir(temp.path().join("Empty")).unwrap();
    fs::write(temp.path().join("File"), "foreign").unwrap();
    fs::write(temp.path().join("Note.md"), "existing case or note").unwrap();
    for name in ["Empty", "File", "Note"] {
        assert_eq!(
            service
                .create_suite(&token, &request(name, None))
                .unwrap_err()
                .code,
            RepositoryErrorCode::SaveFailed
        );
    }
    assert_eq!(
        fs::read_to_string(temp.path().join("File")).unwrap(),
        "foreign"
    );
    assert_eq!(
        fs::read_to_string(temp.path().join("Note.md")).unwrap(),
        "existing case or note"
    );
    assert!(
        fs::read_dir(temp.path().join("Empty"))
            .unwrap()
            .next()
            .is_none()
    );
    assert!(!temp.path().join("Note").exists());
}
#[test]
fn refuses_stale_unknown_parent_undeclared_workspace_and_implicit_initialization() {
    let temp = tempfile::tempdir().unwrap();
    let (service, token) = setup(temp.path());
    service
        .create_suite(&token, &request("Parent", None))
        .unwrap();
    let parent = folder_id(&service, &token, "Parent");
    fs::rename(temp.path().join("Parent"), temp.path().join("Moved")).unwrap();
    assert!(
        service
            .create_suite(&token, &request("Child", Some(parent)))
            .is_err()
    );
    assert!(
        service
            .create_suite(
                &token,
                &request("Child", Some(uuid::Uuid::new_v4().to_string()))
            )
            .is_err()
    );
    let mut outside = request("Child", None);
    outside.workspace_path = "../outside".into();
    assert!(service.create_suite(&token, &outside).is_err());
    let empty = tempfile::tempdir().unwrap();
    assert!(
        Command::new("git")
            .args(["init", "--quiet"])
            .current_dir(empty.path())
            .status()
            .unwrap()
            .success()
    );
    let empty_token = service.open(empty.path()).unwrap().session_id;
    assert!(
        service
            .create_suite(&empty_token, &request("NoInit", None))
            .is_err()
    );
    assert!(!empty.path().join(".casewright").exists());
}
#[test]
fn rejects_nonportable_names_and_unknown_fields_without_creating_files() {
    let temp = tempfile::tempdir().unwrap();
    let (service, token) = setup(temp.path());
    for name in [
        "../outside",
        "CON",
        "safe:stream",
        "nested/path",
        ".casewright",
        "bad.",
    ] {
        assert_eq!(
            service
                .create_suite(&token, &request(name, None))
                .unwrap_err()
                .code,
            RepositoryErrorCode::InvalidSuiteCreation
        );
    }
    assert!(serde_json::from_value::<SuiteCreation>(serde_json::json!({"workspacePath":"", "parentResourceId":null, "name":"Safe", "absolutePath":"secret"})).is_err());
}
#[test]
fn rejects_parent_replaced_by_external_link_without_writing_outside() {
    let temp = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let (service, token) = setup(temp.path());
    service
        .create_suite(&token, &request("Parent", None))
        .unwrap();
    let parent = folder_id(&service, &token, "Parent");
    let link = temp.path().join("Parent");
    fs::remove_dir(&link).unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(outside.path(), &link).unwrap();
    #[cfg(windows)]
    {
        assert!(
            Command::new("cmd.exe")
                .args(["/d", "/c", "mklink", "/J"])
                .arg(&link)
                .arg(outside.path())
                .output()
                .unwrap()
                .status
                .success()
        );
    }
    assert!(
        service
            .create_suite(&token, &request("Child", Some(parent)))
            .is_err()
    );
    assert!(!outside.path().join("Child").exists());
    fs::remove_dir(&link).unwrap();
}
