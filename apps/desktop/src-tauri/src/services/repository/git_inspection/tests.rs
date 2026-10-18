use super::*;
use std::process::Command;
fn git(root: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(args)
        .current_dir(root)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout).unwrap()
}
fn fixture(root: &Path, commit: bool) -> (RepositoryService, String) {
    git(root, &["init", "--quiet"]);
    git(root, &["config", "user.name", "Fixture"]);
    git(root, &["config", "user.email", "fixture@example.invalid"]);
    fs::create_dir_all(root.join(".casewright")).unwrap();
    fs::write(
        root.join(".casewright/config.yaml"),
        "version: 1\nworkspaces:\n  - .\n",
    )
    .unwrap();
    fs::write(root.join("case [one].md"), "original\n").unwrap();
    fs::write(root.join("foreign.txt"), "foreign\n").unwrap();
    if commit {
        git(
            root,
            &[
                "add",
                "--",
                ".casewright/config.yaml",
                "case [one].md",
                "foreign.txt",
            ],
        );
        git(root, &["commit", "--quiet", "-m", "fixture"]);
    }
    let service = RepositoryService::default();
    let session = service.open(root).unwrap().session_id;
    (service, session)
}
#[test]
fn unborn_detached_staged_unstaged_untracked_and_refresh_are_read_only() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let (service, session) = fixture(root, false);
    assert!(service.git_status(&session).unwrap().unborn);
    git(root, &["add", "--all"]);
    git(root, &["commit", "--quiet", "-m", "initial"]);
    fs::write(root.join("case [one].md"), "staged\n").unwrap();
    git(root, &["add", "--", "case [one].md"]);
    fs::write(root.join("case [one].md"), "working\n").unwrap();
    fs::write(root.join("новый файл.md"), "untracked content\n").unwrap();
    fs::write(root.join("foreign.txt"), "foreign staged\n").unwrap();
    git(root, &["add", "--", "foreign.txt"]);
    let index = fs::read(root.join(".git/index")).unwrap();
    let head = git(root, &["rev-parse", "HEAD"]);
    let status = service.git_status(&session).unwrap();
    assert!(!status.unborn);
    assert!(!status.detached);
    assert!(status.upstream.is_none());
    let file = status
        .files
        .iter()
        .find(|file| file.path == "case [one].md")
        .unwrap();
    assert_eq!((&file.index[..], &file.worktree[..]), ("M", "M"));
    let diff = service.git_diff(&session, &file.file_id).unwrap();
    assert!(diff.staged.unwrap().contains("+staged"));
    assert!(diff.working_tree.unwrap().contains("+working"));
    let untracked = status
        .files
        .iter()
        .find(|file| file.path == "новый файл.md")
        .unwrap();
    assert_eq!(
        service
            .git_diff(&session, &untracked.file_id)
            .unwrap()
            .untracked_content
            .as_deref(),
        Some("untracked content\n")
    );
    assert_eq!(index, fs::read(root.join(".git/index")).unwrap());
    assert_eq!(head, git(root, &["rev-parse", "HEAD"]));
    fs::write(root.join("case [one].md"), "different staged blob\n").unwrap();
    git(root, &["add", "--", "case [one].md"]);
    fs::write(root.join("case [one].md"), "working\n").unwrap();
    assert_eq!(
        service.git_diff(&session, &file.file_id).unwrap_err().code,
        RepositoryErrorCode::StaleResource
    );
    service.git_status(&session).unwrap();
    assert_eq!(
        service.git_diff(&session, &file.file_id).unwrap_err().code,
        RepositoryErrorCode::InvalidResource
    );
    git(root, &["checkout", "--quiet", "--detach"]);
    assert!(service.git_status(&session).unwrap().detached);
    service.close(&session).unwrap();
    assert_eq!(
        service.git_status(&session).unwrap_err().code,
        RepositoryErrorCode::InvalidSession
    );
}
#[test]
fn rename_delete_binary_and_external_filters_are_handled_without_running_helpers() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let (service, session) = fixture(root, true);
    git(root, &["mv", "--", "foreign.txt", "renamed file.txt"]);
    fs::remove_file(root.join("case [one].md")).unwrap();
    fs::write(root.join("binary.bin"), [0, 1, 2]).unwrap();
    git(
        root,
        &["config", "filter.evil.clean", "echo unsafe > executed.txt"],
    );
    git(
        root,
        &[
            "config",
            "filter.evil.process",
            "echo unsafe > executed-process.txt",
        ],
    );
    git(root, &["config", "filter.evil.required", "true"]);
    git(
        root,
        &[
            "config",
            "core.fsmonitor",
            "echo unsafe > executed-monitor.txt",
        ],
    );
    fs::write(root.join(".gitattributes"), "*.txt filter=evil diff=evil\n").unwrap();
    git(
        root,
        &[
            "config",
            "diff.evil.command",
            "echo unsafe > executed-diff.txt",
        ],
    );
    git(
        root,
        &[
            "config",
            "diff.evil.textconv",
            "echo unsafe > executed-textconv.txt",
        ],
    );
    fs::write(
        root.join("renamed file.txt"),
        "force clean filter inspection\n",
    )
    .unwrap();
    let status = service.git_status(&session).unwrap();
    assert!(status.filters_disabled);
    let renamed = status
        .files
        .iter()
        .find(|file| file.path == "renamed file.txt")
        .unwrap();
    assert_eq!(renamed.original_path.as_deref(), Some("foreign.txt"));
    assert!(
        service
            .git_diff(&session, &renamed.file_id)
            .unwrap()
            .staged
            .unwrap()
            .contains("foreign")
    );
    let deleted = status
        .files
        .iter()
        .find(|file| file.path == "case [one].md")
        .unwrap();
    assert!(
        service
            .git_diff(&session, &deleted.file_id)
            .unwrap()
            .working_tree
            .unwrap()
            .contains("-original")
    );
    let binary = status
        .files
        .iter()
        .find(|file| file.path == "binary.bin")
        .unwrap();
    assert!(service.git_diff(&session, &binary.file_id).unwrap().binary);
    for path in [
        "executed.txt",
        "executed-process.txt",
        "executed-monitor.txt",
        "executed-diff.txt",
        "executed-textconv.txt",
    ] {
        assert!(!root.join(path).exists(), "{path}");
    }
}
#[test]
fn local_tracking_counts_and_unmerged_files_are_reported() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let (service, session) = fixture(root, true);
    let original_branch = git(root, &["branch", "--show-current"]).trim().to_owned();
    git(root, &["branch", "upstream-fixture"]);
    git(root, &["branch", "--set-upstream-to=upstream-fixture"]);
    fs::write(root.join("case [one].md"), "ours\n").unwrap();
    git(root, &["add", "--", "case [one].md"]);
    git(root, &["commit", "--quiet", "-m", "ours"]);
    let status = service.git_status(&session).unwrap();
    assert_eq!(status.ahead, Some(1));
    assert_eq!(status.behind, Some(0));
    git(root, &["checkout", "--quiet", "upstream-fixture"]);
    fs::write(root.join("case [one].md"), "theirs\n").unwrap();
    git(root, &["add", "--", "case [one].md"]);
    git(root, &["commit", "--quiet", "-m", "theirs"]);
    git(root, &["checkout", "--quiet", &original_branch]);
    assert!(
        !Command::new("git")
            .args(["merge", "--no-edit", "upstream-fixture"])
            .current_dir(root)
            .output()
            .unwrap()
            .status
            .success()
    );
    let status = service.git_status(&session).unwrap();
    let conflict = status.files.iter().find(|file| file.unmerged).unwrap();
    let index = fs::read(root.join(".git/index")).unwrap();
    assert!(
        service
            .git_diff(&session, &conflict.file_id)
            .unwrap()
            .unmerged
    );
    assert_eq!(index, fs::read(root.join(".git/index")).unwrap());
    assert!(root.join(".git/MERGE_HEAD").exists());
}

#[test]
fn stale_state_oversized_preview_and_path_injection_are_rejected() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    let (service, session) = fixture(root, true);
    fs::write(root.join("case [one].md"), "changed\n").unwrap();
    fs::write(root.join("large.txt"), vec![b'a'; MAX_DIFF_BYTES + 1]).unwrap();
    let status = service.git_status(&session).unwrap();
    let changed = status
        .files
        .iter()
        .find(|file| file.path == "case [one].md")
        .unwrap();
    let large = status
        .files
        .iter()
        .find(|file| file.path == "large.txt")
        .unwrap();
    assert_eq!(
        service.git_diff(&session, &large.file_id).unwrap_err().code,
        RepositoryErrorCode::GitOutputTooLarge
    );
    fs::write(root.join("case [one].md"), "original\n").unwrap();
    assert_eq!(
        service
            .git_diff(&session, &changed.file_id)
            .unwrap_err()
            .code,
        RepositoryErrorCode::StaleResource
    );
    for path in [
        "../outside",
        "/absolute",
        ".git/config",
        "folder/../outside",
        "C:/private",
        "folder\\private",
    ] {
        assert!(
            validate_path(&RepoRoot(root.to_path_buf()), path).is_err(),
            "{path}"
        );
    }
    assert_eq!(
        service.git_diff(&session, "../outside").unwrap_err().code,
        RepositoryErrorCode::InvalidResource
    );
}

#[test]
fn diff_refuses_a_registered_file_whose_parent_now_escapes_the_repository() {
    let temp = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    let root = temp.path();
    let (service, session) = fixture(root, true);
    fs::create_dir(root.join("nested")).unwrap();
    fs::write(root.join("nested/case.md"), "base\n").unwrap();
    git(root, &["add", "--", "nested/case.md"]);
    git(root, &["commit", "--quiet", "-m", "nested"]);
    fs::write(root.join("nested/case.md"), "edited\n").unwrap();
    let status = service.git_status(&session).unwrap();
    let file = status
        .files
        .iter()
        .find(|file| file.path == "nested/case.md")
        .unwrap();
    fs::rename(root.join("nested"), root.join("original-nested")).unwrap();
    fs::write(outside.path().join("case.md"), "private content\n").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(outside.path(), root.join("nested")).unwrap();
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        if std::os::windows::fs::symlink_dir(outside.path(), root.join("nested")).is_err() {
            assert!(
                Command::new("cmd.exe")
                    .creation_flags(0x0800_0000)
                    .args(["/d", "/c", "mklink", "/J"])
                    .arg(root.join("nested"))
                    .arg(outside.path())
                    .output()
                    .unwrap()
                    .status
                    .success()
            );
        }
    }
    assert_eq!(
        service.git_diff(&session, &file.file_id).unwrap_err().code,
        RepositoryErrorCode::PathEscapesRepository
    );
}
