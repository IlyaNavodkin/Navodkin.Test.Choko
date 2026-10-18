use std::{collections::BTreeMap, fs};

use serde::{Deserialize, Serialize};

use super::path::RepoRoot;
use super::{
    RepositoryError, RepositoryErrorCode, RepositoryService, atomic, git_sync::ensure_writable,
    invalid_resource, invalid_session, read_utf8_limited, registry_error, resolve_regular_file,
};
use crate::domain::formats::{GlossaryDocument, GlossaryKind, GlossaryValue, MAX_GLOSSARY_BYTES};

pub(crate) const GLOSSARY_DIR: &str = ".testoritto/glossary";
const MAX_GLOSSARY_ENTRIES: usize = 10_000;

/// Одна запись справочника для IPC.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlossaryEntryDto {
    pub entry_id: String,
    pub kind: String,
    pub title: String,
    pub aliases: Vec<String>,
    pub description: String,
    pub url: String,
    pub archived: bool,
    pub revision: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub values: Option<BTreeMap<String, GlossaryValue>>,
    pub path: String,
}

/// Каталог справочника с общей revision.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlossaryCatalogDto {
    pub revision: String,
    pub entries: Vec<GlossaryEntryDto>,
}

/// Правка записи от `WebView`; revision контента назначает хранилище.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GlossaryEdit {
    pub title: String,
    pub kind: String,
    pub aliases: Vec<String>,
    pub description: String,
    pub url: String,
    #[serde(default)]
    pub values: BTreeMap<String, GlossaryValue>,
    pub archived: bool,
}

fn invalid_entry(message: impl Into<String>) -> RepositoryError {
    RepositoryError::new(RepositoryErrorCode::InvalidDocument, message)
}

fn kind_of(value: &str) -> Result<GlossaryKind, RepositoryError> {
    match value {
        "term" => Ok(GlossaryKind::Term),
        "abbreviation" => Ok(GlossaryKind::Abbreviation),
        "document" => Ok(GlossaryKind::Document),
        "environment" => Ok(GlossaryKind::Environment),
        _ => Err(invalid_entry(
            "Поле kind должно быть term, abbreviation, document или environment.",
        )),
    }
}

fn file_name_valid(name: &str) -> bool {
    name.len() == 36 + 3
        && name.to_ascii_lowercase().ends_with(".md")
        && uuid::Uuid::parse_str(&name[..36]).is_ok_and(|parsed| {
            parsed.to_string() == name[..36]
                && parsed.get_version_num() == 4
                && parsed.get_variant() == uuid::Variant::RFC4122
        })
}

fn new_revision() -> String {
    format!("rev-{}", uuid::Uuid::new_v4())
}

fn save_failed() -> RepositoryError {
    RepositoryError::new(
        RepositoryErrorCode::SaveFailed,
        "Не удалось атомарно сохранить запись. Черновик сохранён в редакторе.",
    )
}

fn stale_catalog() -> RepositoryError {
    RepositoryError::new(
        RepositoryErrorCode::StaleResource,
        "Справочник изменился. Обновите каталог.",
    )
}

fn stale_entry() -> RepositoryError {
    RepositoryError::new(
        RepositoryErrorCode::StaleResource,
        "Запись изменилась. Обновите каталог.",
    )
}

fn seed_text(id: &str, kind: GlossaryKind, kind_name: &str, revision: &str) -> String {
    if kind == GlossaryKind::Environment {
        format!(
            "---\nschema_version: 1\nid: {id}\nkind: {kind_name}\ntitle: placeholder\nrevision: {revision}\nvalues:\n  placeholder: placeholder\n---\n\nplaceholder\n"
        )
    } else {
        format!(
            "---\nschema_version: 1\nid: {id}\nkind: {kind_name}\ntitle: placeholder\nrevision: {revision}\n---\n\nplaceholder\n"
        )
    }
}

fn entry_from_text(relative: &str, bytes: &[u8]) -> Result<GlossaryEntryDto, RepositoryError> {
    let text = String::from_utf8(bytes.to_vec()).map_err(|_| {
        RepositoryError::new(
            RepositoryErrorCode::InvalidUtf8,
            "Запись справочника не содержит корректный UTF-8 текст.",
        )
    })?;
    let document = GlossaryDocument::parse(&text).map_err(|error| invalid_entry(error.message))?;
    let front = document.front();
    let kind = front
        .kind()
        .map(|kind| kind.as_str().to_owned())
        .unwrap_or_default();
    let values = if kind == "environment" {
        Some(front.values().clone())
    } else {
        None
    };
    Ok(GlossaryEntryDto {
        entry_id: front.id().unwrap_or_default(),
        kind,
        title: front.title(),
        aliases: front.aliases().to_vec(),
        description: document.body().trim().to_owned(),
        url: front.url(),
        archived: front.archived(),
        revision: front.revision(),
        values,
        path: relative.to_owned(),
    })
}

impl RepositoryService {
    fn glossary_root(&self, token: &str) -> Result<RepoRoot, RepositoryError> {
        let sessions = self.sessions.lock().map_err(|_| registry_error())?;
        let session = sessions.by_id.get(token).ok_or_else(invalid_session)?;
        Ok(session.root.clone())
    }

    /// Читает каталог справочника; отсутствие каталога — пустое состояние без записи.
    ///
    /// # Errors
    /// Возвращает диагностику для неизвестной сессии, небезопасных путей и oversize.
    pub fn read_glossary(&self, token: &str) -> Result<GlossaryCatalogDto, RepositoryError> {
        let root = self.glossary_root(token)?;
        let dir = root.0.join(GLOSSARY_DIR);
        let mut entries = Vec::new();
        let mut fingerprints = Vec::new();
        if dir.exists() {
            let canonical = root
                .resolve_existing(GLOSSARY_DIR)
                .map_err(|_| invalid_resource())?;
            if !canonical.is_dir() {
                return Err(invalid_resource());
            }
            let mut names: Vec<String> = fs::read_dir(&canonical)
                .map_err(|_| {
                    RepositoryError::new(
                        RepositoryErrorCode::Io,
                        "Не удалось прочитать каталог справочника.",
                    )
                })?
                .filter_map(Result::ok)
                .map(|entry| entry.file_name().to_string_lossy().into_owned())
                .filter(|name| file_name_valid(name))
                .collect();
            names.sort();
            if names.len() > MAX_GLOSSARY_ENTRIES {
                return Err(RepositoryError::new(
                    RepositoryErrorCode::FileTooLarge,
                    "Каталог справочника превышает безопасный лимит.",
                ));
            }
            for name in names {
                let relative = format!("{GLOSSARY_DIR}/{name}");
                let path = resolve_regular_file(&root, &relative)?;
                let text = read_utf8_limited(&path, MAX_GLOSSARY_BYTES)?;
                let entry = entry_from_text(&relative, text.as_bytes())?;
                let id = name[..36].to_owned();
                if entry.entry_id != id {
                    return Err(invalid_entry(
                        "Имя файла справочника не совпадает с id записи.",
                    ));
                }
                fingerprints.push(format!("{relative}{}", entry.revision));
                entries.push(entry);
            }
        }
        fingerprints.sort();
        Ok(GlossaryCatalogDto {
            revision: atomic::revision(fingerprints.join("").as_bytes()),
            entries,
        })
    }

    /// Создаёт или перезаписывает запись с revision-check каталога.
    ///
    /// # Errors
    /// Возвращает диагностику для невалидного edit, stale revision и ошибок записи.
    #[allow(clippy::too_many_lines)] // Одна транзакция: revision-check, сборка и atomic-запись.
    pub fn save_glossary_entry(
        &self,
        token: &str,
        entry_id: Option<&str>,
        expected_revision: &str,
        edit: GlossaryEdit,
    ) -> Result<GlossaryCatalogDto, RepositoryError> {
        let kind = kind_of(&edit.kind)?;
        if entry_id.is_some_and(|id| uuid::Uuid::parse_str(id).is_err()) {
            return Err(invalid_entry("Некорректный id записи справочника."));
        }
        edit.validate_shape(kind)?;
        let root = self.glossary_root(token)?;
        {
            let sessions = self.sessions.lock().map_err(|_| registry_error())?;
            let session = sessions.by_id.get(token).ok_or_else(invalid_session)?;
            ensure_writable(session)?;
        }
        let before = self.read_glossary(token)?;
        if before.revision != expected_revision {
            return Err(stale_catalog());
        }
        let id = entry_id.map_or_else(|| uuid::Uuid::new_v4().to_string(), str::to_owned);
        let relative = format!("{GLOSSARY_DIR}/{id}.md");
        let exists = root.0.join(&relative).exists();
        let revision = new_revision();
        let text = if exists {
            let path = resolve_regular_file(&root, &relative)?;
            read_utf8_limited(&path, MAX_GLOSSARY_BYTES)?
        } else {
            seed_text(&id, kind, &edit.kind, &revision)
        };
        let mut document =
            GlossaryDocument::parse(&text).map_err(|error| invalid_entry(error.message))?;
        if exists && document.front().id().as_deref() != Some(id.as_str()) {
            return Err(invalid_entry(
                "Имя файла справочника не совпадает с id записи.",
            ));
        }
        let front = document.front_mut();
        front.set_id(id.clone());
        front.set_kind(kind);
        front.set_title(edit.title);
        front.set_aliases(edit.aliases);
        front.set_archived(edit.archived);
        front.set_revision(revision);
        front.set_url(edit.url);
        front.set_values(if kind == GlossaryKind::Environment {
            edit.values
        } else {
            BTreeMap::new()
        });
        document.set_body(edit.description);
        let next = document
            .to_text()
            .map_err(|error| invalid_entry(error.message))?;
        if exists {
            let path = resolve_regular_file(&root, &relative)?;
            let current = read_utf8_limited(&path, MAX_GLOSSARY_BYTES)?;
            if current != text {
                return Err(stale_entry());
            }
            if next != text
                && !atomic::replace(&path, &atomic::revision(text.as_bytes()), next.as_bytes())
                    .map_err(|_| save_failed())?
            {
                return Err(stale_entry());
            }
        } else {
            for level in [".testoritto", GLOSSARY_DIR] {
                atomic::ensure_directory(&root.0.join(level)).map_err(|_| {
                    RepositoryError::new(
                        RepositoryErrorCode::Io,
                        "Не удалось создать каталог справочника.",
                    )
                })?;
            }
            atomic::create(&root.0.join(&relative), next.as_bytes(), None).map_err(|_| {
                RepositoryError::new(
                    RepositoryErrorCode::SaveFailed,
                    "Не удалось атомарно сохранить запись. Черновик сохранён в редакторе.",
                )
            })?;
        }
        self.read_glossary(token)
    }

    /// Архивирует или восстанавливает запись с revision-check каталога.
    ///
    /// # Errors
    /// Возвращает диагностику для неизвестной записи, stale revision и ошибок записи.
    pub fn archive_glossary_entry(
        &self,
        token: &str,
        entry_id: &str,
        expected_revision: &str,
        archived: bool,
    ) -> Result<GlossaryCatalogDto, RepositoryError> {
        if uuid::Uuid::parse_str(entry_id).is_err() {
            return Err(invalid_entry("Некорректный id записи справочника."));
        }
        let root = self.glossary_root(token)?;
        {
            let sessions = self.sessions.lock().map_err(|_| registry_error())?;
            let session = sessions.by_id.get(token).ok_or_else(invalid_session)?;
            ensure_writable(session)?;
        }
        let before = self.read_glossary(token)?;
        if before.revision != expected_revision {
            return Err(stale_catalog());
        }
        let relative = format!("{GLOSSARY_DIR}/{entry_id}.md");
        let path = resolve_regular_file(&root, &relative)?;
        let text = read_utf8_limited(&path, MAX_GLOSSARY_BYTES)?;
        let mut document =
            GlossaryDocument::parse(&text).map_err(|error| invalid_entry(error.message))?;
        document.front_mut().set_archived(archived);
        document.front_mut().set_revision(new_revision());
        let next = document
            .to_text()
            .map_err(|error| invalid_entry(error.message))?;
        if next != text
            && !atomic::replace(&path, &atomic::revision(text.as_bytes()), next.as_bytes())
                .map_err(|_| save_failed())?
        {
            return Err(stale_entry());
        }
        self.read_glossary(token)
    }
}

impl GlossaryEdit {
    fn validate_shape(&self, kind: GlossaryKind) -> Result<(), RepositoryError> {
        if self.title.trim().is_empty() {
            return Err(invalid_entry("Название записи обязательно."));
        }
        if kind != GlossaryKind::Environment && !self.values.is_empty() {
            return Err(invalid_entry(
                "Поле values допустимо только для environment.",
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::super::{RepositoryErrorCode, RepositoryService};
    use std::{collections::BTreeMap, fs, path::Path, process::Command};

    fn git(root: &Path, args: &[&str]) {
        let output = Command::new("git")
            .args(args)
            .current_dir(root)
            .output()
            .expect("Git CLI available");
        assert!(
            output.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn fixture() -> (tempfile::TempDir, std::path::PathBuf) {
        let temp = tempfile::tempdir().expect("temporary fixture root");
        let root = std::fs::canonicalize(temp.path()).expect("canonical fixture root");
        git(&root, &["init", "--initial-branch=main"]);
        fs::create_dir_all(root.join(".casewright")).unwrap();
        fs::write(
            root.join(".casewright/config.yaml"),
            "version: 1\nworkspaces:\n  - .\n",
        )
        .unwrap();
        (temp, root)
    }

    fn open(root: &Path) -> (RepositoryService, String) {
        let service = RepositoryService::default();
        let session = service.open(root).unwrap().session_id;
        (service, session)
    }

    fn edit(title: &str, kind: &str, description: &str) -> super::super::GlossaryEdit {
        super::super::GlossaryEdit {
            title: title.into(),
            kind: kind.into(),
            aliases: Vec::new(),
            description: description.into(),
            url: String::new(),
            archived: false,
            values: BTreeMap::new(),
        }
    }

    #[test]
    fn empty_catalog_reads_without_writes_and_round_trips_entry() {
        let (_temp, root) = fixture();
        let (service, session) = open(&root);
        assert!(!root.join(".testoritto").exists());
        let empty = service.read_glossary(&session).unwrap();
        assert!(empty.entries.is_empty());
        assert!(!root.join(".testoritto").exists());

        let saved = service
            .save_glossary_entry(
                &session,
                None,
                &empty.revision,
                edit("SLA", "term", "Показатели."),
            )
            .unwrap();
        assert_eq!(saved.entries.len(), 1);
        let entry = &saved.entries[0];
        assert_eq!(entry.kind, "term");
        assert_eq!(entry.title, "SLA");
        assert_eq!(entry.description, "Показатели.");
        let again = service.read_glossary(&session).unwrap();
        assert_eq!(again.revision, saved.revision);
        assert_eq!(again.entries, saved.entries);
    }

    #[test]
    fn stale_revision_and_invalid_payload_are_rejected_without_mutation() {
        let (_temp, root) = fixture();
        let (service, session) = open(&root);
        let empty = service.read_glossary(&session).unwrap();
        let saved = service
            .save_glossary_entry(
                &session,
                None,
                &empty.revision,
                edit("API", "abbreviation", "Контракт."),
            )
            .unwrap();
        let stale = service.save_glossary_entry(
            &session,
            None,
            &empty.revision,
            edit("Дубль", "term", "Текст."),
        );
        assert_eq!(stale.unwrap_err().code, RepositoryErrorCode::StaleResource);
        assert!(
            service
                .save_glossary_entry(&session, None, &saved.revision, edit("", "term", "Текст."))
                .is_err()
        );
        assert!(
            service
                .save_glossary_entry(&session, None, &saved.revision, edit("X", "wiki", "Текст."))
                .is_err()
        );
        assert_eq!(
            service.read_glossary(&session).unwrap().revision,
            saved.revision
        );
    }

    #[test]
    fn symlink_traversal_and_corrupt_entries_are_rejected() {
        let (_temp, root) = fixture();
        let (service, session) = open(&root);
        let empty = service.read_glossary(&session).unwrap();
        assert!(
            service
                .save_glossary_entry(
                    &session,
                    Some("../escape"),
                    &empty.revision,
                    edit("X", "term", "Y")
                )
                .is_err()
        );
        assert!(
            service
                .archive_glossary_entry(&session, "..", &empty.revision, true)
                .is_err()
        );

        fs::create_dir_all(root.join(".testoritto")).unwrap();
        let link = root.join(".testoritto").join("glossary");
        #[cfg(windows)]
        let linked = std::os::windows::fs::symlink_dir("..", &link).is_ok();
        #[cfg(unix)]
        let linked = std::os::unix::fs::symlink("..", &link).is_ok();
        if linked {
            assert!(service.read_glossary(&session).is_err());
            fs::remove_file(&link).unwrap();
        }

        let id = "11111111-1111-4111-8111-000000000001";
        fs::create_dir_all(root.join(".testoritto/glossary")).unwrap();
        fs::write(
            root.join(format!(".testoritto/glossary/{id}.md")),
            b"---\nunclosed",
        )
        .unwrap();
        assert!(service.read_glossary(&session).is_err());
    }

    #[test]
    fn environment_archive_restore_and_session_checks() {
        let (_temp, root) = fixture();
        let (service, session) = open(&root);
        let empty = service.read_glossary(&session).unwrap();
        let mut values = BTreeMap::new();
        values.insert(
            "baseUrl".to_owned(),
            crate::domain::formats::GlossaryValue::Text("https://pay.example.com".into()),
        );
        let env = super::super::GlossaryEdit {
            title: "Prod".into(),
            kind: "environment".into(),
            aliases: Vec::new(),
            description: "Стенд.".into(),
            url: String::new(),
            archived: false,
            values,
        };
        let saved = service
            .save_glossary_entry(&session, None, &empty.revision, env)
            .unwrap();
        assert_eq!(saved.entries[0].values.as_ref().unwrap().len(), 1);
        let id = saved.entries[0].entry_id.clone();
        let archived = service
            .archive_glossary_entry(&session, &id, &saved.revision, true)
            .unwrap();
        assert!(archived.entries[0].archived);
        assert_eq!(archived.entries[0].entry_id, id);
        let restored = service
            .archive_glossary_entry(&session, &id, &archived.revision, false)
            .unwrap();
        assert!(!restored.entries[0].archived);
        assert_eq!(restored.entries[0].entry_id, id);

        assert!(
            service
                .archive_glossary_entry(
                    &session,
                    "11111111-1111-4111-8111-000000000001",
                    &restored.revision,
                    true,
                )
                .is_err()
        );
        assert_eq!(
            service
                .read_glossary("11111111-1111-4111-8111-000000000001")
                .unwrap_err()
                .code,
            RepositoryErrorCode::InvalidSession
        );
    }
}
