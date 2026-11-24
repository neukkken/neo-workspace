// Port of src/main/pty-manager.ts on top of portable-pty.
use crate::shells::ShellInfo;
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Deserialize;
use std::{
    collections::{HashMap, VecDeque},
    io::{Read, Write},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tokio::sync::broadcast;

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SpawnOptions {
    pub panel_id: String,
    pub cwd: Option<String>,
    pub shell: Option<String>,
    pub command: Option<String>,
    pub commands: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

pub type DataFn = Arc<dyn Fn(&str) + Send + Sync>;
// exit code, signal (never known through portable-pty)
pub type ExitFn = Arc<dyn Fn(i64, Option<i64>) + Send + Sync>;

const MAX_BUFFER_SIZE: usize = 120 * 1024;

struct Terminal {
    id: u64,
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    pid: Option<u32>,
    size: Mutex<(u16, u16)>,
}

#[derive(Default)]
struct Buffer {
    chunks: VecDeque<String>,
    len: usize,
}

pub struct PtyManager {
    terminals: Mutex<HashMap<String, Arc<Terminal>>>,
    buffers: Mutex<HashMap<String, Buffer>>,
    next_id: AtomicU64,
    // Every chunk of every panel, for the remote gateway.
    output: broadcast::Sender<(String, String)>,
}

// Splits off the longest valid prefix; an incomplete character at the end waits for the next read.
fn drain_utf8(pending: &mut Vec<u8>) -> String {
    match std::str::from_utf8(pending) {
        Ok(s) => {
            let out = s.to_string();
            pending.clear();
            out
        }
        Err(e) => {
            let valid = e.valid_up_to();
            let mut out = String::from_utf8_lossy(&pending[..valid]).into_owned();
            match e.error_len() {
                None => {
                    pending.drain(..valid);
                }
                Some(bad) => {
                    out.push('\u{FFFD}');
                    pending.drain(..valid + bad);
                    out.push_str(&drain_utf8(pending));
                }
            }
            out
        }
    }
}

fn startup_commands(options: &SpawnOptions) -> Vec<String> {
    let raw: Vec<String> = match (&options.commands, &options.command) {
        (Some(list), _) if !list.is_empty() => list.clone(),
        (_, Some(cmd)) => cmd.lines().map(String::from).collect(),
        _ => vec![],
    };
    // Filter empty lines and comment lines (starting with # or //)
    raw.iter().map(|c| c.trim()).filter(|c| !c.is_empty() && !c.starts_with('#') && !c.starts_with("//")).map(String::from).collect()
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            terminals: Mutex::default(),
            buffers: Mutex::default(),
            next_id: AtomicU64::new(1),
            output: broadcast::channel(4096).0,
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<(String, String)> {
        self.output.subscribe()
    }

    pub fn append_buffer(&self, panel_id: &str, chunk: &str) {
        let mut buffers = self.buffers.lock().unwrap();
        let buf = buffers.entry(panel_id.to_string()).or_default();
        buf.len += chunk.len();
        buf.chunks.push_back(chunk.to_string());
        while buf.len > MAX_BUFFER_SIZE && buf.chunks.len() > 1 {
            buf.len -= buf.chunks.pop_front().map_or(0, |c| c.len());
        }
    }

    pub fn get_buffer(&self, panel_id: &str) -> String {
        self.buffers.lock().unwrap().get(panel_id).map_or(String::new(), |b| b.chunks.iter().map(String::as_str).collect())
    }

    pub fn get_foreground_process(&self, panel_id: &str) -> String {
        let Some(term) = self.terminals.lock().unwrap().get(panel_id).cloned() else { return String::new() };
        #[cfg(unix)]
        let pid = term.master.lock().unwrap().process_group_leader().and_then(|p| u32::try_from(p).ok()).or(term.pid);
        #[cfg(not(unix))]
        let pid = term.pid;
        pid.map(crate::telemetry::process_name).unwrap_or_default()
    }

    pub fn get_pids(&self) -> HashMap<String, u32> {
        self.terminals.lock().unwrap().iter().filter_map(|(id, t)| t.pid.map(|p| (id.clone(), p))).collect()
    }

    // `observe` sees what the shell prints; `on_data` also carries NeoWork's own notices.
    pub fn spawn(self: &Arc<Self>, options: &SpawnOptions, shell: &ShellInfo, on_data: DataFn, observe: DataFn, on_exit: ExitFn) -> bool {
        self.kill(&options.panel_id);

        let requested = options.cwd.as_deref().map(str::trim).unwrap_or("");
        let dir_exists = !requested.is_empty() && std::path::Path::new(requested).is_dir();
        let working_dir = if dir_exists { requested.to_string() } else { dirs::home_dir().map_or(".".into(), |h| h.to_string_lossy().into_owned()) };
        let size = PtySize {
            rows: options.rows.filter(|r| *r > 0).unwrap_or(24),
            cols: options.cols.filter(|c| *c > 0).unwrap_or(80),
            pixel_width: 0,
            pixel_height: 0,
        };

        let fail = |err: String| {
            eprintln!("Failed to spawn terminal for panel {}: {err}", options.panel_id);
            on_data(&format!("\r\n\x1b[31m[NeoWork Error]: Could not launch shell: {err}\x1b[0m\r\n"));
            false
        };

        let pair = match native_pty_system().openpty(size) {
            Ok(p) => p,
            Err(e) => return fail(e.to_string()),
        };
        let mut cmd = CommandBuilder::new(&shell.path);
        cmd.args(&shell.args);
        cmd.cwd(&working_dir);
        for (k, v) in options.env.iter().flatten() {
            cmd.env(k, v);
        }
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        let mut child = match pair.slave.spawn_command(cmd) {
            Ok(c) => c,
            Err(e) => return fail(e.to_string()),
        };
        drop(pair.slave);
        let (mut reader, writer) = match (pair.master.try_clone_reader(), pair.master.take_writer()) {
            (Ok(r), Ok(w)) => (r, w),
            (Err(e), _) | (_, Err(e)) => {
                let _ = child.kill();
                return fail(e.to_string());
            }
        };

        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let term = Arc::new(Terminal {
            id,
            pid: child.process_id(),
            killer: Mutex::new(child.clone_killer()),
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            size: Mutex::new((size.cols, size.rows)),
        });
        self.terminals.lock().unwrap().insert(options.panel_id.clone(), term.clone());

        let panel = options.panel_id.clone();
        let reader_thread = {
            let (me, panel, on_data) = (self.clone(), panel.clone(), on_data.clone());
            thread::spawn(move || {
                let (mut raw, mut pending) = ([0u8; 16 * 1024], Vec::new());
                while let Ok(n) = reader.read(&mut raw) {
                    if n == 0 {
                        break;
                    }
                    pending.extend_from_slice(&raw[..n]);
                    let text = drain_utf8(&mut pending);
                    if text.is_empty() {
                        continue;
                    }
                    me.append_buffer(&panel, &text);
                    let _ = me.output.send((panel.clone(), text.clone()));
                    observe(&text);
                    on_data(&text);
                }
            })
        };

        {
            let (me, panel) = (self.clone(), panel.clone());
            thread::spawn(move || {
                let code = child.wait().map_or(-1, |s| i64::from(s.exit_code()));
                // Let the last output through before the exit.
                for _ in 0..20 {
                    if reader_thread.is_finished() {
                        break;
                    }
                    thread::sleep(Duration::from_millis(10));
                }
                // A killed or replaced process must not take the panel's current one down with it
                let mut terminals = me.terminals.lock().unwrap();
                if terminals.get(&panel).is_some_and(|t| t.id == id) {
                    terminals.remove(&panel);
                    drop(terminals);
                    on_exit(code, None);
                }
            });
        }

        let notices = {
            let mut n = vec![];
            if !dir_exists && !requested.is_empty() {
                n.push(format!("\r\n\x1b[33m[NeoWork]: Configured path '{requested}' not found. Defaulted to '{working_dir}'.\x1b[0m\r\n"));
            }
            if let Some(asked) = options.shell.as_deref().filter(|s| *s != shell.id) {
                n.push(format!("\r\n\x1b[33m[NeoWork]: Motor '{asked}' no disponible. Usando {}.\x1b[0m\r\n", shell.label));
            }
            n
        };
        let commands = startup_commands(options);
        let (me, on_data) = (self.clone(), on_data.clone());
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(80));
            for notice in &notices {
                on_data(notice);
            }
            if commands.is_empty() {
                return;
            }
            thread::sleep(Duration::from_millis(370));
            let alive = || me.terminals.lock().unwrap().get(&panel).is_some_and(|t| t.id == id);
            if !alive() {
                return;
            }
            if commands.len() > 1 {
                on_data(&format!("\r\n\x1b[36m[NeoWork]: Ejecutando secuencia de inicio ({} pasos)...\x1b[0m\r\n", commands.len()));
            }
            for (i, command) in commands.iter().enumerate() {
                if i > 0 {
                    thread::sleep(Duration::from_millis(450));
                }
                if !alive() {
                    return;
                }
                // \r is Enter in every shell; through ConPTY \n isn't, and PowerShell won't run the line
                me.write(&panel, &format!("{command}\r"));
            }
        });
        true
    }

    pub fn write(&self, panel_id: &str, data: &str) {
        let Some(term) = self.terminals.lock().unwrap().get(panel_id).cloned() else { return };
        let mut writer = term.writer.lock().unwrap();
        let _ = writer.write_all(data.as_bytes()).and_then(|_| writer.flush());
    }

    pub fn resize(&self, panel_id: &str, cols: u16, rows: u16) {
        let Some(term) = self.terminals.lock().unwrap().get(panel_id).cloned() else { return };
        if cols == 0 || rows == 0 || *term.size.lock().unwrap() == (cols, rows) {
            return;
        }
        let resized = term.master.lock().unwrap().resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 });
        match resized {
            Ok(()) => *term.size.lock().unwrap() = (cols, rows),
            Err(e) => eprintln!("Error resizing terminal {panel_id}: {e}"),
        }
    }

    pub fn kill(&self, panel_id: &str) {
        if let Some(term) = self.terminals.lock().unwrap().remove(panel_id) {
            let _ = term.killer.lock().unwrap().kill();
        }
    }

    pub fn kill_all(&self) {
        for (_, term) in self.terminals.lock().unwrap().drain() {
            let _ = term.killer.lock().unwrap().kill();
        }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::shells;
    use std::sync::mpsc;

    #[test]
    fn utf8_split_across_reads_is_kept_whole() {
        let bytes = "añ✳".as_bytes();
        let mut pending = bytes[..3].to_vec(); // 'a', 'ñ', first byte of ✳
        assert_eq!(drain_utf8(&mut pending), "añ");
        pending.extend_from_slice(&bytes[3..]);
        assert_eq!(drain_utf8(&mut pending), "✳");
        let mut bad = vec![b'a', 0xff, b'b'];
        assert_eq!(drain_utf8(&mut bad), "a\u{FFFD}b");
    }

    #[test]
    fn buffer_keeps_the_tail_within_the_limit() {
        let pty = PtyManager::new();
        let chunk = "x".repeat(50 * 1024);
        for _ in 0..4 {
            pty.append_buffer("p", &chunk);
        }
        assert_eq!(pty.get_buffer("p").len(), 100 * 1024);
        assert_eq!(pty.get_buffer("nobody"), "");
    }

    #[test]
    fn startup_commands_skip_blanks_and_comments() {
        let opts = SpawnOptions { panel_id: "p".into(), cwd: None, shell: None, command: Some("# c\n  ls  \n\n// x\npwd\r\n".into()), commands: None, env: None, cols: None, rows: None };
        assert_eq!(startup_commands(&opts), ["ls", "pwd"]);
    }

    #[test]
    fn a_shell_runs_its_startup_command_and_reports_exit() {
        let pty = Arc::new(PtyManager::new());
        let (data_tx, data_rx) = mpsc::channel::<String>();
        let (exit_tx, exit_rx) = mpsc::channel::<i64>();
        let opts = SpawnOptions {
            panel_id: "p".into(),
            cwd: Some("/".into()),
            shell: None,
            command: Some("echo neowork-$((20+22)); exit 3".into()),
            commands: None,
            env: None,
            cols: Some(80),
            rows: Some(24),
        };
        let shells = shells::detect();
        let data_tx = Mutex::new(data_tx);
        let exit_tx = Mutex::new(exit_tx);
        assert!(pty.spawn(
            &opts,
            shells::resolve(&shells, None),
            Arc::new(move |d| {
                let _ = data_tx.lock().unwrap().send(d.to_string());
            }),
            Arc::new(|_| {}),
            Arc::new(move |code, _| {
                let _ = exit_tx.lock().unwrap().send(code);
            }),
        ));
        assert_eq!(exit_rx.recv_timeout(Duration::from_secs(10)).unwrap(), 3);
        let mut seen = String::new();
        while let Ok(d) = data_rx.try_recv() {
            seen.push_str(&d);
        }
        assert!(seen.contains("neowork-42"), "{seen:?}");
        assert!(pty.get_pids().is_empty());
    }
}
