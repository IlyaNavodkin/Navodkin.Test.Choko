use super::*;
use std::process::Command;
fn git(root: &Path, args: &[&str]) -> String {
    let out = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).unwrap()
}
const CASE: &str = "---\nid: stable\ntitle: Case\n---\n\n## Objective\nOriginal\n";
fn fixture(root: &Path) -> (RepositoryService, String) {
    git(root, &["init", "--quiet"]);
    git(root, &["config", "user.name", "Fixture"]);
    git(root, &["config", "user.email", "fixture@example.invalid"]);
    git(root, &["config", "commit.gpgSign", "false"]);
    fs::create_dir(root.join(".casewright")).unwrap();
    fs::write(
        root.join(".casewright/config.yaml"),
        "version: 1\nworkspaces:\n  - .\n",
    )
    .unwrap();
    fs::write(root.join("case.md"), CASE).unwrap();
    fs::write(root.join("foreign.txt"), "original").unwrap();
    git(root, &["add", "--all"]);
    git(root, &["commit", "--quiet", "-m", "base"]);
    let service = RepositoryService::default();
    let session = service.open(root).unwrap().session_id;
    (service, session)
}
fn ids(service: &RepositoryService, session: &str, paths: &[&str]) -> Vec<String> {
    let status = service.git_status(session).unwrap();
    paths
        .iter()
        .map(|path| {
            status
                .files
                .iter()
                .find(|file| file.path == *path && file.committable)
                .unwrap()
                .file_id
                .clone()
        })
        .collect()
}
#[test]
fn commits_saved_selection_preserving_foreign_and_unselected_staged_entries() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let (service, session) = fixture(root);
    fs::write(root.join("case.md"), CASE.replace("Original", "staged")).unwrap();
    git(root, &["add", "case.md"]);
    fs::write(
        root.join("case.md"),
        CASE.replace("Original", "saved working"),
    )
    .unwrap();
    fs::write(root.join("other.md"), CASE.replace("stable", "other")).unwrap();
    git(root, &["add", "other.md"]);
    fs::write(root.join("foreign.txt"), "foreign staged").unwrap();
    git(root, &["add", "foreign.txt"]);
    git(root, &["update-index", "--assume-unchanged", "foreign.txt"]);
    let foreign = git(
        root,
        &["ls-files", "--stage", "-v", "foreign.txt", "other.md"],
    );
    let result = service
        .git_commit(&session, &ids(&service, &session, &["case.md"]), "explicit")
        .unwrap();
    assert!(result.index_published);
    assert!(git(root, &["show", "HEAD:case.md"]).contains("saved working"));
    assert_eq!(git(root, &["show", "HEAD:foreign.txt"]), "original");
    assert_eq!(
        git(
            root,
            &["ls-files", "--stage", "-v", "foreign.txt", "other.md"]
        ),
        foreign
    );
    assert!(git(root, &["diff", "--cached", "--name-only"]).contains("other.md"));
    assert!(git(root, &["diff", "--cached", "--", "case.md"]).is_empty());
}
#[test]
fn supports_new_deleted_and_renamed_product_files() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let (service, session) = fixture(root);
    fs::write(root.join("new.md"), CASE.replace("stable", "new")).unwrap();
    service
        .git_commit(&session, &ids(&service, &session, &["new.md"]), "new")
        .unwrap();
    assert!(git(root, &["show", "HEAD:new.md"]).contains("new"));
    git(root, &["mv", "new.md", "renamed.md"]);
    service
        .git_commit(
            &session,
            &ids(&service, &session, &["renamed.md"]),
            "rename",
        )
        .unwrap();
    assert_eq!(git(root, &["ls-tree", "--name-only", "HEAD", "new.md"]), "");
    fs::remove_file(root.join("case.md")).unwrap();
    service
        .git_commit(&session, &ids(&service, &session, &["case.md"]), "delete")
        .unwrap();
    assert_eq!(
        git(root, &["ls-tree", "--name-only", "HEAD", "case.md"]),
        ""
    );
}
#[test]
fn stale_content_foreign_selection_hooks_and_signing_leave_head_and_index_unchanged() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let (service, session) = fixture(root);
    fs::write(root.join("case.md"), CASE.replace("Original", "first")).unwrap();
    let selected = ids(&service, &session, &["case.md"]);
    let head = git(root, &["rev-parse", "HEAD"]);
    let index = fs::read(root.join(".git/index")).unwrap();
    fs::write(root.join("case.md"), CASE.replace("Original", "second")).unwrap();
    assert_eq!(
        service
            .git_commit(&session, &selected, "stale")
            .unwrap_err()
            .code,
        RepositoryErrorCode::StaleResource
    );
    fs::write(root.join("foreign.txt"), "foreign").unwrap();
    let status = service.git_status(&session).unwrap();
    let foreign = status
        .files
        .iter()
        .find(|file| file.path == "foreign.txt")
        .unwrap();
    assert!(!foreign.committable);
    assert!(
        service
            .git_commit(&session, std::slice::from_ref(&foreign.file_id), "foreign")
            .is_err()
    );
    git(root, &["config", "commit.gpgSign", "true"]);
    assert_eq!(
        service
            .git_commit(&session, &ids(&service, &session, &["case.md"]), "sign")
            .unwrap_err()
            .code,
        RepositoryErrorCode::GitCommitBlocked
    );
    git(root, &["config", "commit.gpgSign", "false"]);
    fs::write(root.join(".git/hooks/pre-commit"), "#!/bin/sh\nexit 1\n").unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(
            root.join(".git/hooks/pre-commit"),
            fs::Permissions::from_mode(0o755),
        )
        .unwrap();
    }
    assert_eq!(
        service
            .git_commit(&session, &ids(&service, &session, &["case.md"]), "hook")
            .unwrap_err()
            .code,
        RepositoryErrorCode::GitCommitBlocked
    );
    assert_eq!(git(root, &["rev-parse", "HEAD"]), head);
    assert_eq!(fs::read(root.join(".git/index")).unwrap(), index);
    assert!(!root.join(".git/index.lock").exists());
}
#[test]
fn detached_operation_and_missing_identity_are_diagnosed_without_mutation() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let (service, session) = fixture(root);
    fs::write(root.join("case.md"), CASE.replace("Original", "changed")).unwrap();
    fs::write(root.join(".git/MERGE_HEAD"), "invalid").unwrap();
    assert_eq!(
        service
            .git_commit(&session, &ids(&service, &session, &["case.md"]), "merge")
            .unwrap_err()
            .code,
        RepositoryErrorCode::GitCommitBlocked
    );
    fs::remove_file(root.join(".git/MERGE_HEAD")).unwrap();
    git(root, &["checkout", "--detach", "--quiet"]);
    assert_eq!(
        service
            .git_commit(&session, &ids(&service, &session, &["case.md"]), "detached")
            .unwrap_err()
            .code,
        RepositoryErrorCode::GitCommitBlocked
    );
    git(root, &["checkout", "--quiet", "-"]);
    git(root, &["config", "user.name", ""]);
    assert_eq!(
        service
            .git_commit(&session, &ids(&service, &session, &["case.md"]), "identity")
            .unwrap_err()
            .code,
        RepositoryErrorCode::GitIdentityMissing
    );
}

#[test]
fn failed_index_publication_returns_created_oid_and_keeps_recovery_files() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let (service, session) = fixture(root);
    fs::write(root.join("case.md"), CASE.replace("Original", "changed")).unwrap();
    let selected = ids(&service, &session, &["case.md"]);
    let index = fs::read(root.join(".git/index")).unwrap();
    FAIL_PUBLICATION.with(|flag| flag.set(true));
    let result = service
        .git_commit(&session, &selected, "committed but recover index")
        .unwrap();
    FAIL_PUBLICATION.with(|flag| flag.set(false));
    assert!(!result.index_published);
    assert_eq!(result.head, git(root, &["rev-parse", "HEAD"]).trim());
    assert_eq!(index, fs::read(root.join(".git/index")).unwrap());
    assert!(root.join(".git/index.lock").exists());
    assert!(
        root.join(".git")
            .join(result.recovery_index.unwrap())
            .is_file()
    );
    assert_eq!(
        service
            .git_commit(&session, &selected, "must not repeat")
            .unwrap_err()
            .code,
        RepositoryErrorCode::GitRecoveryRequired
    );
    assert!(
        service
            .git_status(&session)
            .unwrap()
            .files
            .iter()
            .all(|file| !file.committable)
    );
}
#[test]
fn unsupported_configuration_and_selected_filter_leave_index_unchanged() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let (service, session) = fixture(root);
    fs::write(root.join("case.md"), CASE.replace("Original", "changed")).unwrap();
    let head = git(root, &["rev-parse", "HEAD"]);
    let index = fs::read(root.join(".git/index")).unwrap();
    fs::create_dir(root.join("false")).unwrap();
    fs::write(
        root.join("false/pre-commit"),
        "#!/bin/sh\necho unsafe > executed.txt\n",
    )
    .unwrap();
    for (key, value) in [
        ("core.hooksPath", "false"),
        ("core.splitIndex", "true"),
        ("core.sparseCheckout", "true"),
        ("extensions.worktreeConfig", "true"),
    ] {
        git(root, &["config", key, value]);
        let selected = ids(&service, &session, &["case.md"]);
        assert_eq!(
            service
                .git_commit(&session, &selected, "blocked")
                .unwrap_err()
                .code,
            RepositoryErrorCode::GitCommitBlocked
        );
        git(root, &["config", "--unset", key]);
    }
    fs::write(root.join(".gitattributes"), "case.md filter=evil\n").unwrap();
    git(
        root,
        &["config", "filter.evil.clean", "echo unsafe > executed.txt"],
    );
    assert_eq!(
        service
            .git_commit(&session, &ids(&service, &session, &["case.md"]), "filtered")
            .unwrap_err()
            .code,
        RepositoryErrorCode::GitCommitBlocked
    );
    assert!(!root.join("executed.txt").exists());
    assert_eq!(head, git(root, &["rev-parse", "HEAD"]));
    assert_eq!(index, fs::read(root.join(".git/index")).unwrap());
}
#[test]
fn readonly_status_still_lists_generic_large_markdown_but_does_not_offer_commit() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let (service, session) = fixture(root);
    fs::write(root.join("large.md"), vec![b'x'; 2 * 1024 * 1024 + 1]).unwrap();
    fs::write(root.join("case.md"), CASE.replace("Original", "changed")).unwrap();
    let status = service.git_status(&session).unwrap();
    assert!(
        !status
            .files
            .iter()
            .find(|file| file.path == "large.md")
            .unwrap()
            .committable
    );
    assert!(
        status
            .files
            .iter()
            .find(|file| file.path == "case.md")
            .unwrap()
            .committable
    );
}

#[test]
fn stale_head_index_and_existing_lock_never_stage_into_real_index() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let (service, session) = fixture(root);
    fs::write(root.join("case.md"), CASE.replace("Original", "changed")).unwrap();
    let selected = ids(&service, &session, &["case.md"]);
    fs::write(root.join("foreign.txt"), "staged").unwrap();
    git(root, &["add", "foreign.txt"]);
    let index = fs::read(root.join(".git/index")).unwrap();
    assert_eq!(
        service
            .git_commit(&session, &selected, "stale index")
            .unwrap_err()
            .code,
        RepositoryErrorCode::StaleResource
    );
    assert_eq!(index, fs::read(root.join(".git/index")).unwrap());
    let selected = ids(&service, &session, &["case.md"]);
    git(root, &["commit", "--quiet", "-m", "external commit"]);
    let index = fs::read(root.join(".git/index")).unwrap();
    assert_eq!(
        service
            .git_commit(&session, &selected, "stale HEAD")
            .unwrap_err()
            .code,
        RepositoryErrorCode::StaleResource
    );
    assert_eq!(index, fs::read(root.join(".git/index")).unwrap());
    let selected = ids(&service, &session, &["case.md"]);
    fs::write(root.join(".git/index.lock"), "external lock").unwrap();
    assert_eq!(
        service
            .git_commit(&session, &selected, "locked")
            .unwrap_err()
            .code,
        RepositoryErrorCode::GitCommitBlocked
    );
    assert_eq!(
        fs::read_to_string(root.join(".git/index.lock")).unwrap(),
        "external lock"
    );
}
#[test]
fn actual_unmerged_index_blocks_commit_and_preserves_conflict() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let (service, session) = fixture(root);
    let branch = git(root, &["branch", "--show-current"]).trim().to_owned();
    git(root, &["checkout", "--quiet", "-b", "other"]);
    fs::write(root.join("case.md"), CASE.replace("Original", "theirs")).unwrap();
    git(root, &["add", "case.md"]);
    git(root, &["commit", "--quiet", "-m", "theirs"]);
    git(root, &["checkout", "--quiet", &branch]);
    fs::write(root.join("case.md"), CASE.replace("Original", "ours")).unwrap();
    git(root, &["add", "case.md"]);
    git(root, &["commit", "--quiet", "-m", "ours"]);
    assert!(
        !Command::new("git")
            .args(["merge", "--no-edit", "other"])
            .current_dir(root)
            .output()
            .unwrap()
            .status
            .success()
    );
    let status = service.git_status(&session).unwrap();
    let file = status.files.iter().find(|file| file.unmerged).unwrap();
    let index = fs::read(root.join(".git/index")).unwrap();
    let head = git(root, &["rev-parse", "HEAD"]);
    assert_eq!(
        service
            .git_commit(&session, std::slice::from_ref(&file.file_id), "conflict")
            .unwrap_err()
            .code,
        RepositoryErrorCode::GitCommitBlocked
    );
    assert_eq!(index, fs::read(root.join(".git/index")).unwrap());
    assert_eq!(head, git(root, &["rev-parse", "HEAD"]));
}
