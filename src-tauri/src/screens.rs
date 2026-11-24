// Multi-monitor and secondary window handling (the screen:* handlers of src/main/index.ts).
// Coordinates are logical pixels, like Electron's DIPs, so the renderer keeps its maths.
use serde_json::{json, Value};
use std::{thread, time::Duration};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Monitor, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
};

pub const SECONDARY: &str = "secondary";

struct Display {
    index: usize,
    label: String,
    bounds: [f64; 4],
    work_area: [f64; 4],
    scale: f64,
    primary: bool,
}

fn rect(pos: tauri::PhysicalPosition<i32>, size: tauri::PhysicalSize<u32>, scale: f64) -> [f64; 4] {
    [f64::from(pos.x) / scale, f64::from(pos.y) / scale, f64::from(size.width) / scale, f64::from(size.height) / scale]
}

// Left to right, so Monitor 1 is always the leftmost display in physical space.
fn displays(app: &AppHandle) -> Vec<Display> {
    let mut monitors: Vec<Monitor> = app.available_monitors().unwrap_or_default();
    monitors.sort_by_key(|m| m.position().x);
    let primary = app.primary_monitor().ok().flatten();
    monitors
        .iter()
        .enumerate()
        .map(|(index, m)| {
            let scale = m.scale_factor();
            let is_primary = primary.as_ref().is_some_and(|p| p.position() == m.position() && p.size() == m.size());
            let work = m.work_area();
            let fallback = if is_primary { format!("Monitor {} (Principal)", index + 1) } else { format!("Monitor {}", index + 1) };
            Display {
                index,
                label: m.name().filter(|n| !n.is_empty()).map_or(fallback, |n| if is_primary { format!("{n} (Principal)") } else { n.clone() }),
                bounds: rect(*m.position(), *m.size(), scale),
                work_area: rect(work.position, work.size, scale),
                scale,
                primary: is_primary,
            }
        })
        .collect()
}

pub fn displays_json(app: &AppHandle) -> Value {
    let list: Vec<Value> = displays(app)
        .iter()
        .map(|d| {
            let b = |r: [f64; 4]| json!({ "x": r[0].round(), "y": r[1].round(), "width": r[2].round(), "height": r[3].round() });
            json!({ "id": d.index, "label": d.label, "bounds": b(d.bounds), "workArea": b(d.work_area), "scaleFactor": d.scale, "isPrimary": d.primary })
        })
        .collect();
    json!(list)
}

pub fn status(app: &AppHandle) -> Value {
    json!({ "displays": displays_json(app), "isSecondaryOpen": app.get_webview_window(SECONDARY).is_some() })
}

pub fn broadcast_status(app: &AppHandle) {
    let _ = app.emit("screen:status-changed", status(app));
}

// KWin / XWayland applies placement rules on the initial map event: repeating the bounds
// at short intervals overrides them and locks the window to its display.
fn enforce(window: &WebviewWindow, r: [f64; 4], delays_ms: &'static [u64]) {
    let window = window.clone();
    thread::spawn(move || {
        for ms in delays_ms {
            thread::sleep(Duration::from_millis(*ms));
            let _ = window.set_position(LogicalPosition::new(r[0], r[1]));
            let _ = window.set_size(LogicalSize::new(r[2], r[3]));
        }
    });
}

pub fn open_secondary(app: &AppHandle, display_index: Option<usize>) -> bool {
    if let Some(existing) = app.get_webview_window(SECONDARY) {
        let _ = existing.set_focus();
        return true;
    }
    let all = displays(app);
    if all.len() < 2 {
        return false;
    }
    // The display the main window is not on, unless one was asked for.
    let main_on = app.get_webview_window("main").and_then(|w| w.current_monitor().ok().flatten());
    let on_main = |d: &&Display| main_on.as_ref().is_some_and(|m| (f64::from(m.position().x) / m.scale_factor()).round() == d.bounds[0].round());
    let target = display_index
        .and_then(|i| all.get(i))
        .or_else(|| all.iter().find(|d| !on_main(d)))
        .or_else(|| all.iter().find(|d| !d.primary))
        .unwrap_or(&all[1]);
    let [x, y, w, h] = target.work_area;

    let url = format!("index.html?windowType=secondary&displayId={}", target.index);
    let built = WebviewWindowBuilder::new(app, SECONDARY, WebviewUrl::App(url.into()))
        .title("NeoWork")
        .decorations(false)
        .visible(false)
        .min_inner_size(800.0, 500.0)
        .inner_size(w, h)
        .position(x, y)
        .background_color(tauri::window::Color(9, 10, 12, 255))
        .build();
    let Ok(window) = built else { return false };
    let _ = window.show();
    enforce(&window, target.work_area, &[0, 50, 100, 200, 250]);
    broadcast_status(app);
    true
}

pub fn close_secondary(app: &AppHandle) -> bool {
    let Some(window) = app.get_webview_window(SECONDARY) else { return false };
    let _ = window.destroy();
    broadcast_status(app);
    true
}

pub fn move_window_to_display(app: &AppHandle, window: &WebviewWindow, index: usize) -> bool {
    let all = displays(app);
    let Some(target) = all.get(index) else { return false };
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
    }
    let secondary = window.label() == SECONDARY;
    let [x, y, w, h] = target.work_area;
    let current = window.inner_size().map(|s| s.to_logical::<f64>(window.scale_factor().unwrap_or(1.0))).unwrap_or(LogicalSize::new(w, h));
    let bounds = if secondary { [x, y, w, h] } else { [x + 30.0, y + 30.0, current.width.min(w), current.height.min(h)] };
    enforce(window, bounds, &[0, 50, 100, 200]);
    broadcast_status(app);
    true
}

// A display plugged or unplugged has no event in Tauri: compare the list now and then.
pub fn watch(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut last = displays_json(&app);
        loop {
            tokio::time::sleep(Duration::from_secs(2)).await;
            let now = displays_json(&app);
            if now != last {
                last = now;
                broadcast_status(&app);
            }
        }
    });
}

// Maximize on Linux pulls a window from a secondary monitor back to screen 0: fill its own work area instead.
pub fn toggle_maximize(window: &WebviewWindow) {
    if window.is_maximized().unwrap_or(false) {
        let _ = window.unmaximize();
        return;
    }
    let app = window.app_handle();
    let current = window.current_monitor().ok().flatten();
    let primary = app.primary_monitor().ok().flatten();
    let elsewhere = matches!((&current, &primary), (Some(c), Some(p)) if c.position() != p.position());
    match current {
        Some(c) if cfg!(target_os = "linux") && elsewhere => {
            let work = c.work_area();
            let _ = window.set_position(work.position);
            let _ = window.set_size(work.size);
        }
        _ => {
            let _ = window.maximize();
        }
    }
}
