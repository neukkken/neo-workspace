// Port of src/main/remote-gateway.ts and remote-access.ts: the phone-facing HTTP + WebSocket server.
use crate::pty::PtyManager;
use axum::{
    extract::{
        ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, Query, State,
    },
    http::{header, StatusCode, Uri},
    response::{Html, IntoResponse, Response},
    routing::get,
    Router,
};
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use subtle::ConstantTimeEq;
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};

// The usual private ranges, plus 100.64.0.0/10, which is what Tailscale hands out.
pub fn is_private_address(address: &str) -> bool {
    let Ok(ip) = address.parse::<IpAddr>() else { return false };
    let v4 = match ip {
        IpAddr::V4(v4) => v4,
        IpAddr::V6(v6) if v6.is_loopback() => return true,
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => v4,
            None => return false,
        },
    };
    let [a, b, ..] = v4.octets();
    matches!((a, b), (127, _) | (10, _) | (192, 168) | (169, 254) | (172, 16..=31) | (100, 64..=127))
}

pub fn is_same_token(given: Option<&str>, token: &str) -> bool {
    let given = given.unwrap_or("");
    given.len() == token.len() && given.as_bytes().ct_eq(token.as_bytes()).into()
}

fn new_token() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

struct State_ {
    port: u16,
    token: String,
    enabled: bool,
    active_workspace_id: String,
}

pub struct Hooks {
    pub get_state: Arc<dyn Fn() -> Value + Send + Sync>,
    pub on_status: Arc<dyn Fn(Value) + Send + Sync>,
    pub on_workspace_select: Arc<dyn Fn(String) + Send + Sync>,
}

pub struct RemoteGateway {
    pty: Arc<PtyManager>,
    hooks: Hooks,
    state: Mutex<State_>,
    clients: Mutex<HashMap<u64, UnboundedSender<Message>>>,
    next_client: AtomicU64,
    tasks: Mutex<Vec<tauri::async_runtime::JoinHandle<()>>>,
}

const UNAUTHORIZED: &str = r##"<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>NeoWork - No Autorizado</title><style>body { background: #090a0d; color: #f43f5e; font-family: monospace; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; } .box { padding: 2rem; border: 1px solid #27272a; border-radius: 8px; background: #12141a; }</style></head><body><div class="box"><h2>⚠️ Acceso no autorizado</h2><p style="color:#a1a1aa">El token de acceso es inválido o ha expirado.<br>Escanea nuevamente el código QR desde tu pantalla de NeoWork en el PC.</p></div></body></html>"##;

fn interface_type(name: &str, ip: &str) -> &'static str {
    if name.to_lowercase().contains("tailscale") || ip.starts_with("100.") {
        "tailscale"
    } else if ip.starts_with("192.168.") || ip.starts_with("10.") || ip.starts_with("172.") {
        "lan"
    } else {
        "other"
    }
}

fn qr_data_url(url: &str) -> String {
    use qrcode::render::svg;
    let Ok(code) = qrcode::QrCode::new(url.as_bytes()) else { return String::new() };
    let svg = code.render::<svg::Color>().min_dimensions(320, 320).dark_color(svg::Color("#000000")).light_color(svg::Color("#ffffff")).build();
    format!("data:image/svg+xml;base64,{}", base64::engine::general_purpose::STANDARD.encode(svg))
}

impl RemoteGateway {
    pub fn new(pty: Arc<PtyManager>, hooks: Hooks) -> Arc<Self> {
        let active = (hooks.get_state)().get("activeWorkspaceId").and_then(Value::as_str).unwrap_or("").to_string();
        Arc::new(Self {
            pty,
            hooks,
            state: Mutex::new(State_ { port: 4050, token: new_token(), enabled: false, active_workspace_id: active }),
            clients: Mutex::default(),
            next_client: AtomicU64::new(1),
            tasks: Mutex::default(),
        })
    }

    fn broadcast(&self, payload: Value) {
        let msg = payload.to_string();
        for tx in self.clients.lock().unwrap().values() {
            let _ = tx.send(Message::Text(msg.clone().into()));
        }
    }

    pub fn set_active_workspace(&self, id: &str) {
        self.state.lock().unwrap().active_workspace_id = id.to_string();
        self.broadcast(json!({ "type": "workspace:active-changed", "activeWorkspaceId": id }));
    }

    fn close_clients(&self, code: u16, reason: &'static str) {
        for (_, tx) in self.clients.lock().unwrap().drain() {
            let _ = tx.send(Message::Close(Some(CloseFrame { code, reason: reason.into() })));
        }
    }

    pub fn status(&self) -> Value {
        let interfaces: Vec<Value> = if_addrs::get_if_addrs()
            .unwrap_or_default()
            .into_iter()
            .filter(|i| !i.is_loopback() && matches!(i.ip(), IpAddr::V4(_)))
            .map(|i| {
                let ip = i.ip().to_string();
                json!({ "name": i.name, "type": interface_type(&i.name, &ip), "ip": ip })
            })
            .collect();
        let find = |kind: &str| interfaces.iter().find(|i| i["type"] == kind).and_then(|i| i["ip"].as_str());
        let primary = find("lan").or_else(|| interfaces.first().and_then(|i| i["ip"].as_str())).unwrap_or("127.0.0.1").to_string();
        let tailscale = find("tailscale").map(String::from);

        let s = self.state.lock().unwrap();
        let primary_url = format!("http://{primary}:{}?token={}", s.port, s.token);
        let mut out = json!({
            "enabled": s.enabled,
            "port": s.port,
            "token": s.token,
            "interfaces": interfaces,
            "primaryUrl": primary_url,
            "qrCodeDataUrl": qr_data_url(&primary_url),
            "clientCount": self.clients.lock().unwrap().len(),
        });
        if let Some(ip) = tailscale {
            out["tailscaleUrl"] = format!("http://{ip}:{}?token={}", s.port, s.token).into();
        }
        out
    }

    fn notify_status(&self) {
        (self.hooks.on_status)(self.status());
    }

    pub fn regenerate_token(&self) -> Value {
        self.state.lock().unwrap().token = new_token();
        // Disconnect existing clients with old token
        self.close_clients(4001, "Token Regenerated");
        self.notify_status();
        self.status()
    }

    pub async fn set_port(self: &Arc<Self>, port: u16) -> bool {
        let enabled = {
            let mut s = self.state.lock().unwrap();
            if s.port == port {
                return true;
            }
            s.port = port;
            s.enabled
        };
        if enabled {
            self.stop();
            return self.start().await;
        }
        self.notify_status();
        true
    }

    pub async fn start(self: &Arc<Self>) -> bool {
        if self.state.lock().unwrap().enabled {
            return true;
        }
        let port = self.state.lock().unwrap().port;
        let listener = match tokio::net::TcpListener::bind(("0.0.0.0", port)).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[RemoteGateway] Server error: {e}");
                self.notify_status();
                return false;
            }
        };
        let app = Router::new().route("/ws", get(ws_route)).fallback(http_route).with_state(self.clone());
        let server = tauri::async_runtime::spawn(async move {
            let _ = axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await;
        });

        // Global PTY output subscription
        let (me, mut output) = (self.clone(), self.pty.subscribe());
        let forward = tauri::async_runtime::spawn(async move {
            loop {
                match output.recv().await {
                    Ok((panel_id, data)) => me.broadcast(json!({ "type": "terminal:data", "panelId": panel_id, "data": data })),
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
        });
        self.tasks.lock().unwrap().extend([server, forward]);
        self.state.lock().unwrap().enabled = true;
        println!("[RemoteGateway] Server running at http://0.0.0.0:{port}");
        self.notify_status();
        true
    }

    pub fn stop(&self) {
        self.close_clients(1000, "Server Stopped");
        for task in self.tasks.lock().unwrap().drain(..) {
            task.abort();
        }
        self.state.lock().unwrap().enabled = false;
        self.notify_status();
    }

    pub async fn toggle(self: &Arc<Self>) -> Value {
        if self.state.lock().unwrap().enabled {
            self.stop();
        } else {
            self.start().await;
        }
        self.status()
    }

    fn authorized(&self, given: Option<&String>) -> bool {
        is_same_token(given.map(String::as_str), &self.state.lock().unwrap().token)
    }

    fn init_message(&self) -> Value {
        let state = (self.hooks.get_state)();
        let workspaces = state["workspaces"].as_array().cloned().unwrap_or_default();
        let remembered = self.state.lock().unwrap().active_workspace_id.clone();
        let active = workspaces.iter().find(|w| w["id"] == remembered.as_str()).or_else(|| workspaces.first());

        let mut buffers = serde_json::Map::new();
        if let Some(ws) = active {
            let panels = ws["panels"].as_array().into_iter().flatten().map(|p| &p["id"]);
            let cards = ws["canvasCards"].as_array().into_iter().flatten().filter(|c| c["kind"] == "terminal").map(|c| &c["id"]);
            for id in panels.chain(cards).filter_map(Value::as_str) {
                buffers.insert(id.to_string(), self.pty.get_buffer(id).into());
            }
        }
        let active_id = if remembered.is_empty() { state["activeWorkspaceId"].clone() } else { remembered.into() };
        json!({ "type": "init", "workspaces": workspaces, "activeWorkspaceId": active_id, "buffers": buffers })
    }

    fn handle_client_message(&self, tx: &UnboundedSender<Message>, msg: &Value) {
        let text = |k: &str| msg.get(k).and_then(Value::as_str).filter(|s| !s.is_empty());
        let number = |k: &str| msg.get(k).and_then(Value::as_u64);
        match msg.get("type").and_then(Value::as_str) {
            Some("pty:write") => {
                if let (Some(id), Some(data)) = (text("panelId"), msg.get("data").and_then(Value::as_str)) {
                    self.pty.write(id, data);
                }
            }
            Some("agent:prompt") => {
                if let (Some(id), Some(prompt)) = (text("panelId"), msg.get("prompt").and_then(Value::as_str)) {
                    // \r is Enter on every PTY (ICRNL), so no staircase newline artifacts
                    self.pty.write(id, &format!("{}\r", prompt.trim_end_matches(['\r', '\n'])));
                }
            }
            Some("pty:resize") => {
                if let (Some(id), Some(cols), Some(rows)) = (text("panelId"), number("cols"), number("rows")) {
                    if cols >= 15 && rows >= 5 {
                        self.pty.resize(id, cols.min(u16::MAX as u64) as u16, rows.min(u16::MAX as u64) as u16);
                    }
                }
            }
            Some("terminal:request-buffer") => {
                if let Some(id) = text("panelId") {
                    let reply = json!({ "type": "terminal:buffer", "panelId": id, "buffer": self.pty.get_buffer(id) });
                    let _ = tx.send(Message::Text(reply.to_string().into()));
                }
            }
            Some("workspace:select") => {
                if let Some(id) = text("workspaceId") {
                    self.set_active_workspace(id);
                    (self.hooks.on_workspace_select)(id.to_string());
                }
            }
            _ => {}
        }
    }

    async fn serve_socket(self: Arc<Self>, socket: WebSocket) {
        let id = self.next_client.fetch_add(1, Ordering::Relaxed);
        let (tx, mut rx) = unbounded_channel::<Message>();
        self.clients.lock().unwrap().insert(id, tx.clone());
        self.notify_status();
        let _ = tx.send(Message::Text(self.init_message().to_string().into()));

        let (mut sink, mut stream) = socket.split();
        let writer = tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                let closing = matches!(msg, Message::Close(_));
                if sink.send(msg).await.is_err() || closing {
                    break;
                }
            }
        });
        while let Some(Ok(frame)) = stream.next().await {
            match frame {
                Message::Text(raw) => match serde_json::from_str::<Value>(&raw) {
                    Ok(msg) => self.handle_client_message(&tx, &msg),
                    Err(e) => eprintln!("[RemoteGateway] Bad message from client: {e}"),
                },
                Message::Close(_) => break,
                _ => {}
            }
        }
        writer.abort();
        self.clients.lock().unwrap().remove(&id);
        self.notify_status();
    }
}

async fn ws_route(
    State(gw): State<Arc<RemoteGateway>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Query(query): Query<HashMap<String, String>>,
    ws: WebSocketUpgrade,
) -> Response {
    if !is_private_address(&addr.ip().to_string()) || !gw.authorized(query.get("token")) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    ws.on_upgrade(move |socket| gw.serve_socket(socket))
}

fn asset(content_type: &'static str, body: &'static str) -> Response {
    ([(header::CONTENT_TYPE, content_type), (header::CACHE_CONTROL, "public, max-age=86400")], body).into_response()
}

async fn http_route(State(gw): State<Arc<RemoteGateway>>, ConnectInfo(addr): ConnectInfo<SocketAddr>, Query(query): Query<HashMap<String, String>>, uri: Uri) -> Response {
    // Listening on every interface is what lets a phone in; a public one has no business here
    if !is_private_address(&addr.ip().to_string()) {
        return (StatusCode::FORBIDDEN, "Forbidden").into_response();
    }
    let authorized = gw.authorized(query.get("token"));
    let token = gw.state.lock().unwrap().token.clone();

    match uri.path() {
        // Its start_url carries the token, so this file is as secret as the token itself
        "/manifest.json" if authorized => ([(header::CONTENT_TYPE, "application/json")], json!({
            "name": "NeoWork Mobile Remote",
            "short_name": "NeoWork",
            "start_url": format!("/?token={token}"),
            "display": "standalone",
            "background_color": "#090a0d",
            "theme_color": "#090a0d",
            "icons": [{
                "src": "data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\"><rect width=\"100\" height=\"100\" rx=\"20\" fill=\"%23090a0d\"/><circle cx=\"50\" cy=\"50\" r=\"30\" fill=\"%2310b981\"/></svg>",
                "sizes": "192x192",
                "type": "image/svg+xml"
            }]
        }).to_string()).into_response(),
        "/xterm.css" => asset("text/css; charset=utf-8", include_str!("../assets/xterm.css")),
        "/xterm.js" => asset("application/javascript; charset=utf-8", include_str!("../assets/xterm.js")),
        "/addon-fit.js" => asset("application/javascript; charset=utf-8", include_str!("../assets/addon-fit.js")),
        "/api/status" if authorized => {
            let s = gw.state.lock().unwrap();
            ([(header::CONTENT_TYPE, "application/json")], json!({
                "status": "ok",
                "clients": gw.clients.lock().unwrap().len(),
                "activeWorkspaceId": s.active_workspace_id,
            }).to_string()).into_response()
        }
        _ if !authorized => (StatusCode::UNAUTHORIZED, Html(UNAUTHORIZED)).into_response(),
        _ => Html(include_str!("../assets/mobile.html").replace("{{TOKEN}}", &token)).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn home_networks_tailscale_and_this_machine_are_let_in() {
        for a in ["127.0.0.1", "::1", "::ffff:127.0.0.1", "192.168.1.20", "::ffff:192.168.1.20", "10.0.0.5", "172.16.0.1", "172.31.255.1", "100.64.0.1", "100.127.255.1", "169.254.1.1"] {
            assert!(is_private_address(a), "{a}");
        }
    }

    #[test]
    fn the_internet_is_not() {
        for a in ["8.8.8.8", "::ffff:8.8.8.8", "172.15.0.1", "172.32.0.1", "100.63.0.1", "100.128.0.1", "192.169.0.1", "11.0.0.1", "1.127.0.0", "2001:4860:4860::8888", ""] {
            assert!(!is_private_address(a), "{a}");
        }
    }

    #[test]
    fn a_token_only_matches_itself() {
        assert!(is_same_token(Some("abc123"), "abc123"));
        for given in [Some("abc124"), Some("abc12"), Some(""), None] {
            assert!(!is_same_token(given, "abc123"));
        }
    }

    #[test]
    fn classifies_interfaces_and_renders_a_qr() {
        assert_eq!(interface_type("tailscale0", "10.0.0.1"), "tailscale");
        assert_eq!(interface_type("eth0", "100.101.1.1"), "tailscale");
        assert_eq!(interface_type("eth0", "192.168.0.4"), "lan");
        assert_eq!(interface_type("eth0", "8.8.4.4"), "other");
        assert!(qr_data_url("http://192.168.0.4:4050?token=x").starts_with("data:image/svg+xml;base64,"));
    }

    #[test]
    fn the_mobile_page_has_one_token_slot() {
        let page = include_str!("../assets/mobile.html");
        assert_eq!(page.matches("{{TOKEN}}").count(), 1);
    }
}
