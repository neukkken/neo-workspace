// Replaces electron-updater: checks GitHub Releases, downloads the installer for this OS and
// hands it to the system. Same updater:status events the renderer already listens to.
use futures_util::StreamExt;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{io::Write, path::PathBuf, sync::Mutex, time::Instant};
use tauri::{AppHandle, Emitter};

const LATEST_RELEASE: &str = "https://api.github.com/repos/neukkken/neo-workspace/releases/latest";

#[derive(Clone)]
struct Asset {
    name: String,
    url: String,
    size: u64,
    sha256: Option<String>,
}

pub struct Updater {
    status: Mutex<Value>,
    asset: Mutex<Option<Asset>>,
    installer: Mutex<Option<PathBuf>>,
}

// The installer a release ships for this OS (Tauri and the old electron-builder names both match).
fn pick_asset(assets: &[Value], os: &str) -> Option<Asset> {
    assets
        .iter()
        .find(|a| {
            let name = a["name"].as_str().unwrap_or("").to_lowercase();
            match os {
                "windows" => name.ends_with(".exe") && name.contains("setup"),
                "macos" => name.ends_with(".dmg"),
                _ => name.ends_with(".appimage"),
            }
        })
        .map(|a| Asset {
            name: a["name"].as_str().unwrap_or("installer").to_string(),
            url: a["browser_download_url"].as_str().unwrap_or("").to_string(),
            size: a["size"].as_u64().unwrap_or(0),
            sha256: a["digest"].as_str().and_then(|d| d.strip_prefix("sha256:")).map(str::to_lowercase),
        })
}

fn is_newer(tag: &str, current: &str) -> bool {
    match (semver::Version::parse(tag.trim_start_matches('v')), semver::Version::parse(current)) {
        (Ok(latest), Ok(now)) => latest > now,
        _ => false,
    }
}

impl Updater {
    pub fn new() -> Self {
        Self { status: Mutex::new(json!({ "state": "idle" })), asset: Mutex::default(), installer: Mutex::default() }
    }

    fn send(&self, app: &AppHandle, status: Value) -> Value {
        *self.status.lock().unwrap() = status.clone();
        let _ = app.emit("updater:status", &status);
        status
    }

    pub async fn check(&self, app: &AppHandle) -> Value {
        let current = app.package_info().version.to_string();
        if cfg!(debug_assertions) {
            return self.send(app, json!({ "state": "not-available", "info": { "version": format!("{current} (dev)") } }));
        }
        self.send(app, json!({ "state": "checking" }));
        match self.fetch_latest(&current).await {
            Ok(status) => self.send(app, status),
            Err(e) => {
                eprintln!("[Updater] {e}");
                self.send(app, json!({ "state": "error", "error": e }))
            }
        }
    }

    async fn fetch_latest(&self, current: &str) -> Result<Value, String> {
        let release: Value = reqwest::Client::new()
            .get(LATEST_RELEASE)
            .header("User-Agent", "neowork-updater")
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| e.to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;
        let tag = release["tag_name"].as_str().unwrap_or("");
        if !is_newer(tag, current) {
            return Ok(json!({ "state": "not-available", "info": { "version": current } }));
        }
        let asset = pick_asset(release["assets"].as_array().map_or(&[][..], Vec::as_slice), std::env::consts::OS);
        *self.asset.lock().unwrap() = asset;
        let mut info = json!({ "version": tag.trim_start_matches('v') });
        if let Some(date) = release["published_at"].as_str() {
            info["releaseDate"] = date.into();
        }
        if let Some(notes) = release["body"].as_str().filter(|n| !n.is_empty()) {
            info["releaseNotes"] = notes.into();
        }
        Ok(json!({ "state": "available", "info": info }))
    }

    pub async fn download(&self, app: &AppHandle) -> bool {
        let Some(asset) = self.asset.lock().unwrap().clone() else { return false };
        match self.fetch_installer(app, &asset).await {
            Ok(path) => {
                *self.installer.lock().unwrap() = Some(path);
                let version = self.status.lock().unwrap()["info"]["version"].clone();
                self.send(app, json!({ "state": "downloaded", "info": { "version": version } }));
                true
            }
            Err(e) => {
                eprintln!("[Updater] download failed: {e}");
                self.send(app, json!({ "state": "error", "error": e }));
                false
            }
        }
    }

    async fn fetch_installer(&self, app: &AppHandle, asset: &Asset) -> Result<PathBuf, String> {
        let dir = std::env::temp_dir().join("neowork-update");
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        // The name comes from the release; only its last component may reach the disk.
        let path = dir.join(std::path::Path::new(&asset.name).file_name().ok_or("bad asset name")?);
        let response = reqwest::Client::new()
            .get(&asset.url)
            .header("User-Agent", "neowork-updater")
            .send()
            .await
            .and_then(|r| r.error_for_status())
            .map_err(|e| e.to_string())?;
        let total = response.content_length().unwrap_or(asset.size);
        let mut file = std::fs::File::create(&path).map_err(|e| e.to_string())?;
        let (mut hasher, mut done, started, mut last_sent) = (Sha256::new(), 0u64, Instant::now(), Instant::now());
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| e.to_string())?;
            hasher.update(&chunk);
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            done += chunk.len() as u64;
            if last_sent.elapsed().as_millis() >= 200 {
                last_sent = Instant::now();
                let mb = |b: u64| (b as f64 / 1024.0 / 1024.0 * 10.0).round() / 10.0;
                self.send(app, json!({ "state": "downloading", "progress": {
                    "percent": if total > 0 { done * 100 / total } else { 0 },
                    "transferredMb": mb(done),
                    "totalMb": mb(total),
                    "bytesPerSecond": (done as f64 / started.elapsed().as_secs_f64().max(0.001)).round(),
                }}));
            }
        }
        // shortcut: releases published before GitHub added asset digests have nothing to check against
        let digest: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
        match &asset.sha256 {
            Some(expected) if *expected != digest => {
                let _ = std::fs::remove_file(&path);
                Err("El instalador descargado no coincide con su huella SHA-256".into())
            }
            _ => Ok(path),
        }
    }

    // Hands the installer to the OS and leaves, so it can replace this app.
    pub fn quit_and_install(&self, app: &AppHandle) {
        if cfg!(debug_assertions) {
            return;
        }
        let Some(path) = self.installer.lock().unwrap().clone() else { return };
        #[cfg(unix)]
        if path.extension().is_some_and(|e| e.eq_ignore_ascii_case("appimage")) {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755));
            if std::process::Command::new(&path).spawn().is_ok() {
                app.exit(0);
            }
            return;
        }
        if open::that_detached(&path).is_ok() {
            app.exit(0);
        }
    }

    pub fn check_on_startup(self: &std::sync::Arc<Self>, app: AppHandle) {
        if cfg!(debug_assertions) {
            return;
        }
        let me = self.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            me.check(&app).await;
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_higher_version_is_an_update() {
        assert!(is_newer("v1.11.0", "1.10.0"));
        assert!(!is_newer("v1.10.0", "1.10.0"));
        assert!(!is_newer("v1.9.9", "1.10.0"));
        assert!(!is_newer("nightly", "1.10.0"));
    }

    #[test]
    fn picks_the_installer_for_the_os_and_reads_its_digest() {
        let assets: Vec<Value> = serde_json::from_value(json!([
            { "name": "latest.yml", "browser_download_url": "u0" },
            { "name": "NeoWork_1.11.0_amd64.deb", "browser_download_url": "u1" },
            { "name": "NeoWork_1.11.0_amd64.AppImage", "browser_download_url": "u2", "size": 9, "digest": "sha256:ABC" },
            { "name": "NeoWork_1.11.0_x64-setup.exe", "browser_download_url": "u3" }
        ]))
        .unwrap();
        let linux = pick_asset(&assets, "linux").unwrap();
        assert_eq!((linux.url.as_str(), linux.sha256.as_deref()), ("u2", Some("abc")));
        assert_eq!(pick_asset(&assets, "windows").unwrap().url, "u3");
        assert!(pick_asset(&assets, "macos").is_none());
    }
}
