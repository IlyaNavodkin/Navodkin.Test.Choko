use super::*;
use std::{collections::BTreeMap, process::Command};
const CASE: &str = "---\r\nid: source-stable\r\ntitle: Payment\r\ncustom: { keep: yes }\r\n---\r\n## Vendor\r\nUnknown bytes\r\n";
fn fixture() -> (tempfile::TempDir, RepositoryService, String) {
    let temp = tempfile::tempdir().unwrap();
    let root = std::fs::canonicalize(temp.path()).unwrap();
    assert!(
        Command::new("git")
            .args(["init", "--quiet"])
            .current_dir(&root)
            .status()
            .unwrap()
            .success()
    );
    for path in [".casewright/runs/snapshot", "Suite/Nested", "Destination"] {
        fs::create_dir_all(root.join(path)).unwrap();
    }
    for (path, raw) in [
        (".casewright/config.yaml", "version: 1\nworkspaces: [.]\n"),
        (
            "Suite.md",
            "---\nname: Suite note\ncustom: keep\n---\nUnknown note",
        ),
        ("Suite/Nested.md", "Nested unknown note\r\n"),
        ("Suite/.order", "case\r\nNested\r\nunknown-key\r\n"),
        ("Suite/case.md", CASE),
        (
            "Suite/Nested/second.md",
            "---\nid: second-stable\ntitle: Second\n---\n## Custom\nRetain\n",
        ),
        (".order", "Suite\r\nunknown\r\nDestination\r\n"),
        (
            ".casewright/runs/snapshot/001-source.md",
            "immutable snapshot source-stable",
        ),
        ("foreign.txt", "foreign staged"),
    ] {
        fs::write(root.join(path), raw).unwrap();
    }
    fs::write(root.join("Suite/unknown.bin"), [0, 1, 255, 7]).unwrap();
    assert!(
        Command::new("git")
            .args(["add", "--", "foreign.txt"])
            .current_dir(&root)
            .status()
            .unwrap()
            .success()
    );
    let service = RepositoryService::default();
    let token = service.open(&root).unwrap().session_id;
    (temp, service, token)
}
fn folder(service: &RepositoryService, token: &str, path: &str) -> String {
    service
        .catalog_workspace(token, "")
        .unwrap()
        .entries
        .into_iter()
        .find_map(|entry| {
            if let super::super::CatalogEntryDto::Folder {
                node_id,
                path: found,
                ..
            } = entry
            {
                (found == path).then_some(node_id)
            } else {
                None
            }
        })
        .unwrap()
}
fn prepare(
    service: &RepositoryService,
    token: &str,
    path: &str,
    action: SuiteAction,
) -> SuitePreview {
    service
        .prepare_suite_operation(
            token,
            &SuiteOperation {
                workspace_path: String::new(),
                resource_id: folder(service, token, path),
                action,
            },
        )
        .unwrap()
}
fn hashes(root: &Path) -> BTreeMap<String, String> {
    fn walk(root: &Path, path: &Path, out: &mut BTreeMap<String, String>) {
        for item in fs::read_dir(path).unwrap() {
            let path = item.unwrap().path();
            if path.file_name().unwrap() == ".git" {
                continue;
            }
            if path.is_dir() {
                walk(root, &path, out);
            } else {
                out.insert(
                    path.strip_prefix(root)
                        .unwrap()
                        .to_string_lossy()
                        .replace('\\', "/"),
                    atomic::revision(&fs::read(path).unwrap()),
                );
            }
        }
    }
    let mut out = BTreeMap::new();
    walk(root, root, &mut out);
    out.insert(
        ".git/index".into(),
        atomic::revision(&fs::read(root.join(".git/index")).unwrap()),
    );
    out
}
#[test]
fn preview_cancel_is_readonly_and_rename_then_move_preserve_raw_tree_notes_order_runs_and_index() {
    let (temp, service, token) = fixture();
    let root = fs::canonicalize(temp.path()).unwrap();
    let before = hashes(&root);
    let preview = prepare(
        &service,
        &token,
        "Suite",
        SuiteAction::Rename {
            name: "Renamed".into(),
        },
    );
    assert!(
        preview
            .entries
            .iter()
            .any(|entry| entry.path == "Suite/unknown.bin" && entry.kind == "unknown")
    );
    assert_eq!(hashes(&root), before);
    let result = service
        .apply_suite_operation(&token, &preview.confirmation)
        .unwrap();
    assert_eq!(result.outcome, "applied");
    assert_eq!(result.path.as_deref(), Some("Renamed"));
    assert_eq!(
        fs::read(root.join("Renamed/case.md")).unwrap(),
        CASE.as_bytes()
    );
    assert!(!root.join("Suite").exists());
    assert!(root.join("Renamed.md").is_file());
    let dest = folder(&service, &token, "Destination");
    let moved = prepare(
        &service,
        &token,
        "Renamed",
        SuiteAction::Move {
            parent_resource_id: Some(dest),
        },
    );
    assert_eq!(
        service
            .apply_suite_operation(&token, &moved.confirmation)
            .unwrap()
            .outcome,
        "applied"
    );
    for (path, hash) in before {
        let new = if path == "Suite.md" || path.starts_with("Suite/") {
            path.replacen("Suite", "Destination/Renamed", 1)
        } else {
            path
        };
        assert_eq!(
            atomic::revision(&fs::read(root.join(&new)).unwrap()),
            hash,
            "{new}"
        );
    }
    assert!(unfinished(&root).is_empty());
}
#[test]
fn duplicate_assigns_new_case_ids_only_and_preserves_unknown_bytes_notes_and_order() {
    let (temp, service, token) = fixture();
    let root = fs::canonicalize(temp.path()).unwrap();
    let before = hashes(&root);
    let preview = prepare(
        &service,
        &token,
        "Suite",
        SuiteAction::Duplicate {
            parent_resource_id: None,
            name: "Copy".into(),
        },
    );
    assert_eq!(
        service
            .apply_suite_operation(&token, &preview.confirmation)
            .unwrap()
            .outcome,
        "applied"
    );
    for (path, hash) in before {
        assert_eq!(atomic::revision(&fs::read(root.join(path)).unwrap()), hash);
    }
    for path in [".order", "Nested.md", "unknown.bin"] {
        assert_eq!(
            fs::read(root.join("Suite").join(path)).unwrap(),
            fs::read(root.join("Copy").join(path)).unwrap()
        );
    }
    assert_eq!(
        fs::read(root.join("Suite.md")).unwrap(),
        fs::read(root.join("Copy.md")).unwrap()
    );
    let copied = crate::domain::formats::CaseDocument::parse(
        &fs::read_to_string(root.join("Copy/case.md")).unwrap(),
    )
    .unwrap();
    assert_ne!(copied.model().id.as_deref(), Some("source-stable"));
    assert!(Uuid::parse_str(copied.model().id.as_deref().unwrap()).is_ok());
    assert!(
        fs::read_to_string(root.join("Copy/case.md"))
            .unwrap()
            .contains("Unknown bytes\r\n")
    );
    assert!(unfinished(&root).is_empty());
}
#[test]
fn permanent_delete_removes_only_confirmed_suite_and_note_and_leaves_no_journal() {
    let (temp, service, token) = fixture();
    let root = fs::canonicalize(temp.path()).unwrap();
    let before = hashes(&root);
    let preview = prepare(&service, &token, "Suite", SuiteAction::Delete);
    assert!(preview.permanent_delete);
    let result = service
        .apply_suite_operation(&token, &preview.confirmation)
        .unwrap();
    assert_eq!(result.outcome, "applied");
    assert!(!root.join("Suite").exists());
    assert!(!root.join("Suite.md").exists());
    for (path, hash) in before {
        if !path.starts_with("Suite/") && path != "Suite.md" {
            assert_eq!(atomic::revision(&fs::read(root.join(path)).unwrap()), hash);
        }
    }
    assert!(unfinished(&root).is_empty());
}
#[test]
fn stale_files_new_entries_collisions_and_malformed_duplicate_are_rejected_before_mutation() {
    let (temp, service, token) = fixture();
    let root = fs::canonicalize(temp.path()).unwrap();
    let preview = prepare(&service, &token, "Suite", SuiteAction::Delete);
    fs::write(root.join("Suite/new.txt"), "external").unwrap();
    let before = hashes(&root);
    assert_eq!(
        service
            .apply_suite_operation(&token, &preview.confirmation)
            .unwrap_err()
            .code,
        RepositoryErrorCode::ExternalChange
    );
    assert_eq!(hashes(&root), before);
    let id = folder(&service, &token, "Suite");
    for name in ["Destination", "Suite", "../escape", "CON"] {
        assert!(
            service
                .prepare_suite_operation(
                    &token,
                    &SuiteOperation {
                        workspace_path: String::new(),
                        resource_id: id.clone(),
                        action: SuiteAction::Rename { name: name.into() }
                    }
                )
                .is_err()
        );
    }
    fs::write(root.join("Suite/bad.md"), "not a case").unwrap();
    let before = hashes(&root);
    assert!(
        service
            .prepare_suite_operation(
                &token,
                &SuiteOperation {
                    workspace_path: String::new(),
                    resource_id: id,
                    action: SuiteAction::Duplicate {
                        parent_resource_id: None,
                        name: "BadCopy".into()
                    }
                }
            )
            .is_err()
    );
    assert_eq!(hashes(&root), before);
}
#[test]
fn rejects_descendant_destination_and_other_declared_roots() {
    let (temp, service, token) = fixture();
    let root = fs::canonicalize(temp.path()).unwrap();
    let id = folder(&service, &token, "Suite");
    let child = folder(&service, &token, "Suite/Nested");
    assert!(
        service
            .prepare_suite_operation(
                &token,
                &SuiteOperation {
                    workspace_path: String::new(),
                    resource_id: id.clone(),
                    action: SuiteAction::Move {
                        parent_resource_id: Some(child)
                    }
                }
            )
            .is_err()
    );
    fs::write(
        root.join(".casewright/config.yaml"),
        "version: 1\nworkspaces: [., Suite/Nested]\n",
    )
    .unwrap();
    service.refresh_metadata(&token).unwrap();
    assert!(
        service
            .prepare_suite_operation(
                &token,
                &SuiteOperation {
                    workspace_path: String::new(),
                    resource_id: id,
                    action: SuiteAction::Delete
                }
            )
            .is_err()
    );
}
#[test]
fn partial_delete_reports_removed_and_remaining_paths_and_reopen_blocks_without_executing_journal()
{
    let (temp, service, token) = fixture();
    let root = fs::canonicalize(temp.path()).unwrap();
    let preview = prepare(&service, &token, "Suite", SuiteAction::Delete);
    transaction::INJECTION
        .with(|slot| *slot.borrow_mut() = Some(Box::new(|phase, _, _| phase == "afterUnlink")));
    let result = service
        .apply_suite_operation(&token, &preview.confirmation)
        .unwrap();
    transaction::INJECTION.with(|slot| *slot.borrow_mut() = None);
    assert_eq!(result.outcome, "recoveryRequired");
    let recovery = result.recovery.unwrap();
    assert_eq!(recovery.removed_paths.len(), 1);
    assert!(!recovery.remaining_paths.is_empty());
    assert!(
        root.join(&recovery.transaction_path)
            .join("journal.json")
            .is_file()
    );
    assert!(
        service
            .create_suite(
                &token,
                &super::super::SuiteCreation {
                    workspace_path: String::new(),
                    parent_resource_id: None,
                    name: "Blocked".into()
                }
            )
            .is_err()
    );
    service.close(&token).unwrap();
    let opened = service.open(&root).unwrap();
    assert!(
        opened
            .warnings
            .iter()
            .any(|warning| warning.code
                == super::super::RepositoryWarningCode::SuiteRecoveryRequired)
    );
    assert!(root.join(recovery.transaction_path).exists());
}
#[test]
fn duplicate_cleanup_never_adopts_a_new_foreign_staged_child() {
    let (temp, service, token) = fixture();
    let root = fs::canonicalize(temp.path()).unwrap();
    let preview = prepare(
        &service,
        &token,
        "Suite",
        SuiteAction::Duplicate {
            parent_resource_id: None,
            name: "Copy".into(),
        },
    );
    transaction::INJECTION.with(|slot| {
        *slot.borrow_mut() = Some(Box::new(|phase, root, tx| {
            if phase == "beforePublish" {
                fs::write(root.join(tx).join("tree/foreign-new.txt"), "retain unknown").unwrap();
                true
            } else {
                false
            }
        }));
    });
    let result = service
        .apply_suite_operation(&token, &preview.confirmation)
        .unwrap();
    transaction::INJECTION.with(|slot| *slot.borrow_mut() = None);
    assert_eq!(result.outcome, "recoveryRequired");
    let tx = result.recovery.unwrap().transaction_path;
    assert_eq!(
        fs::read_to_string(root.join(tx).join("tree/foreign-new.txt")).unwrap(),
        "retain unknown"
    );
    assert_eq!(
        fs::read(root.join("Suite/case.md")).unwrap(),
        CASE.as_bytes()
    );
}
#[test]
fn new_source_note_collision_is_not_mistaken_for_a_completed_rollback() {
    let (temp, service, token) = fixture();
    let root = fs::canonicalize(temp.path()).unwrap();
    let note = fs::read(root.join("Suite.md")).unwrap();
    let preview = prepare(
        &service,
        &token,
        "Suite",
        SuiteAction::Rename {
            name: "Renamed".into(),
        },
    );
    transaction::INJECTION.with(|slot| {
        *slot.borrow_mut() = Some(Box::new(|phase, root, _| {
            if phase == "afterQuarantine" {
                fs::write(root.join("Suite.md"), "new foreign note").unwrap();
                true
            } else {
                false
            }
        }));
    });
    let result = service
        .apply_suite_operation(&token, &preview.confirmation)
        .unwrap();
    transaction::INJECTION.with(|slot| *slot.borrow_mut() = None);
    assert_eq!(result.outcome, "recoveryRequired");
    let tx = result.recovery.unwrap().transaction_path;
    assert_eq!(fs::read(root.join(tx).join("tree.md")).unwrap(), note);
    assert_eq!(
        fs::read_to_string(root.join("Suite.md")).unwrap(),
        "new foreign note"
    );
}
#[test]
fn long_parent_result_is_refused_before_create_or_case_rename() {
    let (temp, service, token) = fixture();
    let root = fs::canonicalize(temp.path()).unwrap();
    let mut parent = String::new();
    for n in 0..11 {
        parent = relative(&parent, &format!("p{n:02}{}", "a".repeat(77)));
        fs::create_dir(root.join(&parent)).unwrap();
    }
    fs::write(root.join(&parent).join("old.md"), CASE).unwrap();
    let catalog = service.catalog_workspace(&token, "").unwrap();
    let parent_id = catalog
        .entries
        .iter()
        .find_map(|entry| {
            if let super::super::CatalogEntryDto::Folder { node_id, path, .. } = entry {
                (path == &parent).then_some(node_id.clone())
            } else {
                None
            }
        })
        .unwrap();
    let long = "x".repeat(180);
    assert!(
        service
            .create_suite(
                &token,
                &super::super::SuiteCreation {
                    workspace_path: String::new(),
                    parent_resource_id: Some(parent_id),
                    name: long.clone()
                }
            )
            .is_err()
    );
    assert!(!root.join(&parent).join(&long).exists());
    let id = catalog
        .entries
        .iter()
        .find_map(|entry| {
            if let super::super::CatalogEntryDto::Case {
                resource_id, path, ..
            } = entry
            {
                (path == &format!("{parent}/old.md")).then_some(resource_id.clone())
            } else {
                None
            }
        })
        .unwrap();
    assert!(
        service
            .organize_case(
                &token,
                &super::super::CaseOperation {
                    workspace_path: String::new(),
                    resource_id: id,
                    expected_revision: atomic::revision(CASE.as_bytes()),
                    action: super::super::CaseAction::Rename {
                        filename: format!("{}.md", "b".repeat(177))
                    }
                }
            )
            .is_err()
    );
    assert_eq!(
        fs::read(root.join(parent).join("old.md")).unwrap(),
        CASE.as_bytes()
    );
}
#[test]
fn ordinary_repository_with_more_than_1000_root_files_is_not_recovery_blocked() {
    let (temp, service, token) = fixture();
    let root = fs::canonicalize(temp.path()).unwrap();
    service.close(&token).unwrap();
    for n in 0..1005 {
        fs::write(root.join(format!("ordinary-{n}.txt")), "unknown").unwrap();
    }
    let opened = service.open(&root).unwrap();
    assert!(
        !opened
            .warnings
            .iter()
            .any(|warning| warning.code
                == super::super::RepositoryWarningCode::SuiteRecoveryRequired)
    );
    assert!(
        service
            .create_suite(
                &opened.session_id,
                &super::super::SuiteCreation {
                    workspace_path: String::new(),
                    parent_resource_id: None,
                    name: "StillWritable".into()
                }
            )
            .is_ok()
    );
}

#[test]
fn journal_cleanup_retains_a_late_unknown_file_and_both_sticky_warnings_survive_refresh() {
    let (temp, service, token) = fixture();
    let root = fs::canonicalize(temp.path()).unwrap();
    let preview = prepare(
        &service,
        &token,
        "Suite",
        SuiteAction::Rename {
            name: "Renamed".into(),
        },
    );
    transaction::INJECTION.with(|slot| {
        *slot.borrow_mut() = Some(Box::new(|phase, root, tx| {
            if phase == "beforeCleanup" {
                fs::write(root.join(tx).join("unknown-new.txt"), "not owned").unwrap();
            }
            false
        }));
    });
    let result = service
        .apply_suite_operation(&token, &preview.confirmation)
        .unwrap();
    transaction::INJECTION.with(|slot| *slot.borrow_mut() = None);
    assert_eq!(result.outcome, "recoveryRequired");
    let tx = result.recovery.unwrap().transaction_path;
    assert_eq!(
        fs::read_to_string(root.join(&tx).join("unknown-new.txt")).unwrap(),
        "not owned"
    );
    assert!(root.join(&tx).join("journal.json").is_file());
    {
        let mut sessions = service.sessions.lock().unwrap();
        sessions
            .by_id
            .get_mut(&token)
            .unwrap()
            .opened
            .warnings
            .push(super::super::RepositoryWarning {
                code: super::super::RepositoryWarningCode::WatcherUnavailable,
                message: "safe health".into(),
            });
    }
    let opened = service.refresh_metadata(&token).unwrap();
    assert!(
        opened
            .warnings
            .iter()
            .any(|warning| warning.code == super::super::RepositoryWarningCode::WatcherUnavailable)
    );
    assert!(
        opened
            .warnings
            .iter()
            .any(|warning| warning.code
                == super::super::RepositoryWarningCode::SuiteRecoveryRequired)
    );
}
#[test]
fn rejects_oversized_tree_and_external_links_without_creating_transaction_artifacts() {
    let (temp, service, token) = fixture();
    let root = fs::canonicalize(temp.path()).unwrap();
    fs::write(
        root.join("Suite/oversized.bin"),
        vec![1u8; super::super::MAX_REPOSITORY_FILE_BYTES + 1],
    )
    .unwrap();
    let id = folder(&service, &token, "Suite");
    assert!(
        service
            .prepare_suite_operation(
                &token,
                &SuiteOperation {
                    workspace_path: String::new(),
                    resource_id: id.clone(),
                    action: SuiteAction::Delete
                }
            )
            .is_err()
    );
    assert!(unfinished(&root).is_empty());
    fs::remove_file(root.join("Suite/oversized.bin")).unwrap();
    let outside = tempfile::tempdir().unwrap();
    fs::write(outside.path().join("private.bin"), "outside").unwrap();
    let link = root.join("Suite/external-link");
    #[cfg(windows)]
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
    #[cfg(unix)]
    std::os::unix::fs::symlink(outside.path(), &link).unwrap();
    assert!(
        service
            .prepare_suite_operation(
                &token,
                &SuiteOperation {
                    workspace_path: String::new(),
                    resource_id: id,
                    action: SuiteAction::Delete
                }
            )
            .is_err()
    );
    assert!(unfinished(&root).is_empty());
    assert_eq!(
        fs::read_to_string(outside.path().join("private.bin")).unwrap(),
        "outside"
    );
    #[cfg(windows)]
    fs::remove_dir(link).unwrap();
    #[cfg(unix)]
    fs::remove_file(link).unwrap();
}
