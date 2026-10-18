use super::{
    ManifestEntry, Path, RepoSession, RepositoryError, RepositoryErrorCode, SuiteAction,
    SuiteApplyResult, SuitePlan, SuiteRecovery, Uuid, atomic, blocked, classify, error, guarded,
    io, no_entry, same_manifest, scan, valid_path,
};
use serde_json::json;

fn mapped(source: &str, destination: &str, path: &str) -> Result<String, RepositoryError> {
    let tail = path.strip_prefix(source).ok_or_else(blocked)?;
    let result = format!("{destination}{tail}");
    if !valid_path(&result) {
        return Err(blocked());
    }
    Ok(result)
}
fn original_manifest(
    plan: &SuitePlan,
    root: &Path,
    current: &str,
) -> Result<bool, RepositoryError> {
    let mut actual = scan(root, current, false)?;
    classify(&mut actual);
    for entry in &mut actual {
        entry.path = mapped(current, &plan.preview.source_path, &entry.path)?;
    }
    let expected: Vec<_> = plan
        .preview
        .entries
        .iter()
        .filter(|entry| {
            entry.path == plan.preview.source_path
                || entry
                    .path
                    .starts_with(&format!("{}/", plan.preview.source_path))
        })
        .cloned()
        .collect();
    Ok(same_manifest(&expected, &actual))
}
fn journal_bytes(
    plan: &SuitePlan,
    phase: &str,
    removed: usize,
) -> Result<Vec<u8>, RepositoryError> {
    serde_json::to_vec_pretty(&json!({ "version":1, "phase":phase, "sourcePath":plan.preview.source_path, "destinationPath":plan.preview.destination_path, "permanentDelete":plan.preview.permanent_delete, "entries":plan.preview.entries, "removedCount":removed })).map_err(|_| blocked())
}
fn update_journal(
    root: &Path,
    tx: &str,
    plan: &SuitePlan,
    phase: &str,
    removed: usize,
) -> Result<(), RepositoryError> {
    let path = root.join(tx).join("journal.json");
    let old = guarded::read_regular(&path).map_err(|_| blocked())?;
    let next = journal_bytes(plan, phase, removed)?;
    if !atomic::replace(&path, &atomic::revision(&old), &next).map_err(|_| blocked())? {
        return Err(blocked());
    }
    Ok(())
}
fn remove_journal(root: &Path, tx: &str) -> Result<(), RepositoryError> {
    let directory = root.join(tx);
    if guarded::children(&directory).map_err(|_| blocked())? != ["journal.json"] {
        return Err(blocked());
    }
    let path = directory.join("journal.json");
    let bytes = guarded::read_regular(&path).map_err(|_| blocked())?;
    if !atomic::organize(&path, &atomic::revision(&bytes), None).map_err(|_| blocked())? {
        return Err(blocked());
    }
    if guarded::remove_empty(&directory).is_err() {
        let _ = atomic::create(&path, &bytes, None);
        return Err(blocked());
    }
    Ok(())
}
fn relocate(
    root: &Path,
    from: &str,
    to: &str,
    verify: impl FnOnce() -> Result<bool, RepositoryError>,
) -> Result<(), RepositoryError> {
    if !guarded::relocate(&root.join(from), &root.join(to), || {
        verify().map_err(|_| io::Error::other("stale tree"))
    })
    .map_err(|_| blocked())?
    {
        return Err(error(RepositoryErrorCode::ExternalChange));
    }
    Ok(())
}
fn relocate_note(
    root: &Path,
    from: &str,
    to: &str,
    plan: &SuitePlan,
) -> Result<(), RepositoryError> {
    if let Some(note) = plan
        .preview
        .entries
        .iter()
        .find(|entry| entry.path == format!("{}.md", plan.preview.source_path))
        && !atomic::organize(
            &root.join(format!("{from}.md")),
            &note.revision,
            Some(&root.join(format!("{to}.md"))),
        )
        .map_err(|_| blocked())?
    {
        return Err(error(RepositoryErrorCode::ExternalChange));
    }
    Ok(())
}
fn deletion_entries(
    plan: &SuitePlan,
    root: &Path,
    current: &str,
) -> Result<Vec<guarded::DeleteEntry>, RepositoryError> {
    let mut entries = Vec::new();
    for item in &plan.preview.entries {
        entries.push(guarded::DeleteEntry {
            path: root.join(mapped(&plan.preview.source_path, current, &item.path)?),
            revision: (item.kind != "directory").then(|| item.revision.clone()),
            directory_revision: (item.kind == "directory").then(|| item.revision.clone()),
        });
    }
    // Parents first for capture; files and deepest children first for the later removal phase.
    entries.sort_by_key(|entry| (entry.revision.is_some(), entry.path.components().count()));
    Ok(entries)
}
fn cleanup_owned_tree(
    root: &Path,
    path: &str,
    ledger: &std::collections::BTreeMap<String, ManifestEntry>,
) -> Result<(), RepositoryError> {
    let actual = scan(root, path, true)?;
    let expected: Vec<_> = ledger.values().collect();
    // Never adopt newly discovered files as owned cleanup targets.
    if actual.iter().any(|entry| {
        !expected.iter().any(|known| {
            known.path == entry.path
                && known.identity == entry.identity
                && (entry.kind == "directory" && known.kind == "directory"
                    || entry.kind != "directory"
                        && known.kind != "directory"
                        && entry.revision == known.revision)
        })
    }) {
        return Err(blocked());
    }
    let mut list: Vec<_> = actual
        .iter()
        .map(|entry| guarded::DeleteEntry {
            path: root.join(&entry.path),
            revision: (entry.kind != "directory").then(|| entry.revision.clone()),
            directory_revision: (entry.kind == "directory").then(|| entry.revision.clone()),
        })
        .collect();
    list.sort_by_key(|entry| (entry.revision.is_some(), entry.path.components().count()));
    let mut batch = guarded::DeleteBatch::capture(&list).map_err(|_| blocked())?;
    for index in (0..list.len()).rev() {
        batch
            .remove(index, list[index].revision.as_deref())
            .map_err(|_| blocked())?;
    }
    Ok(())
}
fn duplicate(
    root: &Path,
    tx_tree: &str,
    plan: &SuitePlan,
    ledger: &mut std::collections::BTreeMap<String, ManifestEntry>,
) -> Result<(), RepositoryError> {
    for entry in &plan.preview.entries {
        let target = mapped(&plan.preview.source_path, tx_tree, &entry.path)?;
        let path = root.join(&target);
        if entry.kind == "directory" {
            let (parent, name) = target.rsplit_once('/').ok_or_else(blocked)?;
            if !atomic::publish_directory(&root.join(parent), name, &[], || Ok(true))
                .map_err(|_| blocked())?
            {
                return Err(blocked());
            }
        } else {
            atomic::create(&path, &entry.bytes, Some(&root.join(&entry.path)))
                .map_err(|_| blocked())?;
        }
        let mut copied = entry.clone();
        copied.path.clone_from(&target);
        copied.identity =
            guarded::object_identity(&path, entry.kind == "directory").map_err(|_| blocked())?;
        if entry.kind != "directory" {
            copied.revision = atomic::revision(&entry.bytes);
        }
        ledger.insert(target, copied);
    }
    if !original_manifest(plan, root, &plan.preview.source_path)? {
        return Err(error(RepositoryErrorCode::ExternalChange));
    }
    for note in plan
        .preview
        .entries
        .iter()
        .filter(|entry| entry.path == format!("{}.md", plan.preview.source_path))
    {
        if atomic::revision(&guarded::read_regular(&root.join(&note.path)).map_err(|_| blocked())?)
            != note.revision
        {
            return Err(error(RepositoryErrorCode::ExternalChange));
        }
    }
    // Verify every staged file before publishing; directories keep original names/order keys.
    for entry in &plan.preview.entries {
        if entry.kind != "directory"
            && guarded::read_regular(&root.join(mapped(
                &plan.preview.source_path,
                tx_tree,
                &entry.path,
            )?))
            .map_err(|_| blocked())?
                != entry.bytes
        {
            return Err(blocked());
        }
    }
    Ok(())
}
fn copied_manifest(
    root: &Path,
    current: &str,
    old: &str,
    ledger: &std::collections::BTreeMap<String, ManifestEntry>,
    with_note: bool,
) -> Result<bool, RepositoryError> {
    let actual = scan(root, current, with_note)?;
    let expected: Vec<_> = ledger
        .values()
        .filter(|entry| {
            with_note || entry.path == old || entry.path.starts_with(&format!("{old}/"))
        })
        .collect();
    Ok(actual.len() == expected.len()
        && actual.iter().all(|entry| {
            expected.iter().any(|known| {
                mapped(old, current, &known.path).is_ok_and(|path| path == entry.path)
                    && known.identity == entry.identity
                    && ((known.kind == "directory" && entry.kind == "directory")
                        || (known.kind != "directory"
                            && entry.kind != "directory"
                            && known.revision == entry.revision))
            })
        }))
}
fn recovery(
    session: &mut RepoSession,
    tx: &str,
    plan: &SuitePlan,
    removed: Vec<String>,
) -> SuiteApplyResult {
    session.suite_recovery = Some(tx.into());
    session.opened.warnings.push(super::super::RepositoryWarning {code:super::super::RepositoryWarningCode::SuiteRecoveryRequired,message:format!("Незавершённая операция с папкой: {tx}. Запись заблокирована; проверьте journal и оставшиеся файлы.")});
    let mut remaining = Vec::new();
    for base in [
        Some(format!("{tx}/tree")),
        plan.preview.destination_path.clone(),
        Some(plan.preview.source_path.clone()),
    ]
    .into_iter()
    .flatten()
    {
        if let Ok(entries) = scan(&session.root.0, &base, true) {
            remaining.extend(entries.into_iter().map(|entry| entry.path));
        } else {
            if !no_entry(&session.root.0.join(&base)) {
                remaining.push(base.clone());
            }
            if !no_entry(&session.root.0.join(format!("{base}.md"))) {
                remaining.push(format!("{base}.md"));
            }
        }
    }
    remaining.push(format!("{tx}/journal.json"));
    remaining.sort();
    remaining.dedup();
    SuiteApplyResult {
        outcome: "recoveryRequired",
        path: None,
        recovery: Some(SuiteRecovery {
            transaction_path: tx.into(),
            removed_paths: removed,
            remaining_paths: remaining,
        }),
    }
}
struct Transaction<'a> {
    root: std::path::PathBuf,
    tx: String,
    tree: String,
    plan: &'a SuitePlan,
    removed: Vec<String>,
    published: bool,
    ledger: std::collections::BTreeMap<String, ManifestEntry>,
}
impl Transaction<'_> {
    fn stage(&mut self) -> Result<(), RepositoryError> {
        if matches!(self.plan.action, SuiteAction::Duplicate { .. }) {
            duplicate(&self.root, &self.tree, self.plan, &mut self.ledger)?;
        } else {
            relocate(
                &self.root,
                &self.plan.preview.source_path,
                &self.tree,
                || original_manifest(self.plan, &self.root, &self.plan.preview.source_path),
            )?;
            relocate_note(
                &self.root,
                &self.plan.preview.source_path,
                &self.tree,
                self.plan,
            )?;
            if !original_manifest(self.plan, &self.root, &self.tree)? {
                return Err(error(RepositoryErrorCode::ExternalChange));
            }
        }
        update_journal(&self.root, &self.tx, self.plan, "quarantined", 0)?;
        checkpoint("afterQuarantine", &self.root, &self.tx)
    }
    fn delete(&mut self) -> Result<(), RepositoryError> {
        let entries = deletion_entries(self.plan, &self.root, &self.tree)?;
        let mut batch = guarded::DeleteBatch::capture(&entries).map_err(|_| blocked())?;
        for index in (0..entries.len()).rev() {
            batch
                .remove(index, entries[index].revision.as_deref())
                .map_err(|_| blocked())?;
            let current = entries[index]
                .path
                .strip_prefix(&self.root)
                .map_err(|_| blocked())?
                .to_string_lossy()
                .replace('\\', "/");
            self.removed.push(mapped(
                &self.tree,
                &self.plan.preview.source_path,
                &current,
            )?);
            checkpoint("afterUnlink", &self.root, &self.tx)?;
            update_journal(
                &self.root,
                &self.tx,
                self.plan,
                "deleting",
                self.removed.len(),
            )?;
        }
        Ok(())
    }
    fn publish(&mut self) -> Result<(), RepositoryError> {
        checkpoint("beforePublish", &self.root, &self.tx)?;
        let target = self
            .plan
            .preview
            .destination_path
            .as_ref()
            .ok_or_else(blocked)?;
        let is_copy = matches!(self.plan.action, SuiteAction::Duplicate { .. });
        relocate(&self.root, &self.tree, target, || {
            if is_copy {
                copied_manifest(&self.root, &self.tree, &self.tree, &self.ledger, false)
            } else {
                original_manifest(self.plan, &self.root, &self.tree)
            }
        })?;
        self.published = true;
        if is_copy {
            if !no_entry(&self.root.join(format!("{}.md", self.tree))) {
                let path = self.root.join(format!("{}.md", self.tree));
                let note = guarded::read_regular(&path).map_err(|_| blocked())?;
                if !atomic::organize(
                    &path,
                    &atomic::revision(&note),
                    Some(&self.root.join(format!("{target}.md"))),
                )
                .map_err(|_| blocked())?
                {
                    return Err(blocked());
                }
            }
        } else {
            relocate_note(&self.root, &self.tree, target, self.plan)?;
        }
        let verified = if is_copy {
            copied_manifest(&self.root, target, &self.tree, &self.ledger, true)?
        } else {
            original_manifest(self.plan, &self.root, target)?
        };
        if !verified {
            return Err(error(RepositoryErrorCode::ExternalChange));
        }
        Ok(())
    }
    fn execute(&mut self) -> Result<(), RepositoryError> {
        self.stage()?;
        if matches!(self.plan.action, SuiteAction::Delete) {
            self.delete()?;
        } else {
            self.publish()?;
        }
        update_journal(
            &self.root,
            &self.tx,
            self.plan,
            "committed",
            self.removed.len(),
        )?;
        checkpoint("beforeCleanup", &self.root, &self.tx)?;
        remove_journal(&self.root, &self.tx)
    }
    fn rollback(&self) -> bool {
        if matches!(self.plan.action, SuiteAction::Duplicate { .. }) {
            return !self.published
                && (no_entry(&self.root.join(&self.tree))
                    || cleanup_owned_tree(&self.root, &self.tree, &self.ledger).is_ok())
                && remove_journal(&self.root, &self.tx).is_ok();
        }
        let source = &self.plan.preview.source_path;
        let location = if self.published {
            self.plan
                .preview
                .destination_path
                .as_deref()
                .unwrap_or(&self.tree)
        } else {
            &self.tree
        };
        let restored = if no_entry(&self.root.join(source)) {
            relocate(&self.root, location, source, || {
                original_manifest(self.plan, &self.root, location)
            })
            .is_ok()
        } else {
            original_manifest(self.plan, &self.root, source).unwrap_or(false)
        };
        let source_note = format!("{source}.md");
        let note_restored = if no_entry(&self.root.join(&source_note)) {
            let from = if no_entry(&self.root.join(format!("{location}.md"))) {
                &self.tree
            } else {
                location
            };
            relocate_note(&self.root, from, source, self.plan).is_ok()
        } else {
            self.plan
                .preview
                .entries
                .iter()
                .find(|entry| entry.path == source_note)
                .is_some_and(|entry| {
                    guarded::read_regular(&self.root.join(&source_note))
                        .is_ok_and(|bytes| atomic::revision(&bytes) == entry.revision)
                })
        };
        restored && note_restored && remove_journal(&self.root, &self.tx).is_ok()
    }
}
pub(super) fn apply(
    session: &mut RepoSession,
    plan: &SuitePlan,
) -> Result<SuiteApplyResult, RepositoryError> {
    let root = session.root.0.clone();
    let source = &plan.preview.source_path;
    let tx = format!(".testoritto-suite-{}", Uuid::new_v4());
    let tree = format!("{tx}/tree");
    if !matches!(plan.action, SuiteAction::Duplicate { .. }) {
        drop(
            guarded::DeleteBatch::capture(&deletion_entries(plan, &root, source)?)
                .map_err(|_| blocked())?,
        );
    }
    let journal = atomic::StagedFile {
        name: "journal.json".into(),
        bytes: journal_bytes(plan, "prepared", 0)?,
        source: None,
    };
    if !atomic::publish_directory(&root, &tx, &[journal], || {
        original_manifest(plan, &root, source).map_err(|_| io::Error::other("stale source"))
    })
    .map_err(|_| blocked())?
    {
        return Err(error(RepositoryErrorCode::ExternalChange));
    }
    let mut transaction = Transaction {
        root,
        tx,
        tree,
        plan,
        removed: Vec::new(),
        published: false,
        ledger: std::collections::BTreeMap::new(),
    };
    if transaction.execute().is_ok() {
        return Ok(SuiteApplyResult {
            outcome: "applied",
            path: plan.preview.destination_path.clone(),
            recovery: None,
        });
    }
    let _ = checkpoint("beforeRollback", &transaction.root, &transaction.tx);
    if transaction.removed.is_empty() && transaction.rollback() {
        return Err(error(RepositoryErrorCode::SaveFailed));
    }
    Ok(recovery(
        session,
        &transaction.tx,
        plan,
        transaction.removed,
    ))
}

#[cfg(test)]
type Injection = Box<dyn FnMut(&str, &Path, &str) -> bool>;
#[cfg(test)]
thread_local! { pub(super) static INJECTION: std::cell::RefCell<Option<Injection>> = const { std::cell::RefCell::new(None) }; }
#[cfg_attr(not(test), allow(clippy::unnecessary_wraps))] // Production no-op; test injection exercises real failure recovery.
fn checkpoint(phase: &str, root: &Path, tx: &str) -> Result<(), RepositoryError> {
    #[cfg(test)]
    {
        if INJECTION.with(|slot| {
            slot.borrow_mut()
                .as_mut()
                .is_some_and(|callback| callback(phase, root, tx))
        }) {
            return Err(blocked());
        }
    }
    let _ = (phase, root, tx);
    Ok(())
}
