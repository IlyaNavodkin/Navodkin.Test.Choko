use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use uuid::{Uuid, Variant};

use crate::{
    ipc::{IpcError, IpcErrorCode, validate_caller},
    services::recents::{
        RecentRepositoryDto, RecentRepositoryStore, RecentStoreError, RecentStoreErrorCode,
    },
    services::repository::{
        CaseDocumentDto, OpenRepositoryDto, RepositoryError, RepositoryErrorCode,
        RepositoryService, RunResourceDocumentDto, RunsCatalogDto, WorkspaceCatalogDto,
    },
};

const PROTOCOL_VERSION: u16 = 1;
const MAX_WORKSPACE_PATH_BYTES: usize = 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ProtocolRequest {
    protocol_version: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SessionRequest {
    protocol_version: u16,
    session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct WorkspaceRequest {
    protocol_version: u16,
    session_id: String,
    workspace_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RememberWorkspaceRequest {
    protocol_version: u16,
    session_id: String,
    workspace_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ResourceRequest {
    protocol_version: u16,
    session_id: String,
    resource_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SaveCaseRequest {
    protocol_version: u16,
    session_id: String,
    resource_id: String,
    expected_revision: String,
    edit: crate::services::repository::CaseEdit,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SaveRunCaseRequest {
    protocol_version: u16,
    session_id: String,
    resource_id: String,
    expected_revision: String,
    edit: crate::services::repository::RunCaseEdit,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct SaveRunDetailsRequest {
    protocol_version: u16,
    session_id: String,
    resource_id: String,
    expected_revision: String,
    edit: crate::services::repository::RunDetailsEdit,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CreateCaseRequest {
    protocol_version: u16,
    session_id: String,
    creation: crate::services::repository::CaseCreation,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RecentRepositoryRequest {
    protocol_version: u16,
    recent_id: String,
}

#[derive(Default)]
pub(crate) struct RepositoryCommandState {
    pub(crate) service: Arc<RepositoryService>,
    pub(crate) mutations: Arc<crate::mutation_queue::MutationQueues>,
    picker_active: Arc<AtomicBool>,
    recents: Option<Arc<RecentRepositoryStore>>,
}

impl RepositoryCommandState {
    pub(crate) fn with_recents(
        recents: Option<Arc<RecentRepositoryStore>>,
        app: AppHandle,
    ) -> Self {
        Self {
            service: Arc::new(RepositoryService::with_event_sink(Arc::new(move |event| {
                use tauri::Emitter;
                let _ = app.emit_to("main", "repository-changed", event);
            }))),
            mutations: Arc::default(),
            picker_active: Arc::default(),
            recents,
        }
    }
}

struct PickerGuard(Arc<AtomicBool>);

impl PickerGuard {
    fn acquire(active: Arc<AtomicBool>) -> Result<Self, IpcError> {
        active
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| {
                IpcError::new(
                    IpcErrorCode::PickerBusy,
                    "Выбор репозитория уже выполняется.",
                )
            })?;
        Ok(Self(active))
    }
}

impl Drop for PickerGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

fn validate_protocol(version: u16) -> Result<(), IpcError> {
    if version == PROTOCOL_VERSION {
        Ok(())
    } else {
        Err(IpcError::invalid_request())
    }
}

fn validate_uuid(value: &str) -> Result<(), IpcError> {
    if value.len() != 36 {
        return Err(IpcError::invalid_request());
    }
    let parsed = Uuid::parse_str(value).map_err(|_| IpcError::invalid_request())?;
    if parsed.to_string() != value
        || parsed.get_version_num() != 4
        || parsed.get_variant() != Variant::RFC4122
    {
        return Err(IpcError::invalid_request());
    }
    Ok(())
}

fn validate_session(request: &SessionRequest) -> Result<(), IpcError> {
    validate_protocol(request.protocol_version)?;
    validate_uuid(&request.session_id)
}

fn validate_resource(request: &ResourceRequest) -> Result<(), IpcError> {
    validate_protocol(request.protocol_version)?;
    validate_uuid(&request.session_id)?;
    validate_uuid(&request.resource_id)
}

fn validate_workspace(request: &WorkspaceRequest) -> Result<(), IpcError> {
    validate_protocol(request.protocol_version)?;
    validate_uuid(&request.session_id)?;
    if request.workspace_path.len() > MAX_WORKSPACE_PATH_BYTES
        || request.workspace_path.contains('\0')
        || request.workspace_path.contains('\\')
    {
        return Err(IpcError::invalid_request());
    }
    Ok(())
}

fn validate_remember_workspace(request: &WorkspaceRequest) -> Result<(), IpcError> {
    validate_workspace(request)?;
    let path = request.workspace_path.as_str();
    if path.starts_with('/')
        || path.contains(':')
        || (!path.is_empty()
            && path.split('/').any(|component| {
                component.is_empty()
                    || component == "."
                    || component == ".."
                    || component.eq_ignore_ascii_case(".git")
            }))
    {
        return Err(IpcError::invalid_request());
    }
    Ok(())
}

fn validate_remember_workspace_request(request: &RememberWorkspaceRequest) -> Result<(), IpcError> {
    validate_protocol(request.protocol_version)?;
    validate_uuid(&request.session_id)?;
    validate_remember_workspace(&WorkspaceRequest {
        protocol_version: request.protocol_version,
        session_id: request.session_id.clone(),
        workspace_path: request.workspace_path.clone(),
    })
}

// Keep the exhaustive public error mapping together.
#[allow(clippy::too_many_lines)]
fn map_repository_error(error: &RepositoryError) -> IpcError {
    let (code, message) = match error.code {
        RepositoryErrorCode::InitializationUnavailable => (
            IpcErrorCode::InitializationUnavailable,
            "Существующая структура .casewright не перезаписывается. Проверьте её конфигурацию.",
        ),
        RepositoryErrorCode::InitializationFailed => (
            IpcErrorCode::InitializationFailed,
            "Не удалось создать структуру репозитория. Проверьте права доступа и свободное место.",
        ),
        RepositoryErrorCode::InvalidRunEdit => (
            IpcErrorCode::InvalidRunEdit,
            "Поля результата или структура прогона недопустимы; файл не изменён.",
        ),
        RepositoryErrorCode::InvalidRunCreation => (
            IpcErrorCode::InvalidRunCreation,
            "Параметры нового прогона недопустимы.",
        ),
        RepositoryErrorCode::InvalidSuiteOperation => (
            IpcErrorCode::InvalidSuiteOperation,
            "Не удалось безопасно подготовить операцию с папкой. Проверьте границы, размер, имена и целостность кейсов.",
        ),
        RepositoryErrorCode::SuiteRecoveryRequired => (
            IpcErrorCode::SuiteRecoveryRequired,
            "Незавершённая операция с папкой требует внешней проверки. Некоторые явно подтверждённые файлы могли быть удалены; дальнейшая запись заблокирована.",
        ),
        RepositoryErrorCode::InvalidSuiteCreation => (
            IpcErrorCode::InvalidSuiteCreation,
            "Имя папки недопустимо. Используйте до 180 байт без служебных имён, путей и специальных символов.",
        ),
        RepositoryErrorCode::InvalidCaseEdit => (
            IpcErrorCode::InvalidCaseEdit,
            "Поля или структура кейса недопустимы; файл не изменён.",
        ),
        RepositoryErrorCode::ReadOnlyCase => (
            IpcErrorCode::ReadOnlyCase,
            "Кейс без корректного stable id доступен только для чтения.",
        ),
        RepositoryErrorCode::ExternalChange => (
            IpcErrorCode::ExternalChange,
            "Файл изменён вне редактора; черновик не записан поверх новой версии.",
        ),
        RepositoryErrorCode::SaveFailed => (
            IpcErrorCode::SaveFailed,
            "Не удалось сохранить кейс. Черновик остаётся в редакторе.",
        ),
        RepositoryErrorCode::NotGitRepository => (
            IpcErrorCode::NotGitRepository,
            "Выбранный каталог не является Git-репозиторием.",
        ),
        RepositoryErrorCode::BareRepository => (
            IpcErrorCode::BareRepository,
            "Bare Git-репозитории не поддерживаются.",
        ),
        RepositoryErrorCode::SelectedSubdirectory => (
            IpcErrorCode::SelectedSubdirectory,
            "Выберите корень Git-репозитория.",
        ),
        RepositoryErrorCode::UnsupportedVersion => (
            IpcErrorCode::UnsupportedVersion,
            "Версия конфигурации репозитория не поддерживается.",
        ),
        RepositoryErrorCode::InvalidSession => (
            IpcErrorCode::InvalidSession,
            "Сессия репозитория закрыта или не существует.",
        ),
        RepositoryErrorCode::InvalidResource => (
            IpcErrorCode::InvalidResource,
            "Ресурс отсутствует в актуальном каталоге.",
        ),
        RepositoryErrorCode::StaleResource => (
            IpcErrorCode::StaleResource,
            "Файл изменился после построения каталога. Обновите каталог.",
        ),
        RepositoryErrorCode::InvalidConfig => (
            IpcErrorCode::InvalidConfig,
            "Конфигурация репозитория повреждена.",
        ),
        RepositoryErrorCode::UnsupportedLegacyFormat => (
            IpcErrorCode::UnsupportedLegacyFormat,
            "Устаревший формат репозитория не поддерживается; автоматическая миграция не выполняется.",
        ),
        RepositoryErrorCode::GitRecoveryRequired => (
            IpcErrorCode::GitRecoveryRequired,
            "Git требует внешнего восстановления индекса.",
        ),
        RepositoryErrorCode::GitSyncBlocked => (
            IpcErrorCode::GitSyncBlocked,
            "Git: проверьте состояние и настройки во внешнем Git.",
        ),
        RepositoryErrorCode::GitDirty => (
            IpcErrorCode::GitDirty,
            "Git: проверьте состояние и настройки во внешнем Git.",
        ),
        RepositoryErrorCode::GitNoUpstream => (
            IpcErrorCode::GitNoUpstream,
            "Git: проверьте состояние и настройки во внешнем Git.",
        ),
        RepositoryErrorCode::GitAuthFailed => (
            IpcErrorCode::GitAuthFailed,
            "Git: проверьте состояние и настройки во внешнем Git.",
        ),
        RepositoryErrorCode::GitRemoteFailed => (
            IpcErrorCode::GitRemoteFailed,
            "Git: проверьте состояние и настройки во внешнем Git.",
        ),
        RepositoryErrorCode::GitNetworkFailed => (
            IpcErrorCode::GitNetworkFailed,
            "Git: проверьте состояние и настройки во внешнем Git.",
        ),
        RepositoryErrorCode::GitPushRejected => (
            IpcErrorCode::GitPushRejected,
            "Git: проверьте состояние и настройки во внешнем Git.",
        ),
        RepositoryErrorCode::GitAbortFailed => (
            IpcErrorCode::GitAbortFailed,
            "Git: проверьте состояние и настройки во внешнем Git.",
        ),
        RepositoryErrorCode::GitCommitBlocked => (
            IpcErrorCode::GitCommitBlocked,
            "Commit заблокирован. Используйте внешний Git.",
        ),
        RepositoryErrorCode::GitIdentityMissing => {
            (IpcErrorCode::GitIdentityMissing, "Настройте Git identity.")
        }
        RepositoryErrorCode::GitFailed => (
            IpcErrorCode::GitFailed,
            "Не удалось прочитать Git. Проверьте состояние репозитория и повторите обновление.",
        ),
        RepositoryErrorCode::GitOutputTooLarge => (
            IpcErrorCode::GitOutputTooLarge,
            "Git-вывод превышает лимит просмотра.",
        ),
        RepositoryErrorCode::GitUnavailable => (
            IpcErrorCode::GitUnavailable,
            "Системный Git не найден. Установите Git и проверьте PATH.",
        ),
        RepositoryErrorCode::GitTimedOut => (
            IpcErrorCode::GitTimedOut,
            "Проверка системного Git не завершилась вовремя.",
        ),
        RepositoryErrorCode::InvalidDocument => (
            IpcErrorCode::InvalidDocument,
            "Содержимое файла не соответствует поддерживаемому формату.",
        ),
        RepositoryErrorCode::FileTooLarge => (
            IpcErrorCode::FileTooLarge,
            "Размер файла превышает безопасный лимит чтения.",
        ),
        RepositoryErrorCode::InvalidUtf8 => (
            IpcErrorCode::InvalidUtf8,
            "Файл не содержит корректный UTF-8 текст.",
        ),
        RepositoryErrorCode::InvalidRepositoryPath
        | RepositoryErrorCode::PathEscapesRepository
        | RepositoryErrorCode::InvalidRelativePath => (
            IpcErrorCode::InvalidRepository,
            "Путь репозитория недопустим или выходит за его границы.",
        ),
        RepositoryErrorCode::Io | RepositoryErrorCode::SessionRegistry => (
            IpcErrorCode::RepositoryIo,
            "Не удалось безопасно прочитать данные репозитория.",
        ),
    };
    IpcError::new(code, message)
}

fn map_recent_error(error: &RecentStoreError) -> IpcError {
    let (code, message) = match error.code {
        RecentStoreErrorCode::InvalidRecentId => (
            IpcErrorCode::InvalidRequest,
            "Идентификатор недавнего репозитория некорректен.",
        ),
        RecentStoreErrorCode::RecentNotFound => (
            IpcErrorCode::RecentNotFound,
            "Репозиторий отсутствует в списке недавних.",
        ),
        RecentStoreErrorCode::MissingRepository | RecentStoreErrorCode::RepositoryPathChanged => (
            IpcErrorCode::RecentRepositoryMissing,
            "Сохранённый каталог репозитория недоступен.",
        ),
        _ => (
            IpcErrorCode::RecentHistoryUnavailable,
            "История репозиториев недоступна; её содержимое не изменено.",
        ),
    };
    IpcError::new(code, message)
}

async fn run_mutation<T, F>(
    ticket: crate::mutation_queue::Ticket,
    operation: F,
) -> Result<T, IpcError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, IpcError> + Send + 'static,
{
    let lease = ticket.await?;
    run_blocking(move || {
        let result = operation();
        lease.complete(result.is_ok());
        result
    })
    .await
}

#[tauri::command]
pub(super) async fn flush_repository(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: SessionRequest,
) -> Result<(), IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_session(&request)?;
    let ticket = state.mutations.admit(&request.session_id, true)?;
    let service = Arc::clone(&state.service);
    run_mutation(ticket, move || {
        service
            .canonical_root_for_session(&request.session_id)
            .map(|_| ())
            .map_err(|error| map_repository_error(&error))
    })
    .await
}

async fn run_blocking<T, F>(operation: F) -> Result<T, IpcError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, IpcError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|_| IpcError::internal())?
}

fn finish_picker_selection<T, O, F>(selected: Option<T>, open: F) -> Result<Option<O>, IpcError>
where
    F: FnOnce(T) -> Result<O, IpcError>,
{
    selected.map(open).transpose()
}

fn record_recent_best_effort(
    service: &RepositoryService,
    store: Option<&RecentRepositoryStore>,
    mut opened: OpenRepositoryDto,
    now_unix_millis: Option<u64>,
) -> OpenRepositoryDto {
    apply_preferred_workspace(service, store, &mut opened);
    let recorded = match (store, now_unix_millis) {
        (Some(store), Some(now)) => service
            .canonical_root_for_session(&opened.session_id)
            .is_ok_and(|root| {
                store
                    .record_opened(&root, &opened.display_name, now)
                    .is_ok()
            }),
        _ => false,
    };
    if !recorded {
        opened
            .warnings
            .push(crate::services::repository::RepositoryWarning {
                code: crate::services::repository::RepositoryWarningCode::RecentHistoryUnavailable,
                message: "Не удалось обновить историю недавних репозиториев.".into(),
            });
    }
    opened
}

fn apply_preferred_workspace(
    service: &RepositoryService,
    store: Option<&RecentRepositoryStore>,
    opened: &mut OpenRepositoryDto,
) {
    let saved_path = store.and_then(|store| {
        service
            .canonical_root_for_session(&opened.session_id)
            .ok()
            .and_then(|root| store.last_workspace(&root).ok().flatten())
    });
    if let Some(saved_path) = saved_path {
        match service.declared_workspace_for_session(&opened.session_id, &saved_path) {
            Ok(path) => {
                opened.preferred_workspace_path = Some(path);
                return;
            }
            Err(_) => opened.warnings.push(crate::services::repository::RepositoryWarning {
                code: crate::services::repository::RepositoryWarningCode::PreferredWorkspaceUnavailable,
                message: "Последняя рабочая область больше недоступна; выбрана первая доступная.".into(),
            }),
        }
    }
    opened.preferred_workspace_path = opened.workspaces.iter().find_map(|workspace| {
        service
            .declared_workspace_for_session(&opened.session_id, &workspace.path)
            .ok()
    });
}

fn open_recent_inner(
    service: &RepositoryService,
    store: &RecentRepositoryStore,
    recent_id: &str,
    now_unix_millis: Option<u64>,
) -> Result<OpenRepositoryDto, IpcError> {
    let path = store
        .resolve_recent(recent_id)
        .map_err(|error| map_recent_error(&error))?;
    let opened = service
        .open(path)
        .map_err(|error| map_repository_error(&error))?;
    Ok(record_recent_best_effort(
        service,
        Some(store),
        opened,
        now_unix_millis,
    ))
}

fn remember_workspace_inner(
    service: &RepositoryService,
    store: &RecentRepositoryStore,
    session_id: &str,
    workspace_path: &str,
) -> Result<(), IpcError> {
    let root = service
        .canonical_root_for_session(session_id)
        .map_err(|error| map_repository_error(&error))?;
    let declared = service
        .declared_workspace_for_session(session_id, workspace_path)
        .map_err(|error| map_repository_error(&error))?;
    store
        .remember_workspace(&root, &declared)
        .map_err(|error| map_recent_error(&error))
}

fn current_time_unix_millis() -> Option<u64> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis();
    u64::try_from(millis).ok()
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)] // Tauri commands receive managed state/window/app arguments by value.
pub(super) async fn pick_repository(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, RepositoryCommandState>,
    request: ProtocolRequest,
) -> Result<Option<OpenRepositoryDto>, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_protocol(request.protocol_version)?;
    let guard = PickerGuard::acquire(Arc::clone(&state.picker_active))?;
    let service = Arc::clone(&state.service);
    let recents = state.recents.clone();
    run_blocking(move || {
        let _guard = guard;
        let selected = app
            .dialog()
            .file()
            .set_parent(&window)
            .set_title("Выберите Git-репозиторий")
            .set_can_create_directories(false)
            .blocking_pick_folder();
        let path = selected
            .map(|selected| {
                selected.into_path().map_err(|_| {
                    IpcError::new(
                        IpcErrorCode::PickerFailed,
                        "Не удалось получить выбранный каталог.",
                    )
                })
            })
            .transpose()?;
        finish_picker_selection(path, |path| {
            let opened = service
                .open(path)
                .map_err(|error| map_repository_error(&error))?;
            Ok(record_recent_best_effort(
                &service,
                recents.as_deref(),
                opened,
                current_time_unix_millis(),
            ))
        })
    })
    .await
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn list_recent_repositories(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: ProtocolRequest,
) -> Result<Vec<RecentRepositoryDto>, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_protocol(request.protocol_version)?;
    let recents = state.recents.clone();
    run_blocking(move || {
        recents
            .ok_or_else(|| {
                IpcError::new(
                    IpcErrorCode::RecentHistoryUnavailable,
                    "История репозиториев недоступна; её содержимое не изменено.",
                )
            })?
            .list()
            .map_err(|error| map_recent_error(&error))
    })
    .await
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn open_recent_repository(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: RecentRepositoryRequest,
) -> Result<OpenRepositoryDto, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_protocol(request.protocol_version)?;
    validate_uuid(&request.recent_id)?;
    let service = Arc::clone(&state.service);
    let recents = state.recents.clone();
    run_blocking(move || {
        let store = recents.ok_or_else(|| {
            IpcError::new(
                IpcErrorCode::RecentHistoryUnavailable,
                "История репозиториев недоступна; её содержимое не изменено.",
            )
        })?;
        open_recent_inner(
            &service,
            &store,
            &request.recent_id,
            current_time_unix_millis(),
        )
    })
    .await
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn initialize_repository(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: SessionRequest,
) -> Result<OpenRepositoryDto, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_session(&request)?;
    let service = Arc::clone(&state.service);
    let recents = state.recents.clone();
    let ticket = state.mutations.admit(&request.session_id, false)?;
    run_mutation(ticket, move || {
        let opened = service
            .initialize_repository(&request.session_id)
            .map_err(|error| map_repository_error(&error))?;
        Ok(record_recent_best_effort(
            &service,
            recents.as_deref(),
            opened,
            current_time_unix_millis(),
        ))
    })
    .await
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)] // Tauri commands receive managed state/window arguments by value.
pub(super) async fn close_repository(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    automation: State<'_, crate::automation_commands::AutomationCommandState>,
    request: SessionRequest,
) -> Result<(), IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_session(&request)?;
    let automation = Arc::clone(&automation.0);
    let session = request.session_id.clone();
    tauri::async_runtime::spawn_blocking(move || automation.close_session(&session))
        .await
        .map_err(|_| IpcError::internal())?
        .map_err(|_| {
            IpcError::new(
                IpcErrorCode::WriteFlushFailed,
                "Не удалось завершить процессы автоматизации и сохранить результат.",
            )
        })?;
    let service = Arc::clone(&state.service);
    let ticket = state.mutations.admit(&request.session_id, true)?;
    run_mutation(ticket, move || {
        service
            .close(&request.session_id)
            .map_err(|error| map_repository_error(&error))
    })
    .await
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn catalog_workspace(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: WorkspaceRequest,
) -> Result<WorkspaceCatalogDto, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_workspace(&request)?;
    let service = Arc::clone(&state.service);
    run_blocking(move || {
        service
            .catalog_workspace(&request.session_id, &request.workspace_path)
            .map_err(|error| map_repository_error(&error))
    })
    .await
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn remember_workspace(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: RememberWorkspaceRequest,
) -> Result<(), IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_remember_workspace_request(&request)?;
    let service = Arc::clone(&state.service);
    let recents = state.recents.clone();
    run_blocking(move || {
        let store = recents.ok_or_else(|| {
            IpcError::new(
                IpcErrorCode::RecentHistoryUnavailable,
                "История репозиториев недоступна; выбор рабочей области не сохранён.",
            )
        })?;
        remember_workspace_inner(
            &service,
            &store,
            &request.session_id,
            &request.workspace_path,
        )
    })
    .await
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn save_case(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: SaveCaseRequest,
) -> Result<CaseDocumentDto, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_protocol(request.protocol_version)?;
    validate_uuid(&request.session_id)?;
    validate_uuid(&request.resource_id)?;
    request
        .edit
        .validate()
        .map_err(|error| map_repository_error(&error))?;
    let service = Arc::clone(&state.service);
    let ticket = state.mutations.admit(&request.session_id, false)?;
    run_mutation(ticket, move || {
        service
            .save_case(
                &request.session_id,
                &request.resource_id,
                &request.expected_revision,
                request.edit,
            )
            .map_err(|error| map_repository_error(&error))
    })
    .await
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn save_run_case(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: SaveRunCaseRequest,
) -> Result<RunResourceDocumentDto, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_protocol(request.protocol_version)?;
    validate_uuid(&request.session_id)?;
    validate_uuid(&request.resource_id)?;
    request
        .edit
        .validate()
        .map_err(|error| map_repository_error(&error))?;
    let service = Arc::clone(&state.service);
    let ticket = state.mutations.admit(&request.session_id, false)?;
    run_mutation(ticket, move || {
        service
            .save_run_case(
                &request.session_id,
                &request.resource_id,
                &request.expected_revision,
                request.edit,
            )
            .map_err(|error| map_repository_error(&error))
    })
    .await
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn save_run_details(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: SaveRunDetailsRequest,
) -> Result<RunResourceDocumentDto, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_protocol(request.protocol_version)?;
    validate_uuid(&request.session_id)?;
    validate_uuid(&request.resource_id)?;
    request
        .edit
        .validate()
        .map_err(|error| map_repository_error(&error))?;
    let service = Arc::clone(&state.service);
    let ticket = state.mutations.admit(&request.session_id, false)?;
    run_mutation(ticket, move || {
        service
            .save_run_details(
                &request.session_id,
                &request.resource_id,
                &request.expected_revision,
                &request.edit,
            )
            .map_err(|error| map_repository_error(&error))
    })
    .await
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn read_case(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: ResourceRequest,
) -> Result<CaseDocumentDto, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_resource(&request)?;
    let service = Arc::clone(&state.service);
    run_blocking(move || {
        service
            .read_case(&request.session_id, &request.resource_id)
            .map_err(|error| map_repository_error(&error))
    })
    .await
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn catalog_runs(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: SessionRequest,
) -> Result<RunsCatalogDto, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_session(&request)?;
    let service = Arc::clone(&state.service);
    run_blocking(move || {
        service
            .catalog_runs(&request.session_id)
            .map_err(|error| map_repository_error(&error))
    })
    .await
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn read_run(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: ResourceRequest,
) -> Result<RunResourceDocumentDto, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_resource(&request)?;
    let service = Arc::clone(&state.service);
    run_blocking(move || {
        service
            .read_run(&request.session_id, &request.resource_id)
            .map_err(|error| map_repository_error(&error))
    })
    .await
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
        process::Command,
    };

    use super::*;
    use crate::services::repository::RepositoryWarningCode;
    use serde_json::json;
    use sha2::{Digest, Sha256};
    use tempfile::tempdir;

    const VALID_UUID: &str = "550e8400-e29b-41d4-a716-446655440000";

    #[test]
    fn requests_reject_unknown_fields_wrong_versions_and_invalid_tokens() {
        assert!(
            serde_json::from_value::<ProtocolRequest>(json!({
                "protocolVersion": 1,
                "path": "C:/private"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<SessionRequest>(json!({
                "protocolVersion": 1,
                "sessionId": VALID_UUID,
                "repoPath": "C:/private"
            }))
            .is_err()
        );
        assert!(validate_protocol(2).is_err());
        assert!(validate_uuid("../private").is_err());
        assert!(validate_uuid("550E8400-E29B-41D4-A716-446655440000").is_err());
        assert!(validate_uuid("770e8400-e29b-41d4-4716-446655440000").is_err());
        assert!(validate_uuid(VALID_UUID).is_ok());
        assert!(
            serde_json::from_value::<RecentRepositoryRequest>(json!({
                "protocolVersion": 1,
                "recentId": VALID_UUID,
                "path": "C:/private"
            }))
            .is_err()
        );
        assert!(validate_uuid("550E8400-E29B-41D4-A716-446655440000").is_err());
        assert!(validate_uuid("550e8400-e29b-41d4-a716-446655440000").is_ok());
        assert!(
            validate_session(&SessionRequest {
                protocol_version: 1,
                session_id: VALID_UUID.into(),
            })
            .is_ok()
        );
    }

    #[test]
    fn workspace_request_has_a_byte_limit_and_no_windows_separator() {
        let request = WorkspaceRequest {
            protocol_version: 1,
            session_id: VALID_UUID.into(),
            workspace_path: "x".repeat(MAX_WORKSPACE_PATH_BYTES + 1),
        };
        assert_eq!(
            validate_workspace(&request).unwrap_err().code,
            IpcErrorCode::InvalidRequest
        );
        let request = WorkspaceRequest {
            protocol_version: 1,
            session_id: VALID_UUID.into(),
            workspace_path: "areas\\escape".into(),
        };
        assert_eq!(
            validate_workspace(&request).unwrap_err().code,
            IpcErrorCode::InvalidRequest
        );
        let request = WorkspaceRequest {
            protocol_version: 1,
            session_id: VALID_UUID.into(),
            workspace_path: "areas/valid".into(),
        };
        assert!(validate_workspace(&request).is_ok());
    }

    #[test]
    fn remember_workspace_request_rejects_unsafe_paths_but_accepts_root() {
        for path in [
            "../escape",
            "areas/../escape",
            "/absolute",
            "C:/drive",
            "areas/.git",
            "areas\\windows",
        ] {
            let request = WorkspaceRequest {
                protocol_version: 1,
                session_id: VALID_UUID.into(),
                workspace_path: path.into(),
            };
            assert_eq!(
                validate_remember_workspace(&request).unwrap_err().code,
                IpcErrorCode::InvalidRequest,
                "{path}"
            );
        }
        let root = WorkspaceRequest {
            protocol_version: 1,
            session_id: VALID_UUID.into(),
            workspace_path: String::new(),
        };
        assert!(validate_remember_workspace(&root).is_ok());
        let unicode_too_large = WorkspaceRequest {
            protocol_version: 1,
            session_id: VALID_UUID.into(),
            workspace_path: "界".repeat(MAX_WORKSPACE_PATH_BYTES / 3 + 1),
        };
        assert!(validate_remember_workspace(&unicode_too_large).is_err());
        assert!(serde_json::from_value::<RememberWorkspaceRequest>(json!({
            "protocolVersion": 1, "sessionId": VALID_UUID, "workspacePath": "areas/QA", "repoPath": "C:/secret"
        })).is_err());
        assert!(
            validate_remember_workspace_request(&RememberWorkspaceRequest {
                protocol_version: 2,
                session_id: VALID_UUID.into(),
                workspace_path: String::new()
            })
            .is_err()
        );
    }

    #[test]
    fn picker_guard_is_single_flight_and_releases_on_drop_and_unwind() {
        let active = Arc::new(AtomicBool::new(false));
        let guard = PickerGuard::acquire(Arc::clone(&active)).expect("first picker");
        assert!(PickerGuard::acquire(Arc::clone(&active)).is_err());
        drop(guard);
        assert!(!active.load(Ordering::Acquire));

        let panic_active = Arc::clone(&active);
        let result = std::panic::catch_unwind(move || {
            let _guard = PickerGuard::acquire(panic_active).expect("picker after drop");
            panic!("simulated blocking picker panic");
        });
        assert!(result.is_err());
        assert!(!active.load(Ordering::Acquire));
    }

    #[test]
    fn picker_cancel_and_open_failure_release_the_single_flight_guard() {
        let active = Arc::new(AtomicBool::new(false));
        {
            let _guard = PickerGuard::acquire(Arc::clone(&active)).expect("picker guard");
            let result = finish_picker_selection::<(), (), _>(None, |()| {
                panic!("cancel must not open a repository")
            });
            assert_eq!(result.unwrap(), None);
            assert!(active.load(Ordering::Acquire));
        }
        assert!(!active.load(Ordering::Acquire));

        let result = {
            let _guard = PickerGuard::acquire(Arc::clone(&active)).expect("picker guard");
            finish_picker_selection(Some(()), |()| Err::<(), _>(IpcError::internal()))
        };
        assert_eq!(result.unwrap_err().code, IpcErrorCode::Internal);
        assert!(!active.load(Ordering::Acquire));
    }

    #[test]
    fn mapped_errors_keep_semantic_codes_without_native_paths_or_stderr() {
        let errors = [
            (
                RepositoryErrorCode::NotGitRepository,
                IpcErrorCode::NotGitRepository,
            ),
            (
                RepositoryErrorCode::SelectedSubdirectory,
                IpcErrorCode::SelectedSubdirectory,
            ),
            (
                RepositoryErrorCode::StaleResource,
                IpcErrorCode::StaleResource,
            ),
            (
                RepositoryErrorCode::InvalidSession,
                IpcErrorCode::InvalidSession,
            ),
        ];
        for (repository_code, expected_code) in errors {
            let repository_error = RepositoryError {
                code: repository_code,
                message: "D:/private/secret with native error 0x1234".into(),
            };
            let error = map_repository_error(&repository_error);
            assert_eq!(error.code, expected_code);
            let serialized = serde_json::to_string(&error).expect("serialize safe error");
            assert!(!serialized.contains("D:/private"));
            assert!(!serialized.contains("0x1234"));
        }
    }

    #[test]
    fn actionable_repository_errors_have_safe_specific_codes_and_messages() {
        let cases = [
            (
                RepositoryErrorCode::GitUnavailable,
                IpcErrorCode::GitUnavailable,
            ),
            (RepositoryErrorCode::GitTimedOut, IpcErrorCode::GitTimedOut),
            (
                RepositoryErrorCode::InvalidDocument,
                IpcErrorCode::InvalidDocument,
            ),
            (
                RepositoryErrorCode::FileTooLarge,
                IpcErrorCode::FileTooLarge,
            ),
            (RepositoryErrorCode::InvalidUtf8, IpcErrorCode::InvalidUtf8),
            (
                RepositoryErrorCode::UnsupportedLegacyFormat,
                IpcErrorCode::UnsupportedLegacyFormat,
            ),
        ];
        for (repository_code, expected_code) in cases {
            let repository_error = RepositoryError {
                code: repository_code,
                message: "C:/private/secret native stderr".into(),
            };
            let error = map_repository_error(&repository_error);
            assert_eq!(error.code, expected_code);
            let serialized = serde_json::to_string(&error).expect("serialize safe error");
            assert!(!serialized.contains("C:/private"));
            assert!(!serialized.contains("stderr"));
        }
    }

    #[test]
    fn managed_repository_state_is_send_and_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<RepositoryCommandState>();
    }

    #[test]
    fn canceled_picker_does_not_create_or_write_history() {
        let temp = tempdir().unwrap();
        let app_data = temp.path().join("app-data");
        let store = RecentRepositoryStore::new(app_data.clone()).unwrap();
        let selection: Option<PathBuf> = None;
        let result = finish_picker_selection(selection, |path| {
            let service = RepositoryService::default();
            let opened = service
                .open(path)
                .map_err(|error| map_repository_error(&error))?;
            Ok(record_recent_best_effort(
                &service,
                Some(&store),
                opened,
                Some(1),
            ))
        })
        .unwrap();

        assert!(result.is_none());
        assert!(!app_data.exists());
        assert!(store.list().unwrap().is_empty());
    }

    #[test]
    fn recent_write_failure_is_a_warning_and_does_not_fail_repository_open() {
        let temp = tempdir().unwrap();
        let repo = temp.path().join("repo");
        create_git_repo(&repo, true);
        let repo = fs::canonicalize(repo).unwrap();
        let app_data = repo.join("private/app-data");
        let store = RecentRepositoryStore::new(app_data.clone()).unwrap();
        let before = hash_repo_and_git_metadata(&repo);
        let service = RepositoryService::default();

        let opened = service.open(&repo).expect("repository open succeeds");
        let opened = record_recent_best_effort(&service, Some(&store), opened, Some(42));

        assert!(
            opened
                .warnings
                .iter()
                .any(|warning| { warning.code == RepositoryWarningCode::RecentHistoryUnavailable })
        );
        let serialized_open = serde_json::to_value(&opened).unwrap();
        assert_eq!(
            serialized_open["warnings"][0]["code"],
            "RECENT_HISTORY_UNAVAILABLE"
        );
        assert!(serialized_open.get("canonicalPath").is_none());
        assert!(!app_data.exists());
        assert_eq!(hash_repo_and_git_metadata(&repo), before);
        assert_eq!(
            service
                .canonical_root_for_session(&opened.session_id)
                .unwrap(),
            repo
        );
    }

    #[test]
    fn opening_recent_revalidates_git_and_accepts_missing_config_without_writes() {
        let temp = tempdir().unwrap();
        let repo = temp.path().join("repo-no-config");
        create_git_repo(&repo, false);
        let repo = fs::canonicalize(repo).unwrap();
        let before = hash_repo_and_git_metadata(&repo);
        let store = RecentRepositoryStore::new(temp.path().join("app-data")).unwrap();
        let saved = store.record_opened(&repo, "No config", 10).unwrap();
        let service = RepositoryService::default();

        let opened = open_recent_inner(&service, &store, &saved.recent_id, Some(20))
            .expect("Git root is reopened through repository service");

        assert!(opened.needs_initialization);
        assert!(!repo.join(".casewright").exists());
        assert_eq!(hash_repo_and_git_metadata(&repo), before);
        assert_eq!(store.list().unwrap()[0].last_opened_at_ms, 20);
    }

    #[test]
    fn reopening_recent_returns_only_available_preferred_workspace_and_falls_back_after_removal() {
        let temp = tempdir().unwrap();
        let repo = temp.path().join("workspace-repo");
        create_git_repo(&repo, false);
        fs::create_dir_all(repo.join(".casewright")).unwrap();
        fs::create_dir_all(repo.join("areas/Payments QA")).unwrap();
        fs::write(
            repo.join(".casewright/config.yaml"),
            "version: 1\nname: Workspace fixture\nworkspaces:\n  - .\n  - areas/Payments QA\n",
        )
        .unwrap();
        let repo = fs::canonicalize(repo).unwrap();
        let store = RecentRepositoryStore::new(temp.path().join("app-data")).unwrap();
        let recent = store.record_opened(&repo, "Workspace fixture", 10).unwrap();
        let service = RepositoryService::default();
        let first = service.open(&repo).unwrap();
        service
            .declared_workspace_for_session(&first.session_id, "areas/Payments QA")
            .unwrap();
        store
            .remember_workspace(&repo, "areas/Payments QA")
            .unwrap();
        service.close(&first.session_id).unwrap();

        let reopened = open_recent_inner(&service, &store, &recent.recent_id, Some(20)).unwrap();
        assert_eq!(
            reopened.preferred_workspace_path.as_deref(),
            Some("areas/Payments QA")
        );
        assert!(
            !serde_json::to_string(&reopened)
                .unwrap()
                .contains(repo.to_string_lossy().as_ref())
        );
        service.close(&reopened.session_id).unwrap();
        fs::write(
            repo.join(".casewright/config.yaml"),
            "version: 1\nname: Workspace fixture\nworkspaces:\n  - .\n",
        )
        .unwrap();

        let fallback = open_recent_inner(&service, &store, &recent.recent_id, Some(30)).unwrap();
        assert_eq!(fallback.preferred_workspace_path.as_deref(), Some(""));
        assert_eq!(
            store.last_workspace(&repo).unwrap().as_deref(),
            Some("areas/Payments QA")
        );
    }

    #[test]
    fn remember_workspace_revalidates_membership_and_store_failure_does_not_close_session() {
        let temp = tempdir().unwrap();
        let repo = temp.path().join("prefs-repo");
        create_git_repo(&repo, true);
        fs::create_dir_all(repo.join("areas/QA")).unwrap();
        fs::write(
            repo.join(".casewright/config.yaml"),
            "version: 1\nname: Preferences\nworkspaces:\n  - .\n  - areas/QA\n",
        )
        .unwrap();
        let repo = fs::canonicalize(repo).unwrap();
        let service = RepositoryService::default();
        let opened = service.open(&repo).unwrap();
        let outside_storage = RecentRepositoryStore::new(temp.path().join("app-data")).unwrap();
        outside_storage
            .record_opened(&repo, "Preferences", 1)
            .unwrap();
        assert_eq!(
            remember_workspace_inner(&service, &outside_storage, &opened.session_id, "../escape")
                .unwrap_err()
                .code,
            IpcErrorCode::InvalidRepository
        );
        assert_eq!(
            remember_workspace_inner(&service, &outside_storage, VALID_UUID, "")
                .unwrap_err()
                .code,
            IpcErrorCode::InvalidSession
        );
        remember_workspace_inner(&service, &outside_storage, &opened.session_id, "areas/QA")
            .unwrap();
        assert_eq!(
            outside_storage.last_workspace(&repo).unwrap().as_deref(),
            Some("areas/QA")
        );

        let inside_storage = RecentRepositoryStore::new(repo.join("private/app-data")).unwrap();
        assert_eq!(
            remember_workspace_inner(&service, &inside_storage, &opened.session_id, "")
                .unwrap_err()
                .code,
            IpcErrorCode::RecentHistoryUnavailable
        );
        assert_eq!(
            service
                .canonical_root_for_session(&opened.session_id)
                .unwrap(),
            repo
        );
        assert!(!repo.join("private/app-data").exists());

        let untouched_app_data = temp.path().join("untouched-app-data");
        let no_history = RecentRepositoryStore::new(untouched_app_data.clone()).unwrap();
        assert_eq!(
            remember_workspace_inner(&service, &no_history, VALID_UUID, "")
                .unwrap_err()
                .code,
            IpcErrorCode::InvalidSession
        );
        assert_eq!(
            remember_workspace_inner(&service, &no_history, &opened.session_id, "not-declared")
                .unwrap_err()
                .code,
            IpcErrorCode::InvalidRepository
        );
        assert!(!untouched_app_data.exists());
    }

    #[test]
    fn preferred_workspace_fallback_skips_deleted_directory_in_cached_session() {
        let temp = tempdir().unwrap();
        let repo = temp.path().join("cached-workspace-repo");
        create_git_repo(&repo, false);
        fs::create_dir_all(repo.join(".casewright")).unwrap();
        fs::create_dir_all(repo.join("areas/First")).unwrap();
        fs::create_dir_all(repo.join("areas/Second")).unwrap();
        fs::write(
            repo.join(".casewright/config.yaml"),
            "version: 1\nname: Cached workspace\nworkspaces:\n  - areas/First\n  - areas/Second\n",
        )
        .unwrap();
        let repo = fs::canonicalize(repo).unwrap();
        let service = RepositoryService::default();
        let opened = service.open(&repo).unwrap();
        let store = RecentRepositoryStore::new(temp.path().join("app-data")).unwrap();
        store.record_opened(&repo, "Cached workspace", 1).unwrap();
        store.remember_workspace(&repo, "areas/First").unwrap();
        fs::remove_dir_all(repo.join("areas/First")).unwrap();

        let refreshed = record_recent_best_effort(&service, Some(&store), opened, Some(2));

        assert_eq!(
            refreshed.preferred_workspace_path.as_deref(),
            Some("areas/Second")
        );
        assert_eq!(
            store.last_workspace(&repo).unwrap().as_deref(),
            Some("areas/First")
        );
        assert!(refreshed.warnings.iter().any(|warning| warning.code == RepositoryWarningCode::PreferredWorkspaceUnavailable));
    }

    #[test]
    fn missing_or_non_git_recent_keeps_other_open_session() {
        let temp = tempdir().unwrap();
        let active_repo = temp.path().join("active");
        create_git_repo(&active_repo, true);
        let active_repo = fs::canonicalize(active_repo).unwrap();
        let missing_repo = temp.path().join("missing");
        fs::create_dir(&missing_repo).unwrap();
        let invalid_git = temp.path().join("not-git");
        fs::create_dir(&invalid_git).unwrap();
        let store = RecentRepositoryStore::new(temp.path().join("app-data")).unwrap();
        let missing = store
            .record_opened(&fs::canonicalize(&missing_repo).unwrap(), "missing", 1)
            .unwrap();
        let invalid = store
            .record_opened(&fs::canonicalize(&invalid_git).unwrap(), "not git", 2)
            .unwrap();
        fs::remove_dir(&missing_repo).unwrap();
        let service = RepositoryService::default();
        let active = service.open(&active_repo).unwrap();

        assert_eq!(
            open_recent_inner(&service, &store, &missing.recent_id, Some(3))
                .unwrap_err()
                .code,
            IpcErrorCode::RecentRepositoryMissing
        );
        assert_eq!(
            open_recent_inner(&service, &store, &invalid.recent_id, Some(3))
                .unwrap_err()
                .code,
            IpcErrorCode::NotGitRepository
        );
        assert_eq!(
            service
                .canonical_root_for_session(&active.session_id)
                .unwrap(),
            active_repo
        );
        assert_eq!(store.list().unwrap().len(), 2);
    }

    #[test]
    fn history_errors_map_to_safe_typed_ipc_without_paths() {
        let temp = tempdir().unwrap();
        let app_data = temp.path().join("app-data");
        fs::create_dir(&app_data).unwrap();
        fs::write(app_data.join("recent-repositories.json"), "not json").unwrap();
        let store = RecentRepositoryStore::new(app_data).unwrap();
        let error = store.list().unwrap_err();
        let mapped = map_recent_error(&error);
        assert_eq!(mapped.code, IpcErrorCode::RecentHistoryUnavailable);
        let serialized = serde_json::to_string(&mapped).unwrap();
        assert!(!serialized.contains(temp.path().to_string_lossy().as_ref()));
        assert!(!serialized.contains("not json"));
    }

    fn create_git_repo(root: &Path, with_config: bool) {
        fs::create_dir_all(root).unwrap();
        let output = Command::new("git")
            .args(["init", "--quiet", "--initial-branch=main"])
            .current_dir(root)
            .output()
            .expect("system Git available");
        assert!(output.status.success(), "git init failed");
        if with_config {
            fs::create_dir_all(root.join(".casewright")).unwrap();
            fs::write(
                root.join(".casewright/config.yaml"),
                "version: 1\nname: Recents fixture\nworkspaces:\n  - .\n",
            )
            .unwrap();
        }
        fs::write(root.join("tracked.txt"), "unchanged").unwrap();
        let output = Command::new("git")
            .args(["add", "--", "tracked.txt"])
            .current_dir(root)
            .output()
            .expect("Git stage fixture");
        assert!(output.status.success(), "git add failed");
    }

    fn hash_repo_and_git_metadata(root: &Path) -> Vec<(PathBuf, [u8; 32])> {
        let mut paths = vec![root.join("tracked.txt")];
        for relative in [".git/config", ".git/index"] {
            let path = root.join(relative);
            if path.exists() {
                paths.push(path);
            }
        }
        if root.join(".casewright/config.yaml").exists() {
            paths.push(root.join(".casewright/config.yaml"));
        }
        paths
            .into_iter()
            .map(|path| {
                let relative = path.strip_prefix(root).unwrap().to_path_buf();
                let digest = Sha256::digest(fs::read(path).unwrap()).into();
                (relative, digest)
            })
            .collect()
    }
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn create_case(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: CreateCaseRequest,
) -> Result<crate::services::repository::CaseCreationDto, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_protocol(request.protocol_version)?;
    validate_uuid(&request.session_id)?;
    if let Some(parent) = &request.creation.parent_resource_id {
        validate_uuid(parent)?;
    }
    if let Some(source) = &request.creation.source {
        validate_uuid(&source.resource_id)?;
    }
    request
        .creation
        .validate()
        .map_err(|error| map_repository_error(&error))?;
    let service = Arc::clone(&state.service);
    let ticket = state.mutations.admit(&request.session_id, false)?;
    run_mutation(ticket, move || {
        service
            .create_case(&request.session_id, &request.creation)
            .map_err(|error| map_repository_error(&error))
    })
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct OrganizeCaseRequest {
    protocol_version: u16,
    session_id: String,
    operation: crate::services::repository::CaseOperation,
}
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn organize_case(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: OrganizeCaseRequest,
) -> Result<crate::services::repository::CaseOperationDto, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_protocol(request.protocol_version)?;
    validate_uuid(&request.session_id)?;
    validate_uuid(&request.operation.resource_id)?;
    if let crate::services::repository::CaseAction::Move {
        parent_resource_id: Some(parent),
    } = &request.operation.action
    {
        validate_uuid(parent)?;
    }
    request
        .operation
        .validate()
        .map_err(|error| map_repository_error(&error))?;
    let service = Arc::clone(&state.service);
    let ticket = state.mutations.admit(&request.session_id, false)?;
    run_mutation(ticket, move || {
        service
            .organize_case(&request.session_id, &request.operation)
            .map_err(|error| map_repository_error(&error))
    })
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CreateRunRequest {
    protocol_version: u16,
    session_id: String,
    creation: crate::services::repository::RunCreation,
}
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn create_run(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: CreateRunRequest,
) -> Result<crate::services::repository::RunCreationDto, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_protocol(request.protocol_version)?;
    validate_uuid(&request.session_id)?;
    request
        .creation
        .validate()
        .map_err(|error| map_repository_error(&error))?;
    for item in &request.creation.cases {
        validate_uuid(&item.resource_id)?;
    }
    let service = Arc::clone(&state.service);
    let ticket = state.mutations.admit(&request.session_id, false)?;
    run_mutation(ticket, move || {
        service
            .create_run(&request.session_id, &request.creation)
            .map_err(|error| map_repository_error(&error))
    })
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct GitDiffRequest {
    protocol_version: u16,
    session_id: String,
    file_id: String,
}
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn git_status(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: SessionRequest,
) -> Result<crate::services::repository::GitStatusDto, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_session(&request)?;
    let service = Arc::clone(&state.service);
    run_blocking(move || {
        service
            .git_status(&request.session_id)
            .map_err(|error| map_repository_error(&error))
    })
    .await
}
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn git_diff(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: GitDiffRequest,
) -> Result<crate::services::repository::GitDiffDto, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_protocol(request.protocol_version)?;
    validate_uuid(&request.session_id)?;
    validate_uuid(&request.file_id)?;
    let service = Arc::clone(&state.service);
    run_blocking(move || {
        service
            .git_diff(&request.session_id, &request.file_id)
            .map_err(|error| map_repository_error(&error))
    })
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct GitCommitRequest {
    protocol_version: u16,
    session_id: String,
    file_ids: Vec<String>,
    message: String,
}
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn git_commit(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: GitCommitRequest,
) -> Result<crate::services::repository::GitCommitDto, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_protocol(request.protocol_version)?;
    validate_uuid(&request.session_id)?;
    if request.file_ids.is_empty()
        || request.file_ids.len() > 200
        || request.message.trim().is_empty()
        || request.message.len() > 4096
        || request.message.contains('\0')
    {
        return Err(IpcError::invalid_request());
    }
    for id in &request.file_ids {
        validate_uuid(id)?;
    }
    let service = Arc::clone(&state.service);
    let ticket = state.mutations.admit(&request.session_id, true)?;
    run_mutation(ticket, move || {
        service
            .git_commit(&request.session_id, &request.file_ids, &request.message)
            .map_err(|error| map_repository_error(&error))
    })
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct GitSyncRequest {
    protocol_version: u16,
    session_id: String,
    confirmation: String,
    action: crate::services::repository::GitSyncAction,
}
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn git_sync(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: GitSyncRequest,
) -> Result<crate::services::repository::GitSyncDto, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_protocol(request.protocol_version)?;
    validate_uuid(&request.session_id)?;
    validate_uuid(&request.confirmation)?;
    let service = Arc::clone(&state.service);
    let ticket = state.mutations.admit(&request.session_id, true)?;
    run_mutation(ticket, move || {
        service
            .git_sync(&request.session_id, &request.confirmation, request.action)
            .map_err(|error| map_repository_error(&error))
    })
    .await
}

#[cfg(test)]
mod persistence_tests {
    use super::*;
    use std::{fs, process::Command, sync::atomic::AtomicUsize};
    #[test]
    fn fifo_dispatch_writes_real_git_worktree_before_git_and_flush() {
        let directory = tempfile::tempdir().unwrap();
        assert!(
            Command::new("git")
                .args(["init", "--quiet"])
                .current_dir(directory.path())
                .status()
                .unwrap()
                .success()
        );
        let queues = crate::mutation_queue::MutationQueues::default();
        let write = queues.admit("session", false).unwrap();
        let git = queues.admit("session", true).unwrap();
        let barrier = queues.admit("session", true).unwrap();
        let first_path = directory.path().join("case.md");
        let root = directory.path().to_path_buf();
        tauri::async_runtime::block_on(async {
            // Poll the later operation first: it must not dispatch a blocking worker yet.
            let commit = tauri::async_runtime::spawn(run_mutation(git, move || {
                let output = Command::new("git")
                    .args(["add", "--", "case.md"])
                    .current_dir(&root)
                    .output()
                    .unwrap();
                assert!(output.status.success());
                let output = Command::new("git")
                    .args(["show", ":case.md"])
                    .current_dir(&root)
                    .output()
                    .unwrap();
                assert_eq!(output.stdout, b"saved version");
                Ok(())
            }));
            run_mutation(write, move || {
                fs::write(first_path, "saved version").unwrap();
                Ok(())
            })
            .await
            .unwrap();
            commit.await.unwrap().unwrap();
            run_mutation(barrier, || Ok(())).await.unwrap();
        });
    }
    #[test]
    fn failed_write_prevents_git_dispatch_and_closed_session_flush_fails() {
        let queues = crate::mutation_queue::MutationQueues::default();
        let write = queues.admit("session", false).unwrap();
        let git = queues.admit("session", true).unwrap();
        let calls = Arc::new(AtomicUsize::new(0));
        let counter = Arc::clone(&calls);
        tauri::async_runtime::block_on(async {
            assert!(
                run_mutation(write, || Err::<(), _>(IpcError::internal()))
                    .await
                    .is_err()
            );
            let error = run_mutation(git, move || {
                counter.fetch_add(1, Ordering::Relaxed);
                Ok(())
            })
            .await
            .unwrap_err();
            assert_eq!(error.code, IpcErrorCode::WriteFlushFailed);
            let ticket = queues.admit("closed", true).unwrap();
            let error = run_mutation(ticket, || {
                RepositoryService::default()
                    .canonical_root_for_session("closed")
                    .map(|_| ())
                    .map_err(|error| map_repository_error(&error))
            })
            .await
            .unwrap_err();
            assert_eq!(error.code, IpcErrorCode::InvalidSession);
            run_mutation(queues.admit("session", true).unwrap(), || Ok(()))
                .await
                .unwrap();
        });
        assert_eq!(calls.load(Ordering::Relaxed), 0);
    }
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn refresh_repository(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: SessionRequest,
) -> Result<OpenRepositoryDto, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_session(&request)?;
    let service = Arc::clone(&state.service);
    run_blocking(move || {
        service
            .refresh_metadata(&request.session_id)
            .map_err(|error| map_repository_error(&error))
    })
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CreateSuiteRequest {
    protocol_version: u16,
    session_id: String,
    creation: crate::services::repository::SuiteCreation,
}
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn create_suite(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: CreateSuiteRequest,
) -> Result<crate::services::repository::SuiteCreationDto, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_protocol(request.protocol_version)?;
    validate_uuid(&request.session_id)?;
    if let Some(parent) = &request.creation.parent_resource_id {
        validate_uuid(parent)?;
    }
    request
        .creation
        .validate()
        .map_err(|error| map_repository_error(&error))?;
    let service = Arc::clone(&state.service);
    let ticket = state.mutations.admit(&request.session_id, false)?;
    run_mutation(ticket, move || {
        service
            .create_suite(&request.session_id, &request.creation)
            .map_err(|error| map_repository_error(&error))
    })
    .await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct PrepareSuiteRequest {
    protocol_version: u16,
    session_id: String,
    operation: crate::services::repository::SuiteOperation,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct ApplySuiteRequest {
    protocol_version: u16,
    session_id: String,
    confirmation: String,
}
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn prepare_suite_operation(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: PrepareSuiteRequest,
) -> Result<crate::services::repository::SuitePreview, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_protocol(request.protocol_version)?;
    validate_uuid(&request.session_id)?;
    validate_uuid(&request.operation.resource_id)?;
    match &request.operation.action {
        crate::services::repository::SuiteAction::Move {
            parent_resource_id: Some(parent),
        }
        | crate::services::repository::SuiteAction::Duplicate {
            parent_resource_id: Some(parent),
            ..
        } => validate_uuid(parent)?,
        _ => {}
    }
    let service = Arc::clone(&state.service);
    run_blocking(move || {
        service
            .prepare_suite_operation(&request.session_id, &request.operation)
            .map_err(|error| map_repository_error(&error))
    })
    .await
}
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub(super) async fn apply_suite_operation(
    window: WebviewWindow,
    state: State<'_, RepositoryCommandState>,
    request: ApplySuiteRequest,
) -> Result<crate::services::repository::SuiteApplyResult, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_protocol(request.protocol_version)?;
    validate_uuid(&request.session_id)?;
    validate_uuid(&request.confirmation)?;
    let service = Arc::clone(&state.service);
    let ticket = state.mutations.admit(&request.session_id, false)?;
    run_mutation(ticket, move || {
        service
            .apply_suite_operation(&request.session_id, &request.confirmation)
            .map_err(|error| map_repository_error(&error))
    })
    .await
}
