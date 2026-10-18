mod automation_commands;
pub mod domain;
mod ipc;
mod mutation_queue;
mod repository_commands;
mod runtime_diagnostics;
pub mod services;

use std::sync::Arc;

use tauri::{Manager, WebviewUrl, webview::WebviewWindowBuilder};

/// Starts the native Testoritto window.
///
/// # Panics
///
/// Panics if Tauri cannot initialize the desktop runtime.
#[allow(clippy::too_many_lines)] // Регистрация приложения и exit guard составляют один lifecycle.
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            automation_commands::read_automation,
            automation_commands::save_automation_profile,
            automation_commands::save_automation_bindings,
            automation_commands::set_automation_trust,
            automation_commands::start_automation,
            automation_commands::discover_automation,
            automation_commands::poll_automation,
            automation_commands::cancel_automation,
            runtime_diagnostics::get_runtime_diagnostics,
            repository_commands::pick_repository,
            repository_commands::initialize_repository,
            repository_commands::close_repository,
            repository_commands::flush_repository,
            repository_commands::refresh_repository,
            repository_commands::catalog_workspace,
            repository_commands::read_case,
            repository_commands::git_status,
            repository_commands::git_diff,
            repository_commands::git_commit,
            repository_commands::git_sync,
            repository_commands::save_case,
            repository_commands::save_run_case,
            repository_commands::save_run_details,
            repository_commands::create_case,
            repository_commands::create_suite,
            repository_commands::prepare_suite_operation,
            repository_commands::apply_suite_operation,
            repository_commands::create_run,
            repository_commands::organize_case,
            repository_commands::catalog_runs,
            repository_commands::read_run,
            repository_commands::list_recent_repositories,
            repository_commands::open_recent_repository,
            repository_commands::remember_workspace
        ])
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let recent_store = app
                .path()
                .app_data_dir()
                .ok()
                .and_then(|path| crate::services::recents::RecentRepositoryStore::new(path).ok())
                .map(Arc::new);
            let repositories = repository_commands::RepositoryCommandState::with_recents(
                recent_store,
                app.handle().clone(),
            );
            let bridge = if cfg!(debug_assertions) {
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("../../../tools/playwright-automation/dist/bridge.mjs")
            } else {
                app.path().resolve(
                    "automation/bridge.mjs",
                    tauri::path::BaseDirectory::Resource,
                )?
            };
            app.manage(automation_commands::AutomationCommandState(Arc::new(
                services::automation::AutomationService::new(
                    Arc::clone(&repositories.service),
                    Arc::clone(&repositories.mutations),
                    app.path().app_data_dir()?,
                    bridge,
                ),
            )));
            app.manage(repositories);
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Testoritto")
                .inner_size(1060.0, 720.0)
                .min_inner_size(760.0, 520.0)
                .on_navigation(|url| ipc::is_allowed_navigation(url, tauri::is_dev()))
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to start Testoritto")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if let Some(window) = app.get_webview_window("main") {
                    // Сначала существующая защита draft/flush, затем native cleanup перед exit.
                    api.prevent_exit();
                    let _ = window.close();
                } else if let Err(error) = app
                    .state::<automation_commands::AutomationCommandState>()
                    .0
                    .shutdown()
                {
                    use tauri_plugin_dialog::DialogExt;
                    api.prevent_exit();
                    // Восстановить окно после destroy: отказ записи/cleanup нельзя выдавать за успешный exit.
                    let _ = WebviewWindowBuilder::new(
                        app,
                        "main",
                        WebviewUrl::App("index.html".into()),
                    )
                    .title("Testoritto")
                    .inner_size(1060.0, 720.0)
                    .min_inner_size(760.0, 520.0)
                    .on_navigation(|url| ipc::is_allowed_navigation(url, tauri::is_dev()))
                    .build();
                    app.dialog()
                        .message(error.message)
                        .title("Не удалось завершить автоматизацию")
                        .show(|_| {});
                }
            }
        });
}
