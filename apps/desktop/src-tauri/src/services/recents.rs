//! Локальная история недавно открытых репозиториев вне пользовательских Git-репозиториев.
//!
//! Store не создаёт каталог при конструировании или чтении. Публичный DTO намеренно не
//! содержит пути; запись принимает только уже существующий canonical repository root.

use std::{
    fs::{self, File},
    io::{self, Read, Write},
    path::{Component, Path, PathBuf},
    sync::Mutex,
};

use serde::{Deserialize, Serialize};
use tempfile::NamedTempFile;
use uuid::Uuid;

const HISTORY_FILE: &str = "recent-repositories.json";
const SCHEMA_VERSION: u32 = 1;
const MAX_HISTORY_BYTES: u64 = 64 * 1024;
const MAX_ENTRIES: usize = 20;
const MAX_DISPLAY_NAME_BYTES: usize = 512;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecentRepositoryDto {
    pub recent_id: String,
    pub display_name: String,
    pub last_opened_at_ms: u64,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RecentStoreErrorCode {
    InvalidStoragePath,
    InvalidRepositoryPath,
    DataDirectoryInsideRepository,
    InvalidDisplayName,
    InvalidTimestamp,
    InvalidRecentId,
    InvalidWorkspacePath,
    RecentNotFound,
    MissingRepository,
    RepositoryPathChanged,
    CorruptHistory,
    UnsupportedVersion,
    HistoryTooLarge,
    UnsafeHistoryPath,
    Io,
    Serialization,
    LockPoisoned,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecentStoreError {
    pub code: RecentStoreErrorCode,
    pub message: &'static str,
}

impl RecentStoreError {
    fn new(code: RecentStoreErrorCode, message: &'static str) -> Self {
        Self { code, message }
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PersistedHistory {
    schema_version: u32,
    entries: Vec<PersistedEntry>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PersistedEntry {
    recent_id: String,
    canonical_path: PathBuf,
    display_name: String,
    last_opened_at_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    last_workspace_path: Option<String>,
}

/// Синхронное хранилище; будущий IPC должен вызывать его из `spawn_blocking`.
pub struct RecentRepositoryStore {
    app_data_dir: PathBuf,
    operation_lock: Mutex<()>,
}

impl RecentRepositoryStore {
    /// Создаёт только объект сервиса и не обращается к файловой системе.
    ///
    /// # Errors
    /// Возвращает `InvalidStoragePath`, если путь не абсолютный или содержит `..`.
    pub fn new(app_data_dir: PathBuf) -> Result<Self, RecentStoreError> {
        validate_storage_path(&app_data_dir)?;
        Ok(Self {
            app_data_dir,
            operation_lock: Mutex::new(()),
        })
    }

    /// Читает историю без создания каталога или файла.
    ///
    /// # Errors
    /// Возвращает диагностическую ошибку при повреждённой/неподдерживаемой истории или сбое IO.
    pub fn list(&self) -> Result<Vec<RecentRepositoryDto>, RecentStoreError> {
        let _guard = self.lock()?;
        let history = self.read_history()?;
        Ok(history
            .entries
            .iter()
            .map(|entry| RecentRepositoryDto {
                recent_id: entry.recent_id.clone(),
                display_name: entry.display_name.clone(),
                last_opened_at_ms: entry.last_opened_at_ms,
            })
            .collect())
    }

    /// Добавляет или поднимает canonical repo в начало истории.
    /// `now_unix_millis` внедряется вызывающей стороной для тестируемости.
    ///
    /// # Errors
    /// Отказывает при неканоническом repo root, небезопасном app-data scope, некорректном имени,
    /// конфликтующей истории или невозможности атомарно сохранить обновление.
    pub fn record_opened(
        &self,
        canonical_root: &Path,
        display_name: &str,
        now_unix_millis: u64,
    ) -> Result<RecentRepositoryDto, RecentStoreError> {
        let _guard = self.lock()?;
        let canonical_root = validate_canonical_repository(canonical_root)?;
        if now_unix_millis > MAX_SAFE_INTEGER {
            return Err(RecentStoreError::new(
                RecentStoreErrorCode::InvalidTimestamp,
                "Время открытия выходит за безопасный диапазон сериализации.",
            ));
        }
        self.ensure_storage_outside_repository(&canonical_root)?;
        let display_name = bounded_display_name(display_name)?;
        let mut history = self.read_history()?;

        let existing = history
            .entries
            .iter()
            .position(|entry| same_path(&entry.canonical_path, &canonical_root));
        let recent_id = existing.map_or_else(
            || Uuid::new_v4().to_string(),
            |index| history.entries[index].recent_id.clone(),
        );
        let last_workspace_path =
            existing.and_then(|index| history.entries.remove(index).last_workspace_path);
        history.entries.insert(
            0,
            PersistedEntry {
                recent_id: recent_id.clone(),
                canonical_path: canonical_root,
                display_name: display_name.clone(),
                last_opened_at_ms: now_unix_millis,
                last_workspace_path,
            },
        );
        history.entries.truncate(MAX_ENTRIES);
        self.write_history(&history)?;
        Ok(RecentRepositoryDto {
            recent_id,
            display_name,
            last_opened_at_ms: now_unix_millis,
        })
    }

    /// Возвращает сохранённый declared workspace, не раскрывая путь через публичный DTO.
    ///
    /// # Errors
    /// Возвращает ошибку для неканонического root или повреждённой/недоступной истории.
    pub fn last_workspace(
        &self,
        canonical_root: &Path,
    ) -> Result<Option<String>, RecentStoreError> {
        let _guard = self.lock()?;
        let canonical_root = validate_canonical_repository(canonical_root)?;
        self.ensure_storage_outside_repository(&canonical_root)?;
        let history = self.read_history()?;
        Ok(history
            .entries
            .iter()
            .find(|entry| same_path(&entry.canonical_path, &canonical_root))
            .and_then(|entry| entry.last_workspace_path.clone()))
    }

    /// Запоминает только уже существующую запись истории; вызывающая сторона сначала
    /// проверяет membership и filesystem scope workspace через `RepositoryService`.
    ///
    /// # Errors
    /// Возвращает ошибку при небезопасном пути, app-data внутри репозитория, отсутствующей
    /// записи истории или невозможности безопасно сохранить обновление.
    pub fn remember_workspace(
        &self,
        canonical_root: &Path,
        workspace_path: &str,
    ) -> Result<(), RecentStoreError> {
        validate_workspace_path(workspace_path)?;
        let _guard = self.lock()?;
        let canonical_root = validate_canonical_repository(canonical_root)?;
        self.ensure_storage_outside_repository(&canonical_root)?;
        let mut history = self.read_history()?;
        let entry = history
            .entries
            .iter_mut()
            .find(|entry| same_path(&entry.canonical_path, &canonical_root))
            .ok_or_else(|| {
                RecentStoreError::new(
                    RecentStoreErrorCode::RecentNotFound,
                    "Репозиторий отсутствует в истории.",
                )
            })?;
        entry.last_workspace_path = Some(workspace_path.to_owned());
        self.write_history(&history)
    }

    fn ensure_storage_outside_repository(
        &self,
        canonical_root: &Path,
    ) -> Result<(), RecentStoreError> {
        let storage_location = resolve_with_missing_suffix(&self.app_data_dir)?;
        if storage_location.starts_with(canonical_root) {
            return Err(RecentStoreError::new(
                RecentStoreErrorCode::DataDirectoryInsideRepository,
                "Каталог истории находится внутри открываемого репозитория.",
            ));
        }
        Ok(())
    }

    /// Разрешает UUID в private canonical path; недоступные каталоги остаются в истории.
    ///
    /// # Errors
    /// Возвращает ошибку для некорректного/отсутствующего ID, отсутствующего repo или IO failure.
    pub fn resolve_recent(&self, recent_id: &str) -> Result<PathBuf, RecentStoreError> {
        validate_recent_id(recent_id)?;
        let _guard = self.lock()?;
        let history = self.read_history()?;
        let entry = history
            .entries
            .iter()
            .find(|entry| entry.recent_id == recent_id)
            .ok_or_else(|| {
                RecentStoreError::new(
                    RecentStoreErrorCode::RecentNotFound,
                    "Репозиторий отсутствует в истории.",
                )
            })?;
        let current = fs::canonicalize(&entry.canonical_path).map_err(|error| {
            if error.kind() == io::ErrorKind::NotFound {
                RecentStoreError::new(
                    RecentStoreErrorCode::MissingRepository,
                    "Сохранённый репозиторий больше не найден.",
                )
            } else {
                io_error(error)
            }
        })?;
        if !same_path(&current, &entry.canonical_path) || !current.is_dir() {
            return Err(RecentStoreError::new(
                RecentStoreErrorCode::RepositoryPathChanged,
                "Путь сохранённого репозитория изменился.",
            ));
        }
        Ok(current)
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, ()>, RecentStoreError> {
        self.operation_lock.lock().map_err(|_| {
            RecentStoreError::new(
                RecentStoreErrorCode::LockPoisoned,
                "Хранилище истории временно недоступно.",
            )
        })
    }

    fn history_path(&self) -> PathBuf {
        self.app_data_dir.join(HISTORY_FILE)
    }

    fn read_history(&self) -> Result<PersistedHistory, RecentStoreError> {
        let path = self.history_path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                return Ok(PersistedHistory {
                    schema_version: SCHEMA_VERSION,
                    entries: Vec::new(),
                });
            }
            Err(error) => return Err(io_error(error)),
        };
        if is_reparse_or_symlink(&metadata) || !metadata.is_file() {
            return Err(RecentStoreError::new(
                RecentStoreErrorCode::UnsafeHistoryPath,
                "Файл истории имеет небезопасный тип или ссылку.",
            ));
        }
        if metadata.len() > MAX_HISTORY_BYTES {
            return Err(RecentStoreError::new(
                RecentStoreErrorCode::HistoryTooLarge,
                "Файл истории превышает допустимый размер.",
            ));
        }
        let file = File::open(&path).map_err(io_error)?;
        let opened_metadata = file.metadata().map_err(io_error)?;
        if !opened_metadata.is_file() || opened_metadata.len() > MAX_HISTORY_BYTES {
            return Err(RecentStoreError::new(
                RecentStoreErrorCode::UnsafeHistoryPath,
                "Файл истории изменился во время чтения.",
            ));
        }
        let capacity = usize::try_from(opened_metadata.len()).map_err(|_| {
            RecentStoreError::new(
                RecentStoreErrorCode::HistoryTooLarge,
                "Файл истории превышает допустимый размер.",
            )
        })?;
        let mut bytes = Vec::with_capacity(capacity);
        file.take(MAX_HISTORY_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(io_error)?;
        if bytes.len() as u64 > MAX_HISTORY_BYTES {
            return Err(RecentStoreError::new(
                RecentStoreErrorCode::HistoryTooLarge,
                "Файл истории превышает допустимый размер.",
            ));
        }
        let mut history: PersistedHistory = serde_json::from_slice(&bytes).map_err(|_| {
            RecentStoreError::new(
                RecentStoreErrorCode::CorruptHistory,
                "Файл истории повреждён; данные не перезаписаны.",
            )
        })?;
        if history.schema_version != SCHEMA_VERSION {
            return Err(RecentStoreError::new(
                RecentStoreErrorCode::UnsupportedVersion,
                "Версия файла истории не поддерживается; данные не перезаписаны.",
            ));
        }
        validate_history(&history)?;
        history.entries.shrink_to_fit();
        Ok(history)
    }

    fn write_history(&self, history: &PersistedHistory) -> Result<(), RecentStoreError> {
        let bytes = serde_json::to_vec(history).map_err(|_| {
            RecentStoreError::new(
                RecentStoreErrorCode::Serialization,
                "Не удалось сериализовать историю.",
            )
        })?;
        if bytes.len() as u64 > MAX_HISTORY_BYTES {
            return Err(RecentStoreError::new(
                RecentStoreErrorCode::HistoryTooLarge,
                "История превышает допустимый размер.",
            ));
        }
        fs::create_dir_all(&self.app_data_dir).map_err(io_error)?;
        let path = self.history_path();
        match fs::symlink_metadata(&path) {
            Ok(metadata) if is_reparse_or_symlink(&metadata) || !metadata.is_file() => {
                return Err(RecentStoreError::new(
                    RecentStoreErrorCode::UnsafeHistoryPath,
                    "Файл истории имеет небезопасный тип или ссылку.",
                ));
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => return Err(io_error(error)),
        }
        write_atomic(&self.app_data_dir, &path, &bytes, || Ok(())).map_err(io_error)
    }
}

fn write_atomic(
    parent: &Path,
    target: &Path,
    bytes: &[u8],
    before_publish: impl FnOnce() -> io::Result<()>,
) -> io::Result<()> {
    let mut temporary = NamedTempFile::new_in(parent)?;
    temporary.write_all(bytes)?;
    temporary.as_file().sync_all()?;
    before_publish()?;
    temporary
        .persist(target)
        .map(|_| ())
        .map_err(|error| error.error)
}

fn validate_storage_path(path: &Path) -> Result<(), RecentStoreError> {
    if !path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(RecentStoreError::new(
            RecentStoreErrorCode::InvalidStoragePath,
            "Путь хранилища должен быть абсолютным и нормализованным.",
        ));
    }
    Ok(())
}

fn validate_canonical_repository(path: &Path) -> Result<PathBuf, RecentStoreError> {
    let canonical = fs::canonicalize(path).map_err(|_| {
        RecentStoreError::new(
            RecentStoreErrorCode::InvalidRepositoryPath,
            "Выбранный каталог репозитория недоступен.",
        )
    })?;
    if canonical != path || !canonical.is_dir() {
        return Err(RecentStoreError::new(
            RecentStoreErrorCode::InvalidRepositoryPath,
            "Для записи истории требуется canonical root существующего каталога.",
        ));
    }
    Ok(canonical)
}

fn resolve_with_missing_suffix(path: &Path) -> Result<PathBuf, RecentStoreError> {
    let mut ancestor = path;
    let mut suffix = Vec::new();
    while !ancestor.exists() {
        let name = ancestor.file_name().ok_or_else(|| {
            RecentStoreError::new(
                RecentStoreErrorCode::InvalidStoragePath,
                "Не удалось безопасно разрешить путь хранилища.",
            )
        })?;
        suffix.push(name.to_os_string());
        ancestor = ancestor.parent().ok_or_else(|| {
            RecentStoreError::new(
                RecentStoreErrorCode::InvalidStoragePath,
                "Не удалось безопасно разрешить путь хранилища.",
            )
        })?;
    }
    let mut resolved = fs::canonicalize(ancestor).map_err(io_error)?;
    for item in suffix.into_iter().rev() {
        resolved.push(item);
    }
    Ok(resolved)
}

fn bounded_display_name(name: &str) -> Result<String, RecentStoreError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(RecentStoreError::new(
            RecentStoreErrorCode::InvalidDisplayName,
            "Название репозитория не должно быть пустым.",
        ));
    }
    if trimmed.len() <= MAX_DISPLAY_NAME_BYTES {
        return Ok(trimmed.to_owned());
    }
    let mut end = MAX_DISPLAY_NAME_BYTES;
    while !trimmed.is_char_boundary(end) {
        end -= 1;
    }
    Ok(trimmed[..end].trim_end().to_owned())
}

fn validate_recent_id(id: &str) -> Result<(), RecentStoreError> {
    let parsed = Uuid::parse_str(id).map_err(|_| {
        RecentStoreError::new(
            RecentStoreErrorCode::InvalidRecentId,
            "Идентификатор записи истории некорректен.",
        )
    })?;
    if parsed.get_version_num() != 4
        || parsed.get_variant() != uuid::Variant::RFC4122
        || parsed.as_hyphenated().to_string() != id
    {
        return Err(RecentStoreError::new(
            RecentStoreErrorCode::InvalidRecentId,
            "Идентификатор записи истории должен быть UUIDv4.",
        ));
    }
    Ok(())
}

fn validate_history(history: &PersistedHistory) -> Result<(), RecentStoreError> {
    if history.entries.len() > MAX_ENTRIES {
        return Err(corrupt_history());
    }
    for (index, entry) in history.entries.iter().enumerate() {
        validate_recent_id(&entry.recent_id).map_err(|_| corrupt_history())?;
        if !is_normalized_absolute(&entry.canonical_path)
            || entry.display_name.trim().is_empty()
            || entry.display_name.len() > MAX_DISPLAY_NAME_BYTES
            || entry.last_opened_at_ms > MAX_SAFE_INTEGER
            || entry
                .last_workspace_path
                .as_deref()
                .is_some_and(|path| validate_workspace_path(path).is_err())
            || history.entries[..index].iter().any(|previous| {
                previous.recent_id == entry.recent_id
                    || same_path(&previous.canonical_path, &entry.canonical_path)
            })
        {
            return Err(corrupt_history());
        }
    }
    Ok(())
}

fn validate_workspace_path(path: &str) -> Result<(), RecentStoreError> {
    let invalid = path.len() > 1024
        || path.contains('\\')
        || path.contains('\0')
        || path.contains(':')
        || path.starts_with('/')
        || (!path.is_empty()
            && path.split('/').any(|component| {
                component.is_empty()
                    || component == "."
                    || component == ".."
                    || component.eq_ignore_ascii_case(".git")
            }));
    if invalid {
        return Err(RecentStoreError::new(
            RecentStoreErrorCode::InvalidWorkspacePath,
            "Путь рабочей области недопустим.",
        ));
    }
    Ok(())
}

fn is_normalized_absolute(path: &Path) -> bool {
    path.is_absolute()
        && path
            .components()
            .all(|component| !matches!(component, Component::ParentDir | Component::CurDir))
}

fn corrupt_history() -> RecentStoreError {
    RecentStoreError::new(
        RecentStoreErrorCode::CorruptHistory,
        "Файл истории повреждён; данные не перезаписаны.",
    )
}

fn same_path(left: &Path, right: &Path) -> bool {
    #[cfg(windows)]
    {
        left.to_string_lossy()
            .eq_ignore_ascii_case(&right.to_string_lossy())
    }
    #[cfg(not(windows))]
    {
        left == right
    }
}

fn is_reparse_or_symlink(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}

fn io_error(_: io::Error) -> RecentStoreError {
    RecentStoreError::new(
        RecentStoreErrorCode::Io,
        "Не удалось безопасно прочитать или сохранить историю.",
    )
}

#[cfg(test)]
mod tests {
    use std::{
        fs, io,
        path::{Path, PathBuf},
        sync::Arc,
        thread,
    };

    use sha2::{Digest, Sha256};
    use tempfile::tempdir;

    use super::{RecentRepositoryStore, RecentStoreErrorCode, SCHEMA_VERSION, write_atomic};

    #[test]
    fn listing_missing_history_is_empty_without_creating_storage() {
        let temp = tempdir().expect("temporary root");
        let app_data = temp.path().join("private-app-data");
        let store = RecentRepositoryStore::new(app_data.clone()).expect("store path");

        let listed = store.list().expect("missing history is empty");

        assert!(listed.is_empty());
        assert!(!app_data.exists());
    }

    #[test]
    fn records_reload_and_same_canonical_root_reuses_id_and_moves_to_front() {
        let temp = tempdir().expect("temporary root");
        let repo_a = temp.path().join("repo-a");
        let repo_b = temp.path().join("repo-b");
        fs::create_dir_all(&repo_a).unwrap();
        fs::create_dir_all(&repo_b).unwrap();
        let app_data = temp.path().join("app-data");
        let store = RecentRepositoryStore::new(app_data.clone()).unwrap();

        let repo_a = fs::canonicalize(repo_a).unwrap();
        let repo_b = fs::canonicalize(repo_b).unwrap();
        let a_first = store.record_opened(&repo_a, "A", 10).unwrap();
        store.record_opened(&repo_b, "B", 20).unwrap();
        let a_again = store
            .record_opened(&repo_a, "A renamed", 30)
            .expect("canonical duplicate updates existing entry");

        assert_eq!(a_first.recent_id, a_again.recent_id);
        let listed = RecentRepositoryStore::new(app_data)
            .unwrap()
            .list()
            .unwrap();
        assert_eq!(listed.len(), 2);
        assert_eq!(listed[0], a_again);
        assert_eq!(listed[1].display_name, "B");
        assert_eq!(store.resolve_recent(&a_again.recent_id).unwrap(), repo_a);
    }

    #[test]
    fn workspace_preference_survives_reopening_and_root_is_distinct_from_none() {
        let temp = tempdir().unwrap();
        let repo = temp.path().join("repo");
        fs::create_dir(&repo).unwrap();
        let repo = fs::canonicalize(repo).unwrap();
        let store = RecentRepositoryStore::new(temp.path().join("app-data")).unwrap();
        let recent = store.record_opened(&repo, "repo", 1).unwrap();

        store
            .remember_workspace(&repo, "areas/Payments QA")
            .unwrap();
        store.record_opened(&repo, "repo renamed", 2).unwrap();
        assert_eq!(
            store.last_workspace(&repo).unwrap().as_deref(),
            Some("areas/Payments QA")
        );

        store.remember_workspace(&repo, "").unwrap();
        assert_eq!(store.last_workspace(&repo).unwrap().as_deref(), Some(""));
        assert!(store.resolve_recent(&recent.recent_id).is_ok());
    }

    #[test]
    fn malformed_workspace_preference_is_rejected_without_rewriting_history() {
        let temp = tempdir().unwrap();
        let repo = temp.path().join("repo");
        fs::create_dir(&repo).unwrap();
        let repo = fs::canonicalize(repo).unwrap();
        let app_data = temp.path().join("app-data");
        let store = RecentRepositoryStore::new(app_data.clone()).unwrap();
        store.record_opened(&repo, "repo", 1).unwrap();
        let history_path = app_data.join("recent-repositories.json");
        let mut history: serde_json::Value =
            serde_json::from_slice(&fs::read(&history_path).unwrap()).unwrap();
        history["entries"][0]["lastWorkspacePath"] = serde_json::json!("../escape");
        let malformed = serde_json::to_vec(&history).unwrap();
        fs::write(&history_path, &malformed).unwrap();

        assert_eq!(
            store.list().unwrap_err().code,
            RecentStoreErrorCode::CorruptHistory
        );
        assert_eq!(
            store.remember_workspace(&repo, "").unwrap_err().code,
            RecentStoreErrorCode::CorruptHistory
        );
        assert_eq!(fs::read(history_path).unwrap(), malformed);
    }

    #[test]
    fn schema_v1_history_without_workspace_field_remains_readable_without_rewrite() {
        let temp = tempdir().unwrap();
        let repo = temp.path().join("repo");
        fs::create_dir(&repo).unwrap();
        let repo = fs::canonicalize(repo).unwrap();
        let app_data = temp.path().join("app-data");
        fs::create_dir(&app_data).unwrap();
        let history_path = app_data.join("recent-repositories.json");
        let history = serde_json::json!({
            "schemaVersion": 1,
            "entries": [{
                "recentId": "a1040000-0000-4000-8000-000000000001",
                "canonicalPath": repo,
                "displayName": "repo",
                "lastOpenedAtMs": 1
            }]
        })
        .to_string();
        fs::write(&history_path, &history).unwrap();
        let store = RecentRepositoryStore::new(app_data).unwrap();

        assert_eq!(store.list().unwrap().len(), 1);
        assert_eq!(store.last_workspace(&repo).unwrap(), None);
        assert_eq!(fs::read_to_string(history_path).unwrap(), history);
    }

    #[test]
    fn retains_missing_repository_and_rejects_invalid_or_unknown_ids() {
        let temp = tempdir().unwrap();
        let repo = temp.path().join("repo");
        fs::create_dir(&repo).unwrap();
        let repo = fs::canonicalize(repo).unwrap();
        let store = RecentRepositoryStore::new(temp.path().join("app-data")).unwrap();
        let recent = store.record_opened(&repo, "repo", 7).unwrap();
        fs::remove_dir(&repo).unwrap();

        assert_eq!(
            store.resolve_recent(&recent.recent_id).unwrap_err().code,
            RecentStoreErrorCode::MissingRepository
        );
        assert_eq!(store.list().unwrap().len(), 1);
        assert_eq!(
            store.resolve_recent("../repo").unwrap_err().code,
            RecentStoreErrorCode::InvalidRecentId
        );
        assert_eq!(
            store
                .resolve_recent("a1040000-0000-4000-8000-000000000000")
                .unwrap_err()
                .code,
            RecentStoreErrorCode::RecentNotFound
        );
    }

    #[test]
    fn corrupt_and_unsupported_history_are_never_overwritten() {
        let temp = tempdir().unwrap();
        let repo = temp.path().join("repo");
        fs::create_dir(&repo).unwrap();
        let repo = fs::canonicalize(repo).unwrap();
        for contents in [
            br"{ broken".as_slice(),
            br#"{"schemaVersion":99,"entries":[]}"#,
            br#"{"schemaVersion":1,"entries":[],"extra":true}"#,
        ] {
            let app_data = temp.path().join(format!("app-{}", contents.len()));
            fs::create_dir(&app_data).unwrap();
            let history = app_data.join("recent-repositories.json");
            fs::write(&history, contents).unwrap();
            let store = RecentRepositoryStore::new(app_data).unwrap();

            assert!(store.list().is_err());
            assert!(store.record_opened(&repo, "repo", 1).is_err());
            assert_eq!(fs::read(history).unwrap(), contents);
        }
    }

    #[test]
    fn rejects_noncanonical_uuid_and_duplicate_canonical_paths_in_history() {
        let temp = tempdir().unwrap();
        let repo = fs::canonicalize(temp.path()).unwrap();
        let app_data = temp.path().join("app-data");
        fs::create_dir(&app_data).unwrap();
        let make_history = |first_id: &str, second_id: &str| {
            serde_json::json!({
                "schemaVersion": 1,
                "entries": [
                    { "recentId": first_id, "canonicalPath": repo, "displayName": "one", "lastOpenedAtMs": 1 },
                    { "recentId": second_id, "canonicalPath": repo, "displayName": "two", "lastOpenedAtMs": 2 }
                ]
            })
            .to_string()
        };
        let lower = "a1040000-0000-4000-8000-000000000001";
        let other = "a1040000-0000-4000-8000-000000000002";
        let history_path = app_data.join("recent-repositories.json");
        let store = RecentRepositoryStore::new(app_data).unwrap();

        fs::write(&history_path, make_history(&lower.to_uppercase(), other)).unwrap();
        assert_eq!(
            store.list().unwrap_err().code,
            RecentStoreErrorCode::CorruptHistory
        );

        fs::write(&history_path, make_history(lower, other)).unwrap();
        assert_eq!(
            store.list().unwrap_err().code,
            RecentStoreErrorCode::CorruptHistory
        );
    }

    #[test]
    fn refuses_app_data_inside_repo_before_creating_anything() {
        let temp = tempdir().unwrap();
        let repo = temp.path().join("repo");
        fs::create_dir_all(repo.join("tracked")).unwrap();
        fs::write(repo.join("tracked/file.txt"), "unchanged").unwrap();
        let repo = fs::canonicalize(repo).unwrap();
        let app_data = repo.join("private/app-data");
        let store = RecentRepositoryStore::new(app_data.clone()).unwrap();
        let before = hash_tree(&repo);

        let error = store.record_opened(&repo, "repo", 1).unwrap_err();

        assert_eq!(
            error.code,
            RecentStoreErrorCode::DataDirectoryInsideRepository
        );
        assert!(!app_data.exists());
        assert_eq!(hash_tree(&repo), before);
        assert_eq!(
            fs::read(repo.join("tracked/file.txt")).unwrap(),
            b"unchanged"
        );
    }

    #[test]
    fn enforces_entry_limit_and_public_dto_does_not_serialize_path() {
        let temp = tempdir().unwrap();
        let app_data = temp.path().join("app-data");
        let store = RecentRepositoryStore::new(app_data).unwrap();
        for index in 0..21 {
            let repo = temp.path().join(format!("repo-{index}"));
            fs::create_dir(&repo).unwrap();
            let repo = fs::canonicalize(repo).unwrap();
            store
                .record_opened(&repo, &format!("repo-{index}"), index)
                .unwrap();
        }
        let listed = store.list().unwrap();

        assert_eq!(listed.len(), 20);
        assert_eq!(listed[0].display_name, "repo-20");
        assert_eq!(listed[19].display_name, "repo-1");
        let dto = serde_json::to_value(&listed[0]).unwrap();
        assert!(dto.get("canonicalPath").is_none());
        assert_eq!(dto["recentId"], listed[0].recent_id);
    }

    #[test]
    fn failed_atomic_publish_keeps_old_file_and_cleans_temporary_file() {
        let temp = tempdir().unwrap();
        let target = temp.path().join("history.json");
        fs::write(&target, b"old").unwrap();

        let failure = write_atomic(temp.path(), &target, b"new", || {
            Err(io::Error::new(io::ErrorKind::PermissionDenied, "injected"))
        });

        assert!(failure.is_err());
        assert_eq!(fs::read(&target).unwrap(), b"old");
        assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_reparse_history_file() {
        use std::os::unix::fs::symlink;
        let temp = tempdir().unwrap();
        let app_data = temp.path().join("app-data");
        fs::create_dir(&app_data).unwrap();
        fs::write(temp.path().join("target"), b"{}").unwrap();
        symlink(
            temp.path().join("target"),
            app_data.join("recent-repositories.json"),
        )
        .unwrap();
        let store = RecentRepositoryStore::new(app_data).unwrap();
        assert_eq!(
            store.list().unwrap_err().code,
            RecentStoreErrorCode::UnsafeHistoryPath
        );
    }

    #[test]
    fn rejects_noncanonical_repo_path_and_truncates_display_name_at_utf8_boundary() {
        let temp = tempdir().unwrap();
        let repo = temp.path().join("repo");
        fs::create_dir(&repo).unwrap();
        let canonical_repo = fs::canonicalize(&repo).unwrap();
        let store = RecentRepositoryStore::new(temp.path().join("app-data")).unwrap();
        let noncanonical = repo.join(".");
        assert_eq!(
            store
                .record_opened(&noncanonical, "repo", 1)
                .unwrap_err()
                .code,
            RecentStoreErrorCode::InvalidRepositoryPath
        );
        let long_name = "я".repeat(300);
        let saved = store.record_opened(&canonical_repo, &long_name, 2).unwrap();
        assert!(saved.display_name.len() <= 512);
        assert!(
            saved
                .display_name
                .is_char_boundary(saved.display_name.len())
        );
    }

    #[test]
    fn history_schema_version_is_one_for_new_records() {
        let temp = tempdir().unwrap();
        let repo = temp.path().join("repo");
        fs::create_dir(&repo).unwrap();
        let repo = fs::canonicalize(repo).unwrap();
        let store = RecentRepositoryStore::new(temp.path().join("app-data")).unwrap();
        store.record_opened(&repo, "repo", 1).unwrap();
        let json: serde_json::Value =
            serde_json::from_slice(&fs::read(store.history_path()).unwrap()).unwrap();
        assert_eq!(json["schemaVersion"], SCHEMA_VERSION);
    }

    #[test]
    fn root_scope_refusal_uses_path_components() {
        let temp = tempdir().unwrap();
        let repo = temp.path().join("repo");
        let sibling = temp.path().join("repo-cache");
        fs::create_dir(&repo).unwrap();
        fs::create_dir(&sibling).unwrap();
        let store = RecentRepositoryStore::new(sibling.clone()).unwrap();
        let repo = fs::canonicalize(repo).unwrap();
        assert!(store.record_opened(&repo, "repo", 1).is_ok());
        assert!(Path::new(&sibling).exists());
    }

    #[test]
    fn concurrent_records_do_not_lose_updates() {
        let temp = tempdir().unwrap();
        let app_data = temp.path().join("app-data");
        let store = Arc::new(RecentRepositoryStore::new(app_data).unwrap());
        let mut workers = Vec::new();
        for index in 0..8 {
            let root = temp.path().join(format!("repo-{index}"));
            fs::create_dir(&root).unwrap();
            let root = fs::canonicalize(root).unwrap();
            let store = Arc::clone(&store);
            workers.push(thread::spawn(move || {
                store.record_opened(&root, &format!("repo-{index}"), index)
            }));
        }
        for worker in workers {
            worker.join().unwrap().unwrap();
        }
        assert_eq!(store.list().unwrap().len(), 8);
    }

    #[test]
    fn rejects_oversized_history_and_unsafe_timestamp() {
        let temp = tempdir().unwrap();
        let app_data = temp.path().join("app-data");
        fs::create_dir(&app_data).unwrap();
        fs::write(
            app_data.join("recent-repositories.json"),
            vec![b' '; 65_537],
        )
        .unwrap();
        let store = RecentRepositoryStore::new(app_data).unwrap();
        assert_eq!(
            store.list().unwrap_err().code,
            RecentStoreErrorCode::HistoryTooLarge
        );

        let repo = temp.path().join("repo");
        fs::create_dir(&repo).unwrap();
        let repo = fs::canonicalize(repo).unwrap();
        let store = RecentRepositoryStore::new(temp.path().join("other-app-data")).unwrap();
        assert_eq!(
            store
                .record_opened(&repo, "repo", 9_007_199_254_740_992)
                .unwrap_err()
                .code,
            RecentStoreErrorCode::InvalidTimestamp
        );
    }

    fn hash_tree(root: &Path) -> Vec<(PathBuf, [u8; 32])> {
        fn visit(root: &Path, directory: &Path, output: &mut Vec<(PathBuf, [u8; 32])>) {
            for entry in fs::read_dir(directory).unwrap() {
                let entry = entry.unwrap();
                let path = entry.path();
                let metadata = fs::symlink_metadata(&path).unwrap();
                if metadata.is_dir() {
                    visit(root, &path, output);
                } else if metadata.is_file() {
                    output.push((
                        path.strip_prefix(root).unwrap().to_path_buf(),
                        Sha256::digest(fs::read(path).unwrap()).into(),
                    ));
                }
            }
        }
        let mut output = Vec::new();
        visit(root, root, &mut output);
        output.sort_by(|left, right| left.0.cmp(&right.0));
        output
    }
}
