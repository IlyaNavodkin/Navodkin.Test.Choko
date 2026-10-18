//! Узкие команды автоматизации: caller, protocol и session проверяются до файловой/процессной операции.
use crate::{
    ipc::validate_caller,
    repository_commands::RepositoryCommandState,
    services::automation::{
        AutomationService, AutomationView, Code, Error, ExecutionSummary, ImportPreview,
        InvocationRequest, Poll, Preview, Result, SavedReport, Start,
        contracts::{Operation, Profile, uuid},
        v2::{Autotest, CaseAutotestBinding, EnvironmentEntry},
    },
};
use serde::Deserialize;
use std::sync::Arc;
use tauri::{State, WebviewWindow};
pub(crate) struct AutomationCommandState(pub Arc<AutomationService>);
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SessionRequest {
    pub protocol_version: u16,
    pub session_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ProfileRequest {
    pub protocol_version: u16,
    pub session_id: String,
    pub expected_revision: String,
    pub profile: Profile,
    pub node_path: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct AutotestRequest {
    pub protocol_version: u16,
    pub session_id: String,
    pub expected_revision: String,
    pub revision: String,
    pub autotest: Autotest,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ArchiveAutotestRequest {
    pub protocol_version: u16,
    pub session_id: String,
    pub expected_revision: String,
    pub revision: String,
    pub autotest_id: String,
    pub archived: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DeleteAutotestRequest {
    pub protocol_version: u16,
    pub session_id: String,
    pub expected_revision: String,
    pub autotest_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BindingRequest {
    pub protocol_version: u16,
    pub session_id: String,
    pub expected_revision: String,
    pub revision: String,
    pub binding: CaseAutotestBinding,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RemoveBindingRequest {
    pub protocol_version: u16,
    pub session_id: String,
    pub expected_revision: String,
    pub binding_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct EnvironmentsRequest {
    pub protocol_version: u16,
    pub session_id: String,
    pub expected_revision: String,
    pub environments: Vec<EnvironmentEntry>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct TrustRequest {
    pub protocol_version: u16,
    pub session_id: String,
    pub profile_id: String,
    pub expected_revision: String,
    pub grant: bool,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct StartRequest {
    pub protocol_version: u16,
    pub session_id: String,
    pub start: Start,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PreviewRequest {
    pub protocol_version: u16,
    pub session_id: String,
    pub run_id: String,
    pub invocations: Vec<InvocationRequest>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PollRequest {
    pub protocol_version: u16,
    pub session_id: String,
    pub run_id: String,
    pub execution_id: String,
    pub cursor: usize,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct CancelRequest {
    pub protocol_version: u16,
    pub session_id: String,
    pub execution_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ImportRequest {
    pub protocol_version: u16,
    pub session_id: String,
    pub run_id: String,
    pub source: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ApplyImportRequest {
    pub protocol_version: u16,
    pub session_id: String,
    pub run_id: String,
    pub source: String,
    pub expected_revision: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ReportsRequest {
    pub protocol_version: u16,
    pub session_id: String,
    pub run_id: String,
    pub execution_id: String,
}
fn validate(version: u16, session: &str) -> Result<()> {
    if version == 1 && uuid(session) {
        Ok(())
    } else {
        Err(Error::new(Code::InvalidRequest))
    }
}
async fn mutation<T: Send + 'static>(
    window: &WebviewWindow,
    repositories: &RepositoryCommandState,
    session: &str,
    action: impl FnOnce() -> Result<T> + Send + 'static,
) -> Result<T> {
    validate_caller(window, tauri::is_dev()).map_err(Error::from)?;
    let ticket = repositories
        .mutations
        .admit(session, false)
        .map_err(Error::from)?;
    let lease = ticket.await.map_err(Error::from)?;
    tauri::async_runtime::spawn_blocking(move || {
        let result = action();
        lease.complete(result.is_ok());
        result
    })
    .await
    .map_err(|_| Error::new(Code::Internal))?
}

#[tauri::command]
pub(crate) async fn read_automation(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: SessionRequest,
) -> Result<AutomationView> {
    validate_caller(&window, tauri::is_dev()).map_err(Error::from)?;
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let _ = repositories;
    tauri::async_runtime::spawn_blocking(move || service.read(&request.session_id))
        .await
        .map_err(|_| Error::new(Code::Internal))?
}

#[tauri::command]
pub(crate) async fn save_automation_profile(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: ProfileRequest,
) -> Result<AutomationView> {
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let session = request.session_id.clone();
    mutation(&window, &repositories, &session, move || {
        service.save_profile(
            &request.session_id,
            &request.expected_revision,
            &request.profile,
            &request.node_path,
        )
    })
    .await
}

#[tauri::command]
pub(crate) async fn save_automation_autotest(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: AutotestRequest,
) -> Result<AutomationView> {
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let session = request.session_id.clone();
    mutation(&window, &repositories, &session, move || {
        service.save_autotest(
            &request.session_id,
            &request.expected_revision,
            &request.autotest,
            &request.revision,
        )
    })
    .await
}

#[tauri::command]
pub(crate) async fn archive_automation_autotest(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: ArchiveAutotestRequest,
) -> Result<AutomationView> {
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let session = request.session_id.clone();
    mutation(&window, &repositories, &session, move || {
        service.archive_autotest(
            &request.session_id,
            &request.expected_revision,
            &request.autotest_id,
            request.archived,
            &request.revision,
        )
    })
    .await
}

#[tauri::command]
pub(crate) async fn delete_automation_autotest(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: DeleteAutotestRequest,
) -> Result<AutomationView> {
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let session = request.session_id.clone();
    mutation(&window, &repositories, &session, move || {
        service.delete_autotest(
            &request.session_id,
            &request.expected_revision,
            &request.autotest_id,
        )
    })
    .await
}

#[tauri::command]
pub(crate) async fn save_automation_binding(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: BindingRequest,
) -> Result<AutomationView> {
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let session = request.session_id.clone();
    mutation(&window, &repositories, &session, move || {
        service.save_binding(
            &request.session_id,
            &request.expected_revision,
            &request.binding,
            &request.revision,
        )
    })
    .await
}

#[tauri::command]
pub(crate) async fn remove_automation_binding(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: RemoveBindingRequest,
) -> Result<AutomationView> {
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let session = request.session_id.clone();
    mutation(&window, &repositories, &session, move || {
        service.remove_binding(
            &request.session_id,
            &request.expected_revision,
            &request.binding_id,
        )
    })
    .await
}

#[tauri::command]
pub(crate) async fn save_automation_environments(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: EnvironmentsRequest,
) -> Result<AutomationView> {
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let session = request.session_id.clone();
    mutation(&window, &repositories, &session, move || {
        service.save_environments(
            &request.session_id,
            &request.expected_revision,
            request.environments,
        )
    })
    .await
}

#[tauri::command]
pub(crate) async fn set_automation_trust(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: TrustRequest,
) -> Result<AutomationView> {
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let session = request.session_id.clone();
    mutation(&window, &repositories, &session, move || {
        service.trust(
            &request.session_id,
            &request.profile_id,
            &request.expected_revision,
            request.grant,
        )
    })
    .await
}

#[tauri::command]
pub(crate) async fn preview_automation_invocations(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: PreviewRequest,
) -> Result<Preview> {
    validate_caller(&window, tauri::is_dev()).map_err(Error::from)?;
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let _ = repositories;
    tauri::async_runtime::spawn_blocking(move || {
        service.preview(&request.session_id, &request.run_id, &request.invocations)
    })
    .await
    .map_err(|_| Error::new(Code::Internal))?
}

#[tauri::command]
pub(crate) async fn start_automation(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: StartRequest,
) -> Result<ExecutionSummary> {
    validate(request.protocol_version, &request.session_id)?;
    if request.start.operation != Operation::Run {
        return Err(Error::new(Code::InvalidRequest));
    }
    let service = Arc::clone(&state.0);
    let session = request.session_id.clone();
    mutation(&window, &repositories, &session, move || {
        service.start(&request.session_id, request.start)
    })
    .await
}

#[tauri::command]
pub(crate) async fn discover_automation(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: StartRequest,
) -> Result<ExecutionSummary> {
    validate(request.protocol_version, &request.session_id)?;
    if request.start.operation != Operation::Discover {
        return Err(Error::new(Code::InvalidRequest));
    }
    let service = Arc::clone(&state.0);
    let session = request.session_id.clone();
    mutation(&window, &repositories, &session, move || {
        service.start(&request.session_id, request.start)
    })
    .await
}

#[tauri::command]
pub(crate) async fn poll_automation(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: PollRequest,
) -> Result<Poll> {
    validate_caller(&window, tauri::is_dev()).map_err(Error::from)?;
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let _ = repositories;
    tauri::async_runtime::spawn_blocking(move || {
        service.poll(
            &request.session_id,
            &request.run_id,
            &request.execution_id,
            request.cursor,
        )
    })
    .await
    .map_err(|_| Error::new(Code::Internal))?
}

#[tauri::command]
pub(crate) async fn cancel_automation(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: CancelRequest,
) -> Result<()> {
    validate_caller(&window, tauri::is_dev()).map_err(Error::from)?;
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let _ = repositories;
    tauri::async_runtime::spawn_blocking(move || {
        service.cancel(&request.session_id, &request.execution_id)
    })
    .await
    .map_err(|_| Error::new(Code::Internal))?
}

#[tauri::command]
pub(crate) async fn save_automation_reports(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: ReportsRequest,
) -> Result<Vec<SavedReport>> {
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let session = request.session_id.clone();
    mutation(&window, &repositories, &session, move || {
        service.save_reports(&request.session_id, &request.run_id, &request.execution_id)
    })
    .await
}

#[tauri::command]
pub(crate) async fn preview_automation_import(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: ImportRequest,
) -> Result<ImportPreview> {
    validate_caller(&window, tauri::is_dev()).map_err(Error::from)?;
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let _ = repositories;
    tauri::async_runtime::spawn_blocking(move || {
        service.preview_import(&request.session_id, &request.run_id, &request.source)
    })
    .await
    .map_err(|_| Error::new(Code::Internal))?
}

#[tauri::command]
pub(crate) async fn apply_automation_import(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: ApplyImportRequest,
) -> Result<ExecutionSummary> {
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let session = request.session_id.clone();
    mutation(&window, &repositories, &session, move || {
        service.apply_import(
            &request.session_id,
            &request.run_id,
            &request.source,
            &request.expected_revision,
        )
    })
    .await
}
