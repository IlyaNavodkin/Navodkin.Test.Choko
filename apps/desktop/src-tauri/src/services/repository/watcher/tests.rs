use super::*;
use std::sync::mpsc;
#[test]
fn native_create_edit_rename_delete_config_and_lifecycle() {
    let temp = tempfile::tempdir().unwrap();
    let root = fs::canonicalize(temp.path()).unwrap();
    let (tx, rx) = mpsc::channel();
    let watch = RepositoryWatcher::start(
        &root,
        uuid::Uuid::new_v4().to_string(),
        Arc::new(move |event| {
            tx.send(event).unwrap();
        }),
    )
    .unwrap();
    let file = root.join("case.md");
    fs::write(&file, "one").unwrap();
    let first = rx.recv_timeout(Duration::from_secs(5)).unwrap();
    assert_eq!(first.kind, "content");
    for n in 0..30 {
        fs::write(&file, n.to_string()).unwrap();
    }
    let edit = rx.recv_timeout(Duration::from_secs(5)).unwrap();
    assert!(edit.epoch > first.epoch);
    assert!(rx.recv_timeout(Duration::from_millis(400)).is_err());
    fs::rename(&file, root.join("renamed.md")).unwrap();
    assert_eq!(
        rx.recv_timeout(Duration::from_secs(5)).unwrap().kind,
        "content"
    );
    fs::remove_file(root.join("renamed.md")).unwrap();
    assert_eq!(
        rx.recv_timeout(Duration::from_secs(5)).unwrap().kind,
        "content"
    );
    fs::create_dir(root.join(".casewright")).unwrap();
    fs::write(root.join(".casewright/config.yaml"), "version: 1").unwrap();
    assert_eq!(
        rx.recv_timeout(Duration::from_secs(5)).unwrap().kind,
        "metadata"
    );
    fs::write(&file, "pending").unwrap();
    drop(watch);
    fs::write(&file, "closed").unwrap();
    assert!(rx.recv_timeout(Duration::from_millis(500)).is_err());
}
#[test]
fn outside_paths_noise_rescan_and_errors_are_sanitized() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    assert_eq!(classify_path(root, &root.join("target/case.md")), CONTENT);
    assert_eq!(
        classify_path(root, &root.join(".casewright/cache/entry")),
        0
    );
    let removed = Event::new(EventKind::Remove(notify::event::RemoveKind::Folder))
        .add_path(root.to_path_buf());
    assert_eq!(classify(root, &Ok(removed)), ERROR | RESCAN);
    assert_eq!(classify_path(root, &root.join(".git/objects/ab/file")), 0);
    for path in [
        ".git/HEAD",
        ".git/index",
        ".git/config",
        ".git/refs/heads/main",
    ] {
        assert_eq!(classify_path(root, &root.join(path)), GIT);
    }
    assert_eq!(classify_path(root, &root.join("../outside.md")), 0);
    assert_eq!(classify_path(root, &root.with_extension("outside")), 0);
    assert_eq!(
        classify(root, &Err(notify::Error::generic("secret absolute path"))),
        ERROR | RESCAN
    );
    let event = Event::new(EventKind::Other).set_flag(notify::event::Flag::Rescan);
    assert_eq!(classify(root, &Ok(event)), RESCAN);
}
#[cfg(unix)]
#[test]
fn symlink_target_is_never_followed() {
    let root = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink(outside.path(), root.path().join("link")).unwrap();
    assert_eq!(
        classify_path(root.path(), &root.path().join("link/secret.md")),
        0
    );
}
