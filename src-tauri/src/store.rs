// Port of src/main/store.ts. The state stays a serde_json::Value so fields this
// build doesn't know about survive a load/save round trip (same as the JS version).
use serde_json::{json, Value};
use std::{fs, path::Path};

pub fn default_state() -> Value {
    json!({ "activeWorkspaceId": "", "settings": { "sidebarPosition": "right" }, "workspaces": [] })
}

pub fn load(path: &Path) -> Value {
    match fs::read_to_string(path).ok().and_then(|raw| serde_json::from_str::<Value>(&raw).ok()) {
        Some(state) if state.get("workspaces").is_some_and(Value::is_array) => state,
        _ => default_state(),
    }
}

pub fn save(path: &Path, state: &Value) -> bool {
    write_atomic(path, &serde_json::to_string_pretty(state).unwrap_or_default())
}

// Write then swap, so a crash mid-save can't leave a truncated file.
pub fn write_atomic(path: &Path, contents: &str) -> bool {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = Path::new(&tmp);
    fs::write(tmp, contents).and_then(|_| fs::rename(tmp, path)).map_err(|e| eprintln!("Failed to save {}: {e}", path.display())).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_or_damaged_file_gives_the_default() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("neo-workspaces.json");
        assert_eq!(load(&path), default_state());
        fs::write(&path, "{ not json").unwrap();
        assert_eq!(load(&path), default_state());
        fs::write(&path, r#"{"workspaces": 3}"#).unwrap();
        assert_eq!(load(&path), default_state());
    }

    #[test]
    fn round_trip_keeps_unknown_fields_and_leaves_no_tmp() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("neo-workspaces.json");
        let state = json!({ "activeWorkspaceId": "a", "workspaces": [{ "id": "a", "extra": 1 }], "future": true });
        assert!(save(&path, &state));
        assert_eq!(load(&path), state);
        assert!(!dir.path().join("neo-workspaces.json.tmp").exists());
    }
}
