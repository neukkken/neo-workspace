// Shared app state plus the pieces of src/main/index.ts that don't belong to one module:
// who owns a panel, agent notifications, the legacy wallpaper migration.
use crate::{
    agent::{AgentActivity, AgentChange},
    clock::WorkspaceClock,
    git::GitSession,
    history::TerminalHistory,
    pty::PtyManager,
    remote::RemoteGateway,
    shells::{self, ShellInfo},
    store,
    updater::Updater,
    vscode::VSCode,
    wallpapers::WallpaperStore,
};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    path::PathBuf,
    sync::{Arc, Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, UserAttentionType};

pub struct Core {
    pub store_path: PathBuf,
    pub pty: Arc<PtyManager>,
    pub agents: Mutex<AgentActivity>,
    pub clock: Mutex<WorkspaceClock>,
    pub history: TerminalHistory,
    pub git: Arc<GitSession>,
    pub wallpapers: WallpaperStore,
    pub vscode: VSCode,
    pub remote: Arc<RemoteGateway>,
    pub updater: Arc<Updater>,
    pub shells: OnceLock<Vec<ShellInfo>>,
    pub unsaved_history: Mutex<HashSet<String>>,
    pub telemetry: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

pub fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis() as i64)
}

// Same folder Electron used, so an existing install keeps its workspaces. Dev runs keep their own
// data: sharing the file with an installed release lets the older app overwrite settings it
// doesn't know about. Seeded once from the live file.
pub fn data_dir() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    let live = base.join("NeoWork");
    let dir = if cfg!(debug_assertions) {
        let dev = base.join("neowork-dev");
        let (live_store, dev_store) = (live.join("neo-workspaces.json"), dev.join("neo-workspaces.json"));
        if !dev_store.exists() && live_store.exists() {
            let _ = std::fs::create_dir_all(&dev);
            let _ = std::fs::copy(live_store, dev_store);
        }
        dev
    } else {
        live
    };
    let _ = std::fs::create_dir_all(&dir);
    dir
}

impl Core {
    pub fn state(&self) -> Value {
        store::load(&self.store_path)
    }

    pub fn shells(&self) -> &[ShellInfo] {
        self.shells.get_or_init(shells::detect)
    }

    pub fn save_history(&self) {
        let ids: Vec<String> = self.unsaved_history.lock().unwrap().drain().collect();
        for id in ids {
            self.history.save(&id, &self.pty.get_buffer(&id));
        }
    }

    // Everything that has a terminal behind it: grid panels and canvas cards.
    pub fn panel_ids(state: &Value) -> HashSet<String> {
        let workspaces = state["workspaces"].as_array().into_iter().flatten();
        workspaces
            .flat_map(|w| {
                let panels = w["panels"].as_array().into_iter().flatten();
                panels.chain(w["canvasCards"].as_array().into_iter().flatten()).filter_map(|p| p["id"].as_str().map(String::from)).collect::<Vec<_>>()
            })
            .collect()
    }
}

pub struct Owner {
    pub workspace_id: String,
    pub workspace_name: String,
    pub title: String,
    pub muted: bool,
}

pub fn find_panel_owner(state: &Value, panel_id: &str) -> Option<Owner> {
    state["workspaces"].as_array()?.iter().find_map(|w| {
        let card = w["canvasCards"].as_array().and_then(|c| c.iter().find(|c| c["id"] == panel_id));
        let panel = w["panels"].as_array().and_then(|p| p.iter().find(|p| p["id"] == panel_id));
        if card.is_none() && panel.is_none() {
            return None;
        }
        let title = [card, panel].into_iter().flatten().find_map(|n| n["title"].as_str().filter(|t| !t.is_empty())).unwrap_or("Terminal");
        Some(Owner {
            workspace_id: w["id"].as_str().unwrap_or("").into(),
            workspace_name: w["name"].as_str().unwrap_or("").into(),
            title: title.into(),
            muted: card.is_some_and(|c| c["notifyMuted"] == true),
        })
    })
}

pub fn open_panel(app: &AppHandle, workspace_id: &str, panel_id: &str) {
    let Some(win) = app.get_webview_window("main") else { return };
    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_focus();
    let _ = app.emit_to("main", "agent:open", json!({ "workspaceId": workspace_id, "panelId": panel_id }));
}

fn notify_native(app: &AppHandle, title: String, body: String, workspace_id: String, panel_id: String) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.request_user_attention(Some(UserAttentionType::Informational));
    }
    // Only freedesktop notifications report a click.
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let app = app.clone();
        std::thread::spawn(move || {
            let shown = notify_rust::Notification::new().summary(&title).body(&body).action("default", "Abrir").show();
            if let Ok(handle) = shown {
                handle.wait_for_action(|action| {
                    if action == "default" {
                        open_panel(&app, &workspace_id, &panel_id);
                    }
                });
            }
        });
    }
    #[cfg(not(all(unix, not(target_os = "macos"))))]
    {
        use tauri_plugin_notification::NotificationExt;
        let _ = (workspace_id, panel_id);
        let _ = app.notification().builder().title(title).body(body).show();
    }
}

// The callback AgentActivity had in index.ts: decorate the change and decide who gets told.
pub fn emit_agent(app: &AppHandle, change: AgentChange) {
    let Some(win) = app.get_webview_window("main") else { return };
    let state = app.state::<Core>().state();
    let Some(owner) = find_panel_owner(&state, &change.panel_id) else { return };

    let finished = change.state == "done" || change.state == "exited";
    let focused = win.is_focused().unwrap_or(false);
    let elsewhere = state["activeWorkspaceId"] != owner.workspace_id.as_str();
    let notify = finished && !owner.muted && (elsewhere || !focused);

    let mut payload = serde_json::to_value(&change).unwrap_or(Value::Null);
    payload["workspaceId"] = owner.workspace_id.clone().into();
    payload["workspaceName"] = owner.workspace_name.clone().into();
    payload["title"] = owner.title.clone().into();
    payload["at"] = now_ms().into();
    payload["notify"] = (notify && elsewhere).into();
    payload["log"] = (finished && !owner.muted).into();
    let _ = app.emit_to("main", "agent:status", payload);

    if notify && !focused {
        let body = match (change.state, change.exit_code) {
            ("exited", Some(code)) => format!("Se cerró con código {code}"),
            _ => "Terminó o espera tu respuesta".to_string(),
        };
        notify_native(app, format!("{} · {}", owner.title, owner.workspace_name), body, owner.workspace_id, change.panel_id);
    }
}

// Older versions kept the image inline in the config; move it to a file once.
pub fn migrate_legacy_wallpaper(core: &Core) {
    use base64::Engine;
    let mut state = core.state();
    let Some(legacy) = state["settings"]["canvasBackground"].as_str().filter(|s| !s.is_empty()).map(String::from) else { return };
    let encoded = legacy.split_once(',').map_or(legacy.as_str(), |(_, rest)| rest);
    let Some(id) = base64::engine::general_purpose::STANDARD.decode(encoded).ok().and_then(|bytes| core.wallpapers.import_bytes(&bytes)) else { return };
    if let Some(settings) = state["settings"].as_object_mut() {
        settings.remove("canvasBackground");
        settings.insert("wallpaper".into(), format!("user:{id}").into());
    }
    store::save(&core.store_path, &state);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state() -> Value {
        json!({ "activeWorkspaceId": "w1", "workspaces": [
            { "id": "w1", "name": "Uno", "panels": [{ "id": "p1", "title": "Build" }], "canvasCards": [] },
            { "id": "w2", "name": "Dos", "panels": [], "canvasCards": [{ "id": "c1", "title": "", "notifyMuted": true }] }
        ]})
    }

    #[test]
    fn finds_the_workspace_title_and_mute_of_a_panel_or_card() {
        let s = state();
        let p = find_panel_owner(&s, "p1").unwrap();
        assert_eq!((p.workspace_name.as_str(), p.title.as_str(), p.muted), ("Uno", "Build", false));
        let c = find_panel_owner(&s, "c1").unwrap();
        assert_eq!((c.workspace_id.as_str(), c.title.as_str(), c.muted), ("w2", "Terminal", true));
        assert!(find_panel_owner(&s, "nope").is_none());
    }

    #[test]
    fn lists_every_panel_and_card_id() {
        let ids = Core::panel_ids(&state());
        assert_eq!(ids, HashSet::from(["p1".to_string(), "c1".to_string()]));
    }
}
