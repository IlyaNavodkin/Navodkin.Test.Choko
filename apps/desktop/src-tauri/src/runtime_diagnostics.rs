use serde::{Deserialize, Serialize};
use tauri::WebviewWindow;

use crate::ipc::{IpcError, validate_caller};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RuntimeDiagnosticsRequest {
    protocol_version: u16,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(super) struct RuntimeDiagnostics {
    app_version: &'static str,
    platform: &'static str,
    architecture: &'static str,
    native_runtime: bool,
}

fn diagnostics() -> RuntimeDiagnostics {
    RuntimeDiagnostics {
        app_version: env!("CARGO_PKG_VERSION"),
        platform: match std::env::consts::OS {
            "windows" => "windows",
            "macos" => "macos",
            "linux" => "linux",
            _ => "other",
        },
        architecture: match std::env::consts::ARCH {
            "x86_64" => "x86_64",
            "aarch64" => "aarch64",
            "x86" => "x86",
            _ => "other",
        },
        native_runtime: true,
    }
}

fn validate_request(request: &RuntimeDiagnosticsRequest) -> Result<(), IpcError> {
    if request.protocol_version == 1 {
        Ok(())
    } else {
        Err(IpcError::invalid_request())
    }
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)] // Tauri commands receive managed window arguments by value.
pub(super) fn get_runtime_diagnostics(
    window: WebviewWindow,
    request: RuntimeDiagnosticsRequest,
) -> Result<RuntimeDiagnostics, IpcError> {
    validate_caller(&window, tauri::is_dev())?;
    validate_request(&request)?;
    Ok(diagnostics())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rejects_unknown_request_fields() {
        let parsed = serde_json::from_value::<RuntimeDiagnosticsRequest>(json!({
            "protocolVersion": 1,
            "repoPath": "C:/private"
        }));
        assert!(parsed.is_err());
    }

    #[test]
    fn rejects_unsupported_request_version() {
        let error = validate_request(&RuntimeDiagnosticsRequest {
            protocol_version: 2,
        })
        .expect_err("version 2 is not supported");
        assert_eq!(error.code, crate::ipc::IpcErrorCode::InvalidRequest);
    }

    #[test]
    fn serializes_camel_case_diagnostics_and_safe_error_code() {
        let response = diagnostics();
        let value = serde_json::to_value(response).expect("diagnostics serialize");
        assert_eq!(value["appVersion"], env!("CARGO_PKG_VERSION"));
        assert_eq!(value["nativeRuntime"], true);
        let error =
            serde_json::to_value(IpcError::unauthorized_webview()).expect("error serializes");
        assert_eq!(error["code"], "UNAUTHORIZED_WEBVIEW");
    }
}
