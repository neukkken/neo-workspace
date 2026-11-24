// Ports of the fs:*, shell:* and net:* handlers in src/main/index.ts. Results stay
// serde_json::Value so the shapes match what the renderer already reads.
use regex::{Captures, Regex};
use serde_json::{json, Value};
use std::{fs, path::Path, sync::LazyLock, time::Duration};

fn name_of(path: &Path) -> String {
    path.file_name().map_or(String::new(), |n| n.to_string_lossy().into_owned())
}

fn extension_of(name: &str) -> Option<String> {
    Path::new(name).extension().map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
}

pub fn list_directory(target: Option<&str>) -> Value {
    let home = || dirs::home_dir().map_or(".".to_string(), |h| h.to_string_lossy().into_owned());
    let dir = match target {
        Some(t) if !t.is_empty() && Path::new(t).exists() => t.to_string(),
        _ => home(),
    };
    let read = match fs::read_dir(&dir) {
        Ok(r) => r,
        Err(e) => return json!({ "dir": target.unwrap_or(""), "entries": [], "error": e.to_string() }),
    };
    let mut entries: Vec<(bool, String, Value)> = read
        .flatten()
        .filter_map(|d| {
            let name = d.file_name().to_string_lossy().into_owned();
            if name == ".git" || name == "node_modules" {
                return None;
            }
            let path = d.path();
            // metadata() follows symlinks, like the stat fallback in the JS version
            let meta = fs::metadata(&path).ok();
            let is_dir = meta.as_ref().map_or_else(|| d.file_type().is_ok_and(|t| t.is_dir()), |m| m.is_dir());
            let size = if is_dir { 0 } else { meta.map_or(0, |m| m.len()) };
            let mut entry = json!({ "name": name, "path": path.to_string_lossy(), "isDirectory": is_dir, "size": size });
            if !is_dir {
                if let Some(ext) = extension_of(&name) {
                    entry["extension"] = ext.into();
                }
            }
            Some((is_dir, name.to_lowercase(), entry))
        })
        .collect();
    entries.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    json!({ "dir": dir, "entries": entries.into_iter().map(|e| e.2).collect::<Vec<_>>() })
}

fn cell(data: &calamine::Data) -> Value {
    use calamine::Data::*;
    match data {
        Empty => json!(""),
        Int(i) => json!(i),
        Float(f) => json!(f),
        Bool(b) => json!(b),
        other => json!(other.to_string()),
    }
}

fn sheets_of(path: &Path, ext: &str) -> Result<Vec<Value>, String> {
    if ext == ".csv" || ext == ".tsv" {
        let mut reader = csv::ReaderBuilder::new()
            .has_headers(false)
            .flexible(true)
            .delimiter(if ext == ".tsv" { b'\t' } else { b',' })
            .from_path(path)
            .map_err(|e| e.to_string())?;
        let rows: Vec<Value> = reader.records().take(100).flatten().map(|r| json!(r.iter().collect::<Vec<_>>())).collect();
        return Ok(vec![json!({ "name": "Sheet1", "rows": rows })]);
    }
    use calamine::Reader;
    let mut book = calamine::open_workbook_auto(path).map_err(|e| e.to_string())?;
    let names = book.sheet_names();
    Ok(names
        .into_iter()
        .filter_map(|name| {
            let range = book.worksheet_range(&name).ok()?;
            let rows: Vec<Value> = range.rows().take(100).map(|r| Value::Array(r.iter().map(cell).collect())).collect();
            Some(json!({ "name": name, "rows": rows }))
        })
        .collect())
}

pub fn read_file(file_path: &str) -> Value {
    let path = Path::new(file_path);
    let Ok(meta) = fs::metadata(path) else { return json!({ "error": "File not found" }) };
    if meta.is_dir() {
        return json!({ "error": "Path is a directory" });
    }
    let (size, name) = (meta.len(), name_of(path));
    let binary = |error: String| json!({ "type": "binary", "isBinary": true, "size": size, "path": file_path, "name": name, "error": error });
    let ext = extension_of(&name).unwrap_or_default();

    // Spreadsheet support (Excel .xlsx, .xls, .csv, .tsv, .ods)
    if [".xlsx", ".xls", ".csv", ".tsv", ".ods"].contains(&ext.as_str()) {
        return match sheets_of(path, &ext) {
            Ok(sheets) => json!({ "type": "spreadsheet", "sheets": sheets, "size": size, "path": file_path, "name": name }),
            Err(e) => binary(format!("No se pudo interpretar el archivo Excel ({e})")),
        };
    }
    if size > 2 * 1024 * 1024 {
        return binary("El archivo excede los 2MB para previsualización directa.".into());
    }
    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(e) => return json!({ "error": e.to_string() }),
    };
    if bytes.iter().take(1024).any(|b| *b == 0) {
        return binary("Archivo binario. Haz clic en \"Abrir en el sistema\" para verlo.".into());
    }
    json!({ "type": "text", "content": String::from_utf8_lossy(&bytes), "size": size, "path": file_path, "name": name })
}

pub fn inspect_project(dir: &str) -> Value {
    let unknown = json!({ "type": "unknown", "suggestedCommands": [], "hasNeoworkConfig": false });
    let root = Path::new(dir);
    if dir.is_empty() || !root.exists() {
        return unknown;
    }
    let has = |f: &str| root.join(f).exists();
    let mut suggestions: Vec<(String, String)> = vec![];
    let (mut kind, mut name) = ("generic", None);

    if has("package.json") {
        kind = "node";
        if let Some(pkg) = fs::read_to_string(root.join("package.json")).ok().and_then(|r| serde_json::from_str::<Value>(&r).ok()) {
            name = pkg.get("name").and_then(Value::as_str).filter(|n| !n.is_empty()).map(String::from);
            for script in pkg.get("scripts").and_then(Value::as_object).into_iter().flat_map(|s| s.keys()) {
                suggestions.push((format!("npm run {script}"), format!("npm run {script}")));
            }
        }
    }
    if has("Cargo.toml") {
        kind = "rust";
        suggestions.extend(["cargo run", "cargo test", "cargo build"].map(|c| (c.to_string(), c.to_string())));
    }
    if has("requirements.txt") || has("pyproject.toml") {
        kind = "python";
        if has("main.py") {
            suggestions.push(("python main.py".into(), "python main.py".into()));
        }
        suggestions.push(("pytest".into(), "pytest".into()));
    }
    if has("docker-compose.yml") || has("compose.yaml") {
        suggestions.push(("docker compose up".into(), "docker compose up".into()));
    }
    let commands: Vec<Value> = suggestions.into_iter().map(|(label, command)| json!({ "label": label, "command": command })).collect();
    let mut out = json!({ "type": kind, "suggestedCommands": commands, "hasNeoworkConfig": has(".neowork.json") });
    if let Some(n) = name {
        out["name"] = n.into();
    }
    out
}

pub fn read_neowork_config(folder: &str) -> Value {
    fs::read_to_string(Path::new(folder).join(".neowork.json")).ok().and_then(|raw| serde_json::from_str(&raw).ok()).unwrap_or(Value::Null)
}

pub fn write_neowork_config(folder: &str, workspace: &Value) -> bool {
    let body = serde_json::to_string_pretty(workspace).unwrap_or_default();
    fs::write(Path::new(folder).join(".neowork.json"), body).map_err(|e| eprintln!("Error writing .neowork.json: {e}")).is_ok()
}

pub async fn check_port(port: u16) -> bool {
    let connect = tokio::net::TcpStream::connect(("127.0.0.1", port));
    matches!(tokio::time::timeout(Duration::from_millis(600), connect).await, Ok(Ok(_)))
}

static ANSI: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\x1b\[[0-9;]*[a-zA-Z]").unwrap());
static ANSI_ENCODED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"%1[Bb](?:\[[0-9;]*[a-zA-Z])?").unwrap());
static CONTROL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[\x00-\x1F\x7F]").unwrap());
static WRAPPERS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"^['"`(<{\[]+|['"`>)}\]]+$"#).unwrap());
static TRAILING: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[.,;:!?]+$").unwrap());
static ANY_HOST_URL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)^(https?://)0\.0\.0\.0(?::(\d+))?").unwrap());
static ANY_HOST_BARE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)^0\.0\.0\.0(?::(\d+))?").unwrap());
static LOCAL_NO_SCHEME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)^(localhost|127\.0\.0\.1|\[::1\]):\d+").unwrap());
static HAS_SCHEME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[a-zA-Z][a-zA-Z0-9+.-]*://").unwrap());

// Terminal output hands over urls with colour codes, quotes and sentence punctuation stuck to them.
pub fn clean_url(raw: &str) -> String {
    let mut s = raw.trim().to_string();
    if s.is_empty() {
        return s;
    }
    for re in [&*ANSI, &*ANSI_ENCODED, &*CONTROL, &*WRAPPERS, &*TRAILING] {
        s = re.replace_all(&s, "").into_owned();
    }
    let port = |c: &Captures, i| c.get(i).map_or("80", |m| m.as_str()).to_string();
    s = ANY_HOST_URL.replace(&s, |c: &Captures| format!("{}localhost:{}", &c[1], port(c, 2))).into_owned();
    s = ANY_HOST_BARE.replace(&s, |c: &Captures| format!("http://localhost:{}", port(c, 1))).into_owned();
    if LOCAL_NO_SCHEME.is_match(&s) {
        s = format!("http://{s}");
    } else if !HAS_SCHEME.is_match(&s) && s.contains('.') && !s.contains(' ') {
        s = format!("https://{s}");
    }
    s
}

pub fn open_path(target: &str) -> String {
    if target.is_empty() || !Path::new(target).exists() {
        return "File not found".into();
    }
    open::that_detached(target).err().map_or(String::new(), |e| e.to_string())
}

pub fn show_item_in_folder(target: &str) -> bool {
    let path = Path::new(target);
    if target.is_empty() || !path.exists() {
        return false;
    }
    #[cfg(windows)]
    let shown = std::process::Command::new("explorer").arg(format!("/select,{target}")).spawn().is_ok();
    #[cfg(target_os = "macos")]
    let shown = std::process::Command::new("open").args(["-R", target]).spawn().is_ok();
    #[cfg(all(unix, not(target_os = "macos")))]
    let shown = open::that_detached(path.parent().unwrap_or(path)).is_ok();
    shown
}

pub fn open_external(url: &str) -> bool {
    let cleaned = clean_url(url);
    !cleaned.is_empty() && open::that_detached(&cleaned).map_err(|e| eprintln!("[SHELL OPEN EXTERNAL ERROR] {e}")).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_url_strips_noise_and_normalizes_hosts() {
        let cases = [
            ("\x1b[36mhttp://localhost:3000/\x1b[39m", "http://localhost:3000/"),
            ("(https://example.com/docs)", "https://example.com/docs"),
            ("https://example.com/docs.", "https://example.com/docs"),
            ("http://0.0.0.0:8080/app", "http://localhost:8080/app"),
            ("0.0.0.0", "http://localhost:80"),
            ("localhost:5173", "http://localhost:5173"),
            ("example.com/x", "https://example.com/x"),
            ("two words", "two words"),
            ("", ""),
        ];
        for (raw, want) in cases {
            assert_eq!(clean_url(raw), want, "{raw:?}");
        }
    }

    #[test]
    fn lists_directories_first_and_hides_git_and_node_modules() {
        let dir = tempfile::tempdir().unwrap();
        for d in [".git", "node_modules", "zeta"] {
            fs::create_dir(dir.path().join(d)).unwrap();
        }
        fs::write(dir.path().join("b.TXT"), "hi").unwrap();
        fs::write(dir.path().join("a.md"), "x").unwrap();
        let out = list_directory(dir.path().to_str());
        let names: Vec<_> = out["entries"].as_array().unwrap().iter().map(|e| e["name"].as_str().unwrap()).collect();
        assert_eq!(names, ["zeta", "a.md", "b.TXT"]);
        assert_eq!(out["entries"][2]["extension"], ".txt");
        assert!(list_directory(Some("/nonexistent/x"))["entries"].is_array());
    }

    #[test]
    fn reads_text_binary_and_csv() {
        let dir = tempfile::tempdir().unwrap();
        let p = |n: &str| dir.path().join(n).to_string_lossy().into_owned();
        fs::write(p("a.txt"), "hola").unwrap();
        fs::write(p("b.bin"), [1u8, 0, 2]).unwrap();
        fs::write(p("c.csv"), "a,b\n1,2\n").unwrap();
        assert_eq!(read_file(&p("a.txt"))["content"], "hola");
        assert_eq!(read_file(&p("b.bin"))["type"], "binary");
        assert_eq!(read_file(&p("c.csv"))["sheets"][0]["rows"], json!([["a", "b"], ["1", "2"]]));
        assert_eq!(read_file(&p("missing"))["error"], "File not found");
        assert_eq!(read_file(dir.path().to_str().unwrap())["error"], "Path is a directory");
    }

    #[test]
    fn inspects_projects_and_round_trips_the_config() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        fs::write(dir.path().join("package.json"), r#"{"name":"demo","scripts":{"dev":"x","build":"y"}}"#).unwrap();
        fs::write(dir.path().join("Cargo.toml"), "").unwrap();
        let out = inspect_project(root);
        assert_eq!((out["type"].as_str(), out["name"].as_str()), (Some("rust"), Some("demo")));
        assert_eq!(out["suggestedCommands"][0]["command"], "npm run dev");
        assert_eq!(out["hasNeoworkConfig"], false);
        assert_eq!(inspect_project("/nonexistent")["type"], "unknown");

        assert_eq!(read_neowork_config(root), Value::Null);
        assert!(write_neowork_config(root, &json!({ "id": "w" })));
        assert_eq!(read_neowork_config(root), json!({ "id": "w" }));
    }
}
