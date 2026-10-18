use serde::Serialize;
use tauri::{Url, WebviewWindow};

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct IpcError {
    pub(crate) code: IpcErrorCode,
    pub(crate) message: &'static str,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub(crate) enum IpcErrorCode {
    InitializationUnavailable,
    InitializationFailed,
    InvalidCaseEdit,
    InvalidSuiteCreation,
    InvalidSuiteOperation,
    SuiteRecoveryRequired,
    InvalidRunCreation,
    InvalidRunEdit,
    ReadOnlyCase,
    ExternalChange,
    SaveFailed,
    WriteQueueFull,
    WriteFlushFailed,
    InvalidRequest,
    UnauthorizedWebview,
    InvalidSession,
    InvalidResource,
    StaleResource,
    NotGitRepository,
    BareRepository,
    SelectedSubdirectory,
    InvalidRepository,
    UnsupportedVersion,
    InvalidConfig,
    UnsupportedLegacyFormat,
    GitFailed,
    GitCommitBlocked,
    GitSyncBlocked,
    GitDirty,
    GitNoUpstream,
    GitAuthFailed,
    GitRemoteFailed,
    GitNetworkFailed,
    GitPushRejected,
    GitAbortFailed,
    GitRecoveryRequired,
    GitIdentityMissing,
    GitOutputTooLarge,
    GitUnavailable,
    GitTimedOut,
    InvalidDocument,
    FileTooLarge,
    InvalidUtf8,
    PickerBusy,
    PickerFailed,
    RecentHistoryUnavailable,
    RecentNotFound,
    RecentRepositoryMissing,
    RepositoryIo,
    Internal,
}

impl IpcError {
    pub(crate) const fn new(code: IpcErrorCode, message: &'static str) -> Self {
        Self { code, message }
    }

    pub(crate) const fn invalid_request() -> Self {
        Self::new(
            IpcErrorCode::InvalidRequest,
            "Параметры запроса недопустимы.",
        )
    }

    pub(crate) const fn unauthorized_webview() -> Self {
        Self::new(
            IpcErrorCode::UnauthorizedWebview,
            "Источник IPC-запроса не разрешён.",
        )
    }

    pub(crate) const fn internal() -> Self {
        Self::new(IpcErrorCode::Internal, "Внутренняя ошибка native операции.")
    }
}

pub(crate) fn validate_caller(window: &WebviewWindow, is_dev: bool) -> Result<(), IpcError> {
    if window.label() != "main" {
        return Err(IpcError::unauthorized_webview());
    }
    let url = window.url().map_err(|_| IpcError::unauthorized_webview())?;
    if !is_allowed_origin(&url, is_dev) {
        return Err(IpcError::unauthorized_webview());
    }
    Ok(())
}

pub(crate) fn is_allowed_navigation(url: &Url, is_dev: bool) -> bool {
    is_allowed_origin(url, is_dev)
}

fn is_allowed_origin(url: &Url, is_dev: bool) -> bool {
    let host = url.host_str();
    let port = url.port();
    if is_dev {
        return url.scheme() == "http" && host == Some("127.0.0.1") && port == Some(1420);
    }

    (url.scheme() == "tauri" && host == Some("localhost") && port.is_none())
        || (url.scheme() == "http" && host == Some("tauri.localhost") && port.is_none())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn navigation_allows_only_the_local_app_and_vite_dev_server() {
        let dev = Url::parse("http://127.0.0.1:1420/").unwrap();
        let remote = Url::parse("https://example.com/").unwrap();
        let wrong_dev_port = Url::parse("http://127.0.0.1:3000/").unwrap();
        let production = Url::parse("http://tauri.localhost/").unwrap();
        let production_wrong_port = Url::parse("http://tauri.localhost:9999/").unwrap();
        let production_tauri_wrong_port = Url::parse("tauri://localhost:9999/").unwrap();

        assert!(is_allowed_navigation(&dev, true));
        assert!(!is_allowed_navigation(&remote, true));
        assert!(!is_allowed_navigation(&wrong_dev_port, true));
        assert!(is_allowed_navigation(&production, false));
        assert!(!is_allowed_navigation(&production_wrong_port, false));
        assert!(!is_allowed_navigation(&production_tauri_wrong_port, false));
        assert!(!is_allowed_navigation(&remote, false));
    }
}
