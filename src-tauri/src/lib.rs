use tauri::{AppHandle, Manager, WebviewWindow};

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("main").ok_or_else(|| "main window not found".to_string())
}

#[tauri::command]
fn app_get_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
fn window_minimize(app: AppHandle) -> Result<(), String> {
    main_window(&app)?.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_maximize(app: AppHandle) -> Result<(), String> {
    let w = main_window(&app)?;
    // Same toggle behaviour as the Electron main process.
    let r = if w.is_maximized().map_err(|e| e.to_string())? { w.unmaximize() } else { w.maximize() };
    r.map_err(|e| e.to_string())
}

#[tauri::command]
fn window_close(app: AppHandle) -> Result<(), String> {
    main_window(&app)?.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_is_maximized(app: AppHandle) -> Result<bool, String> {
    main_window(&app)?.is_maximized().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            app_get_version,
            window_minimize,
            window_maximize,
            window_close,
            window_is_maximized
        ])
        .run(tauri::generate_context!())
        .expect("error while running NeoWork");
}
