// The IPC surface: one command per channel of src/preload/index.ts (`pty:get-process` -> `pty_get_process`).
// Anything that can block is async, so it never runs on the UI thread.
use crate::{
    app::{emit_agent, now_ms, Core},
    clipboard, fsx, git,
    pty::{DataFn, ExitFn, SpawnOptions},
    screens, shells, store,
};
use serde_json::{json, Value};
use std::{collections::HashSet, sync::Arc};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

macro_rules! core {
    ($app:expr) => {
        $app.state::<Core>()
    };
}

#[tauri::command]
pub fn app_get_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

// ---- window controls (per calling window) ----

#[tauri::command]
pub fn window_minimize(window: WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn window_maximize(window: WebviewWindow) {
    screens::toggle_maximize(&window);
}

#[tauri::command]
pub fn window_close(window: WebviewWindow) {
    let _ = window.close();
}

#[tauri::command]
pub fn window_is_maximized(window: WebviewWindow) -> bool {
    window.is_maximized().unwrap_or(false)
}

// ---- store ----

#[tauri::command]
pub fn store_get(app: AppHandle) -> Value {
    core!(app).state()
}

#[tauri::command]
pub async fn store_save(app: AppHandle, window: WebviewWindow, state: Value) -> bool {
    let core = core!(app);
    if let Some(id) = state["activeWorkspaceId"].as_str().filter(|s| !s.is_empty()) {
        core.remote.set_active_workspace(id);
    }
    let saved = store::save(&core.store_path, &state);
    // Synchronize state with the other window
    for label in app.webview_windows().keys().filter(|l| l.as_str() != window.label()) {
        let _ = app.emit_to(label.as_str(), "store:synced", &state);
    }
    saved
}

// ---- dialogs, clipboard, shell ----

#[tauri::command]
pub async fn dialog_select_directory(app: AppHandle, window: WebviewWindow, default_path: Option<String>) -> Option<String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let mut dialog = app.dialog().file().set_title("Select Directory for Terminal").set_parent(&window);
    if let Some(dir) = default_path.filter(|d| !d.is_empty()) {
        dialog = dialog.set_directory(dir);
    }
    dialog.pick_folder(move |p| drop(tx.send(p)));
    rx.await.ok().flatten().and_then(|p| p.into_path().ok()).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn clipboard_write(text: String) -> bool {
    clipboard::write_text(&text)
}

#[tauri::command]
pub async fn clipboard_read() -> String {
    clipboard::read_text()
}

#[tauri::command]
pub async fn clipboard_read_smart() -> Value {
    clipboard::read_smart()
}

#[tauri::command]
pub async fn shell_open_path(target_path: String) -> String {
    fsx::open_path(&target_path)
}

#[tauri::command]
pub async fn shell_show_item_in_folder(target_path: String) -> bool {
    fsx::show_item_in_folder(&target_path)
}

#[tauri::command]
pub async fn shell_open_external(url: String) -> bool {
    fsx::open_external(&url)
}

// ---- terminals ----

#[tauri::command]
pub async fn pty_shells(app: AppHandle) -> Value {
    json!(core!(app).shells())
}

#[tauri::command]
pub async fn pty_spawn(app: AppHandle, options: SpawnOptions) -> bool {
    let core = core!(app);
    let panel = options.panel_id.clone();
    let stopped = core.agents.lock().unwrap().forget(&panel);
    if let Some(change) = stopped {
        emit_agent(&app, change);
    }
    // The session starts here, before the terminal can change anything
    for repo in git::find_repos(options.cwd.as_deref().unwrap_or("")) {
        let git = core.git.clone();
        tauri::async_runtime::spawn(async move { git.ensure_baseline(&repo).await });
    }
    let shell_id = options.shell.clone().or_else(|| core.state()["settings"]["defaultShell"].as_str().map(String::from));

    let past = core.history.take(&panel);
    if !past.is_empty() {
        // A new shell starts by clearing the screen: the blank lines push the past into the scrollback
        let replay = format!("{past}\x1b[0m\r\n\x1b[2m── sesión anterior ──\x1b[0m{}", "\r\n".repeat(usize::from(options.rows.unwrap_or(24))));
        core.pty.append_buffer(&panel, &replay);
        let _ = app.emit(&format!("pty:data:{panel}"), replay);
    }

    let on_data: DataFn = {
        let (app, panel) = (app.clone(), panel.clone());
        Arc::new(move |data: &str| {
            let _ = app.emit(&format!("pty:data:{panel}"), data);
        })
    };
    let observe: DataFn = {
        let (app, panel) = (app.clone(), panel.clone());
        Arc::new(move |data: &str| {
            let core = core!(app);
            let changes = core.agents.lock().unwrap().on_output(&panel, data, now_ms());
            core.unsaved_history.lock().unwrap().insert(panel.clone());
            for change in changes {
                emit_agent(&app, change);
            }
        })
    };
    let on_exit: ExitFn = {
        let (app, panel) = (app.clone(), panel.clone());
        Arc::new(move |code, signal| {
            let exited = core!(app).agents.lock().unwrap().on_exit(&panel, code);
            emit_agent(&app, exited);
            let _ = app.emit(&format!("pty:exit:{panel}"), json!({ "code": code, "signal": signal }));
        })
    };

    let options = SpawnOptions { shell: shell_id.clone(), ..options };
    core.pty.spawn(&options, shells::resolve(core.shells(), shell_id.as_deref()), on_data, observe, on_exit)
}

#[tauri::command]
pub fn pty_write(app: AppHandle, panel_id: String, data: String) {
    let core = core!(app);
    core.agents.lock().unwrap().on_input(&panel_id, &data);
    core.pty.write(&panel_id, &data);
}

#[tauri::command]
pub fn pty_resize(app: AppHandle, panel_id: String, cols: u16, rows: u16) {
    core!(app).pty.resize(&panel_id, cols, rows);
}

#[tauri::command]
pub async fn pty_kill(app: AppHandle, panel_id: String) -> bool {
    let core = core!(app);
    let stopped = core.agents.lock().unwrap().forget(&panel_id);
    if let Some(change) = stopped {
        emit_agent(&app, change);
    }
    core.pty.kill(&panel_id);
    true
}

#[tauri::command]
pub async fn pty_kill_all(app: AppHandle) -> bool {
    let core = core!(app);
    for panel in core.pty.get_pids().into_keys() {
        let stopped = core.agents.lock().unwrap().forget(&panel);
        if let Some(change) = stopped {
            emit_agent(&app, change);
        }
    }
    core.pty.kill_all();
    true
}

#[tauri::command]
pub async fn pty_get_process(app: AppHandle, panel_id: String) -> String {
    core!(app).pty.get_foreground_process(&panel_id)
}

// ---- file system and network ----

#[tauri::command]
pub async fn fs_list_directory(dir_path: Option<String>) -> Value {
    fsx::list_directory(dir_path.as_deref())
}

#[tauri::command]
pub async fn fs_read_file(file_path: String) -> Value {
    fsx::read_file(&file_path)
}

#[tauri::command]
pub async fn fs_inspect_project(dir_path: String) -> Value {
    fsx::inspect_project(&dir_path)
}

#[tauri::command]
pub async fn fs_read_neowork_config(folder_path: String) -> Value {
    fsx::read_neowork_config(&folder_path)
}

#[tauri::command]
pub async fn fs_write_neowork_config(folder_path: String, workspace: Value) -> bool {
    fsx::write_neowork_config(&folder_path, &workspace)
}

#[tauri::command]
pub async fn net_check_port(port: u16) -> Value {
    json!({ "port": port, "isOpen": fsx::check_port(port).await })
}

// ---- VS Code ----

#[tauri::command]
pub async fn vscode_check_installed(app: AppHandle) -> bool {
    tokio::task::spawn_blocking(move || core!(app).vscode.check_installed()).await.unwrap_or(false)
}

#[tauri::command]
pub async fn vscode_start_server(app: AppHandle, folder_path: Option<String>) -> Value {
    tokio::task::spawn_blocking(move || core!(app).vscode.start_server(folder_path.as_deref()))
        .await
        .unwrap_or_else(|e| json!({ "success": false, "error": e.to_string() }))
}

#[tauri::command]
pub async fn vscode_stop_server(app: AppHandle, port: Option<u16>) -> bool {
    core!(app).vscode.stop_server(port)
}

#[tauri::command]
pub async fn vscode_open_desktop(app: AppHandle, folder_path: Option<String>) -> bool {
    tokio::task::spawn_blocking(move || core!(app).vscode.open_desktop(folder_path.as_deref())).await.unwrap_or(false)
}

// ---- wallpapers ----

#[tauri::command]
pub fn wallpapers_list(app: AppHandle) -> Vec<String> {
    core!(app).wallpapers.list()
}

#[tauri::command]
pub async fn wallpapers_import(app: AppHandle, window: WebviewWindow) -> Value {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Agregar fondos de pantalla")
        .set_parent(&window)
        .add_filter("Imágenes", &["jpg", "jpeg", "png", "webp", "gif", "bmp"])
        .pick_files(move |files| drop(tx.send(files)));
    let files = rx.await.ok().flatten().unwrap_or_default();
    let (mut imported, mut rejected) = (vec![], vec![]);
    for file in files.into_iter().filter_map(|f| f.into_path().ok()) {
        match core!(app).wallpapers.import_file(&file.to_string_lossy()) {
            Some(id) => imported.push(id),
            None => rejected.push(file.file_name().map_or(String::new(), |n| n.to_string_lossy().into_owned())),
        }
    }
    json!({ "imported": imported, "rejected": rejected })
}

#[tauri::command]
pub fn wallpapers_remove(app: AppHandle, id: String) -> bool {
    core!(app).wallpapers.remove(&id)
}

// ---- git ----

#[tauri::command]
pub async fn git_branches(folders: Vec<String>) -> Value {
    json!(git::read_branches(&folders).await)
}

#[tauri::command]
pub async fn git_repos(app: AppHandle, folders: Vec<String>) -> Vec<String> {
    let repos = git::unique_repos(&folders);
    for repo in repos.clone() {
        let git = core!(app).git.clone();
        tauri::async_runtime::spawn(async move { git.ensure_baseline(&repo).await });
    }
    repos
}

#[tauri::command]
pub async fn git_session_changes(app: AppHandle, repo: String) -> Value {
    let git = core!(app).git.clone();
    json!(git.changes(&repo).await)
}

#[tauri::command]
pub async fn git_session_diff(app: AppHandle, repo: String, file: String) -> Value {
    let git = core!(app).git.clone();
    json!(git.file_diff(&repo, &file).await)
}

#[tauri::command]
pub async fn git_session_reset(app: AppHandle, repo: String) -> bool {
    let git = core!(app).git.clone();
    git.reset(&repo).await.is_some()
}

// ---- workspace clock ----

#[tauri::command]
pub fn clock_set_running(app: AppHandle, ids: Vec<String>) {
    core!(app).clock.lock().unwrap().set_running(&ids, now_ms());
}

#[tauri::command]
pub fn clock_read(app: AppHandle, id: String) -> Value {
    json!(core!(app).clock.lock().unwrap().read(&id, now_ms()))
}

// ---- screens ----

#[tauri::command]
pub async fn screen_get_displays(app: AppHandle) -> Value {
    screens::displays_json(&app)
}

#[tauri::command]
pub async fn screen_get_status(app: AppHandle) -> Value {
    screens::status(&app)
}

#[tauri::command]
pub async fn screen_open_secondary(app: AppHandle, display_index: Option<usize>) -> bool {
    screens::open_secondary(&app, display_index)
}

#[tauri::command]
pub async fn screen_close_secondary(app: AppHandle) -> bool {
    screens::close_secondary(&app)
}

#[tauri::command]
pub async fn screen_move_window_to_display(app: AppHandle, window: WebviewWindow, display_index: usize) -> bool {
    screens::move_window_to_display(&app, &window, display_index)
}

// ---- remote gateway ----

#[tauri::command]
pub fn remote_get_status(app: AppHandle) -> Value {
    core!(app).remote.status()
}

#[tauri::command]
pub async fn remote_toggle(app: AppHandle) -> Value {
    let remote = core!(app).remote.clone();
    remote.toggle().await
}

#[tauri::command]
pub fn remote_regenerate_token(app: AppHandle) -> Value {
    core!(app).remote.regenerate_token()
}

#[tauri::command]
pub async fn remote_set_port(app: AppHandle, port: u16) -> bool {
    let remote = core!(app).remote.clone();
    remote.set_port(port).await
}

// ---- updater ----

#[tauri::command]
pub async fn updater_check(app: AppHandle) -> Value {
    let updater = core!(app).updater.clone();
    updater.check(&app).await
}

#[tauri::command]
pub async fn updater_download(app: AppHandle) -> bool {
    let updater = core!(app).updater.clone();
    updater.download(&app).await
}

#[tauri::command]
pub fn updater_quit_and_install(app: AppHandle) {
    core!(app).updater.clone().quit_and_install(&app);
}

// Titles of the agents that a close would stop, for the confirmation dialog.
pub fn working_agents(app: &AppHandle) -> Vec<String> {
    let core = core!(app);
    let state = core.state();
    let working: HashSet<String> = core.agents.lock().unwrap().working_panels().into_iter().collect();
    let mut found: Vec<String> = working
        .iter()
        .filter_map(|id| crate::app::find_panel_owner(&state, id))
        .map(|o| format!("{} · {}", o.title, o.workspace_name))
        .collect();
    found.sort();
    found
}
