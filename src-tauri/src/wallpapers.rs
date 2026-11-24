// Port of src/main/wallpapers.ts.
use std::{fs, path::PathBuf, time::SystemTime};

pub const MAX_WALLPAPER_BYTES: usize = 40 * 1024 * 1024;

// `<uuid>.<ext>`: only ids minted here resolve, so a crafted id can't escape the folder.
fn valid_id(id: &str) -> bool {
    let Some((stem, ext)) = id.rsplit_once('.') else { return false };
    stem.len() == 36 && stem.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase() || c == '-') && matches!(ext, "jpg" | "png" | "webp" | "gif" | "bmp")
}

// Trust the file's bytes, not its extension.
fn detect_extension(b: &[u8]) -> Option<&'static str> {
    if b.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("jpg")
    } else if b.starts_with(&[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) {
        Some("png")
    } else if b.len() >= 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        Some("webp")
    } else if b.starts_with(b"GIF8") {
        Some("gif")
    } else if b.starts_with(b"BM") {
        Some("bmp")
    } else {
        None
    }
}

pub fn content_type(id: &str) -> &'static str {
    match id.rsplit('.').next() {
        Some("jpg") => "image/jpeg",
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("bmp") => "image/bmp",
        _ => "application/octet-stream",
    }
}

pub struct WallpaperStore {
    dir: PathBuf,
}

impl WallpaperStore {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    pub fn list(&self) -> Vec<String> {
        let Ok(entries) = fs::read_dir(&self.dir) else { return vec![] };
        let mut found: Vec<(SystemTime, String)> = entries
            .flatten()
            .filter_map(|e| {
                let name = e.file_name().to_string_lossy().into_owned();
                valid_id(&name).then(|| (e.metadata().and_then(|m| m.modified()).unwrap_or(SystemTime::UNIX_EPOCH), name))
            })
            .collect();
        found.sort();
        found.into_iter().map(|(_, n)| n).collect()
    }

    pub fn import_bytes(&self, bytes: &[u8]) -> Option<String> {
        if bytes.is_empty() || bytes.len() > MAX_WALLPAPER_BYTES {
            return None;
        }
        let ext = detect_extension(bytes)?;
        fs::create_dir_all(&self.dir).ok()?;
        let id = format!("{}.{ext}", uuid::Uuid::new_v4());
        fs::write(self.dir.join(&id), bytes).ok()?;
        Some(id)
    }

    pub fn import_file(&self, path: &str) -> Option<String> {
        if fs::metadata(path).ok()?.len() as usize > MAX_WALLPAPER_BYTES {
            return None;
        }
        self.import_bytes(&fs::read(path).ok()?)
    }

    pub fn resolve(&self, id: &str) -> Option<PathBuf> {
        let file = self.dir.join(id);
        (valid_id(id) && file.exists()).then_some(file)
    }

    pub fn remove(&self, id: &str) -> bool {
        self.resolve(id).is_some_and(|f| fs::remove_file(f).is_ok())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const JPEG: [u8; 7] = [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3];
    fn store() -> (tempfile::TempDir, WallpaperStore) {
        let dir = tempfile::tempdir().unwrap();
        let s = WallpaperStore::new(dir.path().join("wallpapers"));
        (dir, s)
    }

    #[test]
    fn imports_by_content_and_lists_what_it_stored() {
        let (_d, s) = store();
        let id = s.import_bytes(&JPEG).unwrap();
        assert!(id.ends_with(".jpg"));
        assert_eq!(s.list(), [id.clone()]);
        assert!(s.resolve(&id).is_some());
    }

    #[test]
    fn rejects_non_images_empty_and_oversized_files() {
        let (d, s) = store();
        assert!(s.import_bytes(b"<script>alert(1)</script>").is_none());
        assert!(s.import_bytes(b"").is_none());
        let mut big = JPEG.to_vec();
        big.resize(MAX_WALLPAPER_BYTES + 1, 0);
        assert!(s.import_bytes(&big).is_none());
        let fake = d.path().join("fake.jpg");
        fs::write(&fake, "not an image").unwrap();
        assert!(s.import_file(fake.to_str().unwrap()).is_none());
        assert!(s.import_file("/does/not/exist.jpg").is_none());
    }

    #[test]
    fn ids_cannot_escape_the_wallpaper_folder() {
        let (_d, s) = store();
        s.import_bytes(&JPEG).unwrap();
        for id in ["../neo-workspaces.json", "..\\neo-workspaces.json", "../../secret.jpg", ""] {
            assert!(s.resolve(id).is_none());
            assert!(!s.remove(id));
        }
    }

    #[test]
    fn remove_deletes_the_file() {
        let (_d, s) = store();
        let id = s.import_bytes(&JPEG).unwrap();
        assert!(s.remove(&id));
        assert!(s.list().is_empty());
    }
}
