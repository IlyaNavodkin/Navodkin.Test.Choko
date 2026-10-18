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
struct Fixture {
    _temp: tempfile::TempDir,
    a: std::path::PathBuf,
    b: std::path::PathBuf,
    service: RepositoryService,
    sa: String,
    sb: String,
}
fn fixture() -> Fixture {
    let temp = tempfile::tempdir().unwrap();
    let a = temp.path().join("a");
    let b = temp.path().join("b");
    fs::create_dir(&a).unwrap();
    git(temp.path(), &["init", "--bare", "--quiet", "remote.git"]);
    git(&a, &["init", "--quiet", "-b", "main"]);
    identity(&a);
    fs::create_dir(a.join(".casewright")).unwrap();
    fs::write(
        a.join(".casewright/config.yaml"),
        "version: 1\nworkspaces:\n  - .\n",
    )
    .unwrap();
    fs::write(
        a.join("case.md"),
        "---\nid: stable\ntitle: Case\n---\n\n## Objective\nOriginal\n",
    )
    .unwrap();
    git(&a, &["add", "."]);
    git(&a, &["commit", "--quiet", "-m", "base"]);
    git(
        &a,
        &[
            "remote",
            "add",
            "origin",
            temp.path().join("remote.git").to_str().unwrap(),
        ],
    );
    git(&a, &["push", "--quiet", "-u", "origin", "main"]);
    git(
        temp.path(),
        &["clone", "--quiet", "-b", "main", "remote.git", "b"],
    );
    identity(&b);
    let service = RepositoryService::default();
    let sa = service.open(&a).unwrap().session_id;
    let sb = service.open(&b).unwrap().session_id;
    Fixture {
        _temp: temp,
        a,
        b,
        service,
        sa,
        sb,
    }
}
fn identity(root: &Path) {
    git(root, &["config", "user.name", "Fixture"]);
    git(root, &["config", "user.email", "fixture@example.invalid"]);
    git(root, &["config", "commit.gpgSign", "false"]);
}
fn sync(f: &Fixture, session: &str, action: GitSyncAction) -> Result<GitSyncDto, RepositoryError> {
    let status = f.service.git_status(session).unwrap();
    f.service
        .git_sync(session, &status.sync_token.unwrap(), action)
}
fn edit_commit(f: &Fixture, root: &Path, session: &str, text: &str) {
    let original = fs::read_to_string(root.join("case.md")).unwrap();
    fs::write(root.join("case.md"), original.replace("Original", text)).unwrap();
    let status = f.service.git_status(session).unwrap();
    let id = status
        .files
        .iter()
        .find(|file| file.path == "case.md")
        .unwrap()
        .file_id
        .clone();
    f.service.git_commit(session, &[id], "case").unwrap();
}
#[test]
fn scoped_commit_push_pull_two_clones_preserves_stable_case() {
    let f = fixture();
    edit_commit(&f, &f.a, &f.sa, "Shared");
    assert_eq!(
        sync(&f, &f.sa, GitSyncAction::Push).unwrap().outcome,
        "pushed"
    );
    let result = sync(&f, &f.sb, GitSyncAction::Pull).unwrap();
    assert_eq!(result.outcome, "pulled");
    assert!(result.repository.is_some());
    assert!(!result.reload_required);
    let status = f.service.git_status(&f.sb).unwrap();
    assert_eq!(status.ahead, Some(0));
    assert_eq!(status.behind, Some(0));
    assert_eq!(
        git(&f.b, &["rev-parse", "HEAD"]),
        git(&f.b, &["rev-parse", "refs/remotes/origin/main"])
    );
    let case = fs::read_to_string(f.b.join("case.md")).unwrap();
    assert!(case.contains("id: stable"));
    assert!(case.contains("Shared"));
}
fn conflict(f: &Fixture) -> GitSyncDto {
    edit_commit(f, &f.a, &f.sa, "A");
    edit_commit(f, &f.b, &f.sb, "B");
    sync(f, &f.sa, GitSyncAction::Push).unwrap();
    let result = sync(f, &f.sb, GitSyncAction::Pull).unwrap();
    assert_eq!(result.outcome, "conflict");
    assert_eq!(result.unmerged_paths, ["case.md"]);
    result
}
#[test]
fn conflict_is_reported_and_explicit_abort_preserves_local_commit_and_new_untracked_work() {
    let f = fixture();
    let baseline = git(&f.b, &["rev-parse", "HEAD"]); // baseline updated below by own commit
    let result = conflict(&f);
    let local_head = git(&f.b, &["rev-parse", "HEAD"]);
    assert_ne!(baseline, local_head);
    let status = f.service.git_status(&f.sb).unwrap();
    assert_eq!(status.abort_token, result.abort_token);
    fs::write(f.b.join("new-work.txt"), "keep").unwrap();
    let aborted = f
        .service
        .git_sync(
            &f.sb,
            result.abort_token.as_ref().unwrap(),
            GitSyncAction::Abort,
        )
        .unwrap();
    assert_eq!(aborted.outcome, "aborted");
    assert_eq!(git(&f.b, &["rev-parse", "HEAD"]), local_head);
    assert!(
        fs::read_to_string(f.b.join("case.md"))
            .unwrap()
            .lines()
            .any(|line| line == "B")
    );
    assert_eq!(
        fs::read_to_string(f.b.join("new-work.txt")).unwrap(),
        "keep"
    );
    assert!(!f.b.join(".git/MERGE_HEAD").exists());
}
#[test]
fn changed_conflict_refuses_abort_without_touching_bytes_and_still_reports_status() {
    let f = fixture();
    let result = conflict(&f);
    fs::write(f.b.join("case.md"), "external work").unwrap();
    let index = fs::read(f.b.join(".git/index")).unwrap();
    let merge = fs::read(f.b.join(".git/MERGE_HEAD")).unwrap();
    assert_eq!(
        f.service
            .git_sync(
                &f.sb,
                result.abort_token.as_ref().unwrap(),
                GitSyncAction::Abort
            )
            .unwrap_err()
            .code,
        RepositoryErrorCode::GitAbortFailed
    );
    assert_eq!(fs::read(f.b.join("case.md")).unwrap(), b"external work");
    assert_eq!(fs::read(f.b.join(".git/index")).unwrap(), index);
    assert_eq!(fs::read(f.b.join(".git/MERGE_HEAD")).unwrap(), merge);
    assert!(
        f.service
            .git_status(&f.sb)
            .unwrap()
            .files
            .iter()
            .any(|file| file.unmerged)
    );
}
#[test]
fn abort_preflight_lock_refusal_keeps_conflict_and_ownership() {
    let f = fixture();
    let result = conflict(&f);
    fs::write(f.b.join(".git/HEAD.lock"), "external lock").unwrap();
    let bytes = fs::read(f.b.join("case.md")).unwrap();
    let index = fs::read(f.b.join(".git/index")).unwrap();
    assert_eq!(
        f.service
            .git_sync(
                &f.sb,
                result.abort_token.as_ref().unwrap(),
                GitSyncAction::Abort
            )
            .unwrap_err()
            .code,
        RepositoryErrorCode::GitAbortFailed
    );
    assert_eq!(fs::read(f.b.join("case.md")).unwrap(), bytes);
    assert_eq!(fs::read(f.b.join(".git/index")).unwrap(), index);
    assert!(f.service.git_status(&f.sb).unwrap().abort_token.is_some());
}
#[test]
fn rejected_push_keeps_local_commits() {
    let f = fixture();
    edit_commit(&f, &f.a, &f.sa, "A");
    edit_commit(&f, &f.b, &f.sb, "B");
    sync(&f, &f.sa, GitSyncAction::Push).unwrap();
    let head = git(&f.b, &["rev-parse", "HEAD"]);
    assert_eq!(
        sync(&f, &f.sb, GitSyncAction::Push).unwrap_err().code,
        RepositoryErrorCode::GitPushRejected
    );
    assert_eq!(git(&f.b, &["rev-parse", "HEAD"]), head);
}
#[test]
fn dirty_index_and_worktree_are_unchanged() {
    let f = fixture();
    fs::write(f.b.join("case.md"), "staged").unwrap();
    git(&f.b, &["add", "case.md"]);
    fs::write(f.b.join("case.md"), "worktree").unwrap();
    let index = fs::read(f.b.join(".git/index")).unwrap();
    assert_eq!(
        sync(&f, &f.sb, GitSyncAction::Pull).unwrap_err().code,
        RepositoryErrorCode::GitDirty
    );
    assert_eq!(fs::read(f.b.join(".git/index")).unwrap(), index);
    assert_eq!(fs::read(f.b.join("case.md")).unwrap(), b"worktree");
}
#[test]
fn no_upstream_and_stale_confirmation_are_rejected() {
    let f = fixture();
    git(&f.b, &["branch", "--unset-upstream"]);
    assert_eq!(
        sync(&f, &f.sb, GitSyncAction::Push).unwrap_err().code,
        RepositoryErrorCode::GitNoUpstream
    );
    let status = f.service.git_status(&f.sa).unwrap();
    git(&f.a, &["config", "user.name", "Changed"]);
    assert_eq!(
        f.service
            .git_sync(&f.sa, &status.sync_token.unwrap(), GitSyncAction::Pull)
            .unwrap_err()
            .code,
        RepositoryErrorCode::StaleResource
    );
    git(&f.b, &["checkout", "--detach", "--quiet"]);
    assert!(f.service.git_status(&f.sb).unwrap().sync_token.is_none());
}
#[test]
fn ignored_file_is_never_overwritten_by_pull() {
    let f = fixture();
    fs::write(f.b.join(".git/info/exclude"), "ignored.txt\n").unwrap();
    fs::write(f.b.join("ignored.txt"), "sentinel").unwrap();
    fs::write(f.a.join("ignored.txt"), "remote").unwrap();
    git(&f.a, &["add", "ignored.txt"]);
    git(&f.a, &["commit", "--quiet", "-m", "incoming"]);
    sync(&f, &f.sa, GitSyncAction::Push).unwrap();
    let head = git(&f.b, &["rev-parse", "HEAD"]);
    assert!(sync(&f, &f.sb, GitSyncAction::Pull).is_err());
    assert_eq!(fs::read(f.b.join("ignored.txt")).unwrap(), b"sentinel");
    assert_eq!(git(&f.b, &["rev-parse", "HEAD"]), head);
}
#[test]
fn missing_local_remote_is_sanitized() {
    let f = fixture();
    git(
        &f.b,
        &["remote", "set-url", "origin", "missing-secret-remote"],
    );
    let error = sync(&f, &f.sb, GitSyncAction::Pull).unwrap_err();
    assert_eq!(error.code, RepositoryErrorCode::GitRemoteFailed);
    assert!(!error.message.contains("secret"));
}
#[test]
fn configured_hooks_filters_mirror_and_rewrites_refuse_before_network() {
    for (key, value) in [
        ("core.sshCommand", "arbitrary-command"),
        ("remote.origin.mirror", "true"),
        ("url.ext::evil.insteadOf", "https:"),
    ] {
        let f = fixture();
        git(&f.b, &["config", key, value]);
        let head = git(&f.b, &["rev-parse", "HEAD"]);
        assert_eq!(
            sync(&f, &f.sb, GitSyncAction::Pull).unwrap_err().code,
            RepositoryErrorCode::GitSyncBlocked
        );
        assert_eq!(git(&f.b, &["rev-parse", "HEAD"]), head);
    }
}

#[test]
fn active_filters_and_hooks_are_refused_without_execution() {
    let f = fixture();
    fs::write(f.b.join(".git/info/attributes"), "*.md filter=evil\n").unwrap();
    git(&f.b, &["config", "filter.evil.clean", "does-not-execute"]);
    assert_eq!(
        sync(&f, &f.sb, GitSyncAction::Pull).unwrap_err().code,
        RepositoryErrorCode::GitSyncBlocked
    );
    fs::remove_file(f.b.join(".git/info/attributes")).unwrap();
    fs::write(f.b.join(".git/hooks/pre-merge-commit"), "does-not-execute").unwrap();
    assert_eq!(
        sync(&f, &f.sb, GitSyncAction::Pull).unwrap_err().code,
        RepositoryErrorCode::GitSyncBlocked
    );
}
#[test]
fn deleted_baseline_path_external_work_refuses_abort() {
    let f = fixture();
    fs::write(f.a.join("old.md"), "baseline").unwrap();
    git(&f.a, &["add", "old.md"]);
    git(&f.a, &["commit", "--quiet", "-m", "old"]);
    sync(&f, &f.sa, GitSyncAction::Push).unwrap();
    sync(&f, &f.sb, GitSyncAction::Pull).unwrap();
    edit_commit(&f, &f.a, &f.sa, "A");
    git(&f.a, &["rm", "old.md"]);
    git(&f.a, &["commit", "--quiet", "-m", "delete"]);
    edit_commit(&f, &f.b, &f.sb, "B");
    sync(&f, &f.sa, GitSyncAction::Push).unwrap();
    let result = sync(&f, &f.sb, GitSyncAction::Pull).unwrap();
    assert_eq!(result.outcome, "conflict");
    assert!(!f.b.join("old.md").exists());
    fs::write(f.b.join("old.md"), "new external work").unwrap();
    assert_eq!(
        f.service
            .git_sync(
                &f.sb,
                result.abort_token.as_ref().unwrap(),
                GitSyncAction::Abort
            )
            .unwrap_err()
            .code,
        RepositoryErrorCode::GitAbortFailed
    );
    assert_eq!(fs::read(f.b.join("old.md")).unwrap(), b"new external work");
}
#[test]
fn actual_native_abort_error_is_sanitized_and_blocks_flow() {
    let f = fixture();
    let result = conflict(&f);
    let bytes = fs::read(f.b.join("case.md")).unwrap();
    let mut sessions = f.service.sessions.lock().unwrap();
    let session = sessions.by_id.get_mut(&f.sb).unwrap();
    let executable = git::find_git_executable(&session.root.0).unwrap();
    let error = abort_command(
        session,
        &executable,
        result.abort_token.as_ref().unwrap(),
        &["merge", "--abort", "--invalid-fixture-option"],
    )
    .unwrap_err();
    assert_eq!(error.code, RepositoryErrorCode::GitAbortFailed);
    assert!(session.git_merge.is_some());
    assert_eq!(fs::read(f.b.join("case.md")).unwrap(), bytes);
}

#[test]
fn oversized_tracked_asset_refuses_before_pull() {
    let f = fixture();
    let file = fs::File::create(f.b.join("large.bin")).unwrap();
    file.set_len(HASH_BUDGET + 1).unwrap();
    git(&f.b, &["add", "large.bin"]);
    git(&f.b, &["commit", "--quiet", "-m", "large"]);
    let head = git(&f.b, &["rev-parse", "HEAD"]);
    assert_eq!(
        sync(&f, &f.sb, GitSyncAction::Pull).unwrap_err().code,
        RepositoryErrorCode::GitSyncBlocked
    );
    assert_eq!(git(&f.b, &["rev-parse", "HEAD"]), head);
}

#[test]
fn divergent_clean_merge_checks_identity_then_retains_both_histories() {
    let f = fixture();
    edit_commit(&f, &f.a, &f.sa, "Shared");
    sync(&f, &f.sa, GitSyncAction::Push).unwrap();
    fs::write(f.b.join("local.txt"), "local committed work").unwrap();
    git(&f.b, &["add", "local.txt"]);
    git(&f.b, &["commit", "--quiet", "-m", "local work"]);
    let baseline = git(&f.b, &["rev-parse", "HEAD"]);
    let index = fs::read(f.b.join(".git/index")).unwrap();
    git(&f.b, &["config", "user.name", ""]);
    assert_eq!(
        sync(&f, &f.sb, GitSyncAction::Pull).unwrap_err().code,
        RepositoryErrorCode::GitIdentityMissing
    );
    assert_eq!(git(&f.b, &["rev-parse", "HEAD"]), baseline);
    assert_eq!(fs::read(f.b.join(".git/index")).unwrap(), index);
    assert!(!f.b.join(".git/MERGE_HEAD").exists());
    identity(&f.b);
    assert_eq!(
        sync(&f, &f.sb, GitSyncAction::Pull).unwrap().outcome,
        "pulled"
    );
    assert_eq!(
        git(&f.b, &["rev-list", "--parents", "-n", "1", "HEAD"])
            .split_whitespace()
            .count(),
        3
    );
    assert_eq!(
        fs::read(f.b.join("local.txt")).unwrap(),
        b"local committed work"
    );
    assert!(
        fs::read_to_string(f.b.join("case.md"))
            .unwrap()
            .contains("Shared")
    );
}
