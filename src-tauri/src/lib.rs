mod agent;
mod app;
mod clipboard;
mod clock;
mod commands;
mod fsx;
mod git;
mod history;
mod idle;
mod pty;
mod remote;
mod screens;
mod shells;
mod store;
mod telemetry;
mod updater;
mod vscode;
mod wallpapers;

use app::{data_dir, emit_agent, migrate_legacy_wallpaper, now_ms, Core};
use commands::*;
use std::{
    collections::HashSet,
    sync::{Arc, Mutex, OnceLock},
    time::Duration,
};
use tauri::{Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

// With no input for this long, only workspaces with an agent at work keep counting
const AWAY_AFTER_SECONDS: u64 = 5 * 60;

// nws-wallpaper://local/<id>: the files in the wallpaper folder, readable by the canvas (CORS) so the palette can be derived.
fn wallpaper_response(dir: &std::path::Path, uri: &tauri::http::Uri) -> tauri::http::Response<Vec<u8>> {
    let id = uri.path().trim_start_matches('/');
    let store = wallpapers::WallpaperStore::new(dir.to_path_buf());
    let found = store.resolve(id).and_then(|file| std::fs::read(file).ok());
    let builder = tauri::http::Response::builder();
    match found {
        Some(bytes) => builder
            .header("Content-Type", wallpapers::content_type(id))
            .header("Access-Control-Allow-Origin", "*")
            .body(bytes),
        None => builder.status(404).body(Vec::new()),
    }
    .expect("static response parts are valid")
}

fn build_core(handle: &tauri::AppHandle) -> Core {
    let dir = data_dir();
    let store_path = dir.join("neo-workspaces.json");
    let pty = Arc::new(pty::PtyManager::new());
    let remote = remote::RemoteGateway::new(
        pty.clone(),
        remote::Hooks {
            get_state: {
                let path = store_path.clone();
                Arc::new(move || store::load(&path))
            },
            on_status: {
                let app = handle.clone();
                Arc::new(move |status| drop(app.emit_to("main", "remote:status-update", status)))
            },
            on_workspace_select: {
                let app = handle.clone();
                Arc::new(move |id| drop(app.emit_to("main", "remote:workspace-selected", id)))
            },
        },
    );
    Core {
        pty,
        remote,
        agents: Mutex::default(),
        clock: Mutex::new(clock::WorkspaceClock::new(dir.join("workspace-time.json"))),
        history: history::TerminalHistory::new(dir.join("terminal-history")),
        git: Arc::default(),
        wallpapers: wallpapers::WallpaperStore::new(dir.join("wallpapers")),
        vscode: vscode::VSCode::default(),
        updater: Arc::new(updater::Updater::new()),
        shells: OnceLock::new(),
        unsaved_history: Mutex::default(),
        telemetry: Mutex::new(None),
        store_path,
    }
}

// Timers that outlive any window: agent silence, banking the clock, saving history, idle pause.
fn start_background_tasks(handle: &tauri::AppHandle) {
    let app = handle.clone();
    tauri::async_runtime::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(1));
        loop {
            tick.tick().await;
            let changes = app.state::<Core>().agents.lock().unwrap().tick(now_ms());
            for change in changes {
                emit_agent(&app, change);
            }
        }
    });

    let app = handle.clone();
    tauri::async_runtime::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(60));
        loop {
            tick.tick().await;
            let core = app.state::<Core>();
            core.clock.lock().unwrap().flush(now_ms());
            core.save_history();
        }
    });

    let app = handle.clone();
    tauri::async_runtime::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(15));
        loop {
            tick.tick().await;
            let core = app.state::<Core>();
            let away = idle::seconds().is_some_and(|idle| idle >= AWAY_AFTER_SECONDS);
            let state = core.state();
            let busy: HashSet<String> = core
                .agents
                .lock()
                .unwrap()
                .working_panels()
                .iter()
                .filter_map(|p| app::find_panel_owner(&state, p).map(|o| o.workspace_id))
                .collect();
            core.clock.lock().unwrap().pause_where(|id| away && !busy.contains(id), now_ms());
        }
    });
}

fn confirm_close(app: &tauri::AppHandle, window: tauri::Window, working: Vec<String>) {
    let message = format!(
        "{}\n\nSi cierras se detendrán:\n{}",
        if working.len() == 1 { "Hay un agente trabajando".to_string() } else { format!("Hay {} agentes trabajando", working.len()) },
        working.join("\n")
    );
    app.dialog()
        .message(message)
        .title("NeoWork")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom("Cerrar de todas formas".into(), "Seguir trabajando".into()))
        .show(move |close| {
            if close {
                let _ = window.destroy();
            }
        });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let wallpapers_dir = data_dir().join("wallpapers");
    let mut builder = tauri::Builder::default();
    if !cfg!(debug_assertions) {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .register_uri_scheme_protocol("nws-wallpaper", move |_ctx, request| wallpaper_response(&wallpapers_dir, request.uri()))
        .setup(|app| {
            let handle = app.handle().clone();
            let core = build_core(&handle);

            migrate_legacy_wallpaper(&core);
            core.history.prune(&Core::panel_ids(&core.state()));
            app.manage(core);

            start_background_tasks(&handle);
            screens::watch(handle.clone());
            app.state::<Core>().updater.check_on_startup(handle.clone());

            let pty = app.state::<Core>().pty.clone();
            let emitter = handle.clone();
            let task = telemetry::start(pty, Duration::from_millis(1800), move |payload| drop(emitter.emit("telemetry:update", payload)));
            *app.state::<Core>().telemetry.lock().unwrap() = Some(task);
            Ok(())
        })
        .on_window_event(|window, event| {
            let app = window.app_handle();
            match event {
                // Closing kills every terminal, and an agent's run can't be picked up again
                WindowEvent::CloseRequested { api, .. } if window.label() == "main" => {
                    let working = working_agents(app);
                    if !working.is_empty() {
                        api.prevent_close();
                        confirm_close(app, window.clone(), working);
                    }
                }
                WindowEvent::Focused(true) if window.label() == "main" => {
                    let _ = window.request_user_attention(None);
                }
                WindowEvent::Destroyed if window.label() == "main" => {
                    if let Some(secondary) = app.get_webview_window(screens::SECONDARY) {
                        let _ = secondary.destroy();
                    }
                }
                WindowEvent::Destroyed if window.label() == screens::SECONDARY => screens::broadcast_status(app),
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_get_version,
            window_minimize,
            window_maximize,
            window_close,
            window_is_maximized,
            store_get,
            store_save,
            dialog_select_directory,
            clipboard_write,
            clipboard_read,
            clipboard_read_smart,
            shell_open_path,
            shell_show_item_in_folder,
            shell_open_external,
            pty_shells,
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            pty_kill_all,
            pty_get_process,
            fs_list_directory,
            fs_read_file,
            fs_inspect_project,
            fs_read_neowork_config,
            fs_write_neowork_config,
            net_check_port,
            vscode_check_installed,
            vscode_start_server,
            vscode_stop_server,
            vscode_open_desktop,
            wallpapers_list,
            wallpapers_import,
            wallpapers_remove,
            git_branches,
            git_repos,
            git_session_changes,
            git_session_diff,
            git_session_reset,
            clock_set_running,
            clock_read,
            screen_get_displays,
            screen_get_status,
            screen_open_secondary,
            screen_close_secondary,
            screen_move_window_to_display,
            remote_get_status,
            remote_toggle,
            remote_regenerate_token,
            remote_set_port,
            updater_check,
            updater_download,
            updater_quit_and_install,
        ])
        .build(tauri::generate_context!())
        .expect("error while building NeoWork")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                let core = app.state::<Core>();
                core.clock.lock().unwrap().set_running(&[], now_ms());
                core.save_history();
                if let Some(task) = core.telemetry.lock().unwrap().take() {
                    task.abort();
                }
                core.remote.stop();
                core.pty.kill_all();
                core.vscode.cleanup_all();
            }
        });
}
