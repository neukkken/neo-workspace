// Port of src/main/vscode-manager.ts: `code serve-web` per folder, one token each.
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader},
    net::TcpListener,
    path::Path,
    process::{Child, Command, Stdio},
    sync::{mpsc, Arc, Mutex, OnceLock},
    thread,
    time::Duration,
};

struct Instance {
    folder: String,
    url: String,
    child: Child,
}

#[derive(Default)]
pub struct VSCode {
    instances: Arc<Mutex<HashMap<u16, Instance>>>,
    installed: OnceLock<bool>,
}

// `code` is code.cmd on Windows, which only the shell resolves.
fn code_command() -> Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "code"]).creation_flags(0x0800_0000);
        cmd
    }
    #[cfg(not(windows))]
    Command::new("code")
}

fn free_port() -> std::io::Result<u16> {
    Ok(TcpListener::bind(("127.0.0.1", 0))?.local_addr()?.port())
}

impl VSCode {
    pub fn check_installed(&self) -> bool {
        *self.installed.get_or_init(|| {
            let finder = if cfg!(windows) { "where" } else { "which" };
            Command::new(finder).arg("code").stdout(Stdio::null()).stderr(Stdio::null()).status().is_ok_and(|s| s.success())
        })
    }

    pub fn start_server(&self, folder: Option<&str>) -> Value {
        if !self.check_installed() {
            return json!({ "success": false, "error": "El ejecutable de Visual Studio Code (\"code\") no se encuentra en el PATH del sistema." });
        }
        let folder = folder
            .filter(|f| Path::new(f).exists())
            .map(String::from)
            .unwrap_or_else(|| std::env::current_dir().map_or(".".into(), |d| d.to_string_lossy().into_owned()));

        if let Some((port, inst)) = self.instances.lock().unwrap().iter().find(|(_, i)| i.folder == folder) {
            return json!({ "success": true, "url": inst.url, "port": port });
        }

        let port = match free_port() {
            Ok(p) => p,
            Err(e) => return json!({ "success": false, "error": e.to_string() }),
        };
        // Without a token any local program, or web page, could drive this editor
        let token = uuid::Uuid::new_v4().simple().to_string();
        let url = format!("http://127.0.0.1:{port}?tkn={token}");
        let mut child = match code_command()
            .args(["serve-web", "--port", &port.to_string(), "--connection-token", &token])
            .args(["--accept-server-license-terms", "--disable-telemetry", "--default-folder", &folder])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => return json!({ "success": false, "error": e.to_string() }),
        };

        // Ready when it says so; if it stays quiet we still answer, it typically starts within 1-2s.
        let (ready_tx, ready_rx) = mpsc::channel::<()>();
        let streams: [Option<Box<dyn std::io::Read + Send>>; 2] =
            [child.stdout.take().map(|s| Box::new(s) as _), child.stderr.take().map(|s| Box::new(s) as _)];
        self.instances.lock().unwrap().insert(port, Instance { folder, url: url.clone(), child });
        for stream in streams.into_iter().flatten() {
            let (tx, instances) = (ready_tx.clone(), self.instances.clone());
            thread::spawn(move || {
                for line in BufReader::new(stream).lines().map_while(Result::ok) {
                    if line.contains("Web UI available at") || line.contains("http://") {
                        let _ = tx.send(());
                    }
                }
                // Pipe closed: the process is gone.
                instances.lock().unwrap().remove(&port);
            });
        }
        let _ = ready_rx.recv_timeout(Duration::from_millis(3500));
        json!({ "success": true, "url": url, "port": port })
    }

    pub fn stop_server(&self, port: Option<u16>) -> bool {
        match port {
            None => {
                self.cleanup_all();
                true
            }
            Some(p) => match self.instances.lock().unwrap().remove(&p) {
                Some(mut inst) => {
                    let _ = inst.child.kill();
                    true
                }
                None => false,
            },
        }
    }

    pub fn open_desktop(&self, folder: Option<&str>) -> bool {
        if !self.check_installed() {
            return false;
        }
        let folder = folder.filter(|f| Path::new(f).exists()).unwrap_or(".");
        code_command().arg(folder).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().is_ok()
    }

    pub fn cleanup_all(&self) {
        for (_, mut inst) in self.instances.lock().unwrap().drain() {
            let _ = inst.child.kill();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_a_free_port_and_stops_unknown_servers_cleanly() {
        assert!(free_port().unwrap() > 0);
        let vs = VSCode::default();
        assert!(!vs.stop_server(Some(1)));
        assert!(vs.stop_server(None));
    }
}
