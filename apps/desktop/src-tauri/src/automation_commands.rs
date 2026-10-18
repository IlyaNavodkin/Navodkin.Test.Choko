//! Узкие команды автоматизации: caller, protocol и session проверяются до файловой/процессной операции.
use crate::{
    ipc::validate_caller,
    repository_commands::RepositoryCommandState,
    services::automation::{
        AutomationService, AutomationView, Code, Error, ExecutionSummary, Poll, Result, Start,
        contracts::{Binding, Operation, Profile, uuid},
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
pub(crate) struct BindingsRequest {
    pub protocol_version: u16,
    pub session_id: String,
    pub expected_revision: String,
    pub bindings: Vec<Binding>,
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
fn validate(version: u16, session: &str) -> Result<()> {
    if version == 1 && uuid(session) {
        Ok(())
    } else {
        Err(Error::new(Code::InvalidRequest))
    }
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
    validate_caller(&window, tauri::is_dev()).map_err(Error::from)?;
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let ticket = repositories
        .mutations
        .admit(&request.session_id, false)
        .map_err(Error::from)?;
    let lease = ticket.await.map_err(Error::from)?;
    tauri::async_runtime::spawn_blocking(move || {
        let result = service.save_profile(
            &request.session_id,
            &request.expected_revision,
            &request.profile,
            &request.node_path,
        );
        lease.complete(result.is_ok());
        result
    })
    .await
    .map_err(|_| Error::new(Code::Internal))?
}

#[tauri::command]
pub(crate) async fn save_automation_bindings(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: BindingsRequest,
) -> Result<AutomationView> {
    validate_caller(&window, tauri::is_dev()).map_err(Error::from)?;
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let ticket = repositories
        .mutations
        .admit(&request.session_id, false)
        .map_err(Error::from)?;
    let lease = ticket.await.map_err(Error::from)?;
    tauri::async_runtime::spawn_blocking(move || {
        let result = service.save_bindings(
            &request.session_id,
            &request.expected_revision,
            request.bindings,
        );
        lease.complete(result.is_ok());
        result
    })
    .await
    .map_err(|_| Error::new(Code::Internal))?
}

#[tauri::command]
pub(crate) async fn set_automation_trust(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: TrustRequest,
) -> Result<AutomationView> {
    validate_caller(&window, tauri::is_dev()).map_err(Error::from)?;
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let ticket = repositories
        .mutations
        .admit(&request.session_id, false)
        .map_err(Error::from)?;
    let lease = ticket.await.map_err(Error::from)?;
    tauri::async_runtime::spawn_blocking(move || {
        let result = service.trust(
            &request.session_id,
            &request.profile_id,
            &request.expected_revision,
            request.grant,
        );
        lease.complete(result.is_ok());
        result
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
    validate_caller(&window, tauri::is_dev()).map_err(Error::from)?;
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let ticket = repositories
        .mutations
        .admit(&request.session_id, false)
        .map_err(Error::from)?;
    let lease = ticket.await.map_err(Error::from)?;
    tauri::async_runtime::spawn_blocking(move || {
        let result = service.start(&request.session_id, request.start);
        lease.complete(result.is_ok());
        result
    })
    .await
    .map_err(|_| Error::new(Code::Internal))?
}

#[tauri::command]
pub(crate) async fn discover_automation(
    window: WebviewWindow,
    state: State<'_, AutomationCommandState>,
    repositories: State<'_, RepositoryCommandState>,
    request: StartRequest,
) -> Result<ExecutionSummary> {
    validate_caller(&window, tauri::is_dev()).map_err(Error::from)?;
    validate(request.protocol_version, &request.session_id)?;
    let service = Arc::clone(&state.0);
    let ticket = repositories
        .mutations
        .admit(&request.session_id, false)
        .map_err(Error::from)?;
    let lease = ticket.await.map_err(Error::from)?;
    tauri::async_runtime::spawn_blocking(move || {
        let result = {
            if request.start.operation != Operation::Discover {
                return Err(Error::new(Code::InvalidRequest));
            }
            service.start(&request.session_id, request.start)
        };
        lease.complete(result.is_ok());
        result
    })
    .await
    .map_err(|_| Error::new(Code::Internal))?
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
