// Port of the clipboard:* handlers: text, plus images saved to disk so CLI agents get a path.
use serde_json::{json, Value};
use std::{fs, path::Path};

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        let hex = b.get(i + 1..i + 3).and_then(|h| std::str::from_utf8(h).ok()).and_then(|h| u8::from_str_radix(h, 16).ok());
        match (b[i], hex) {
            (b'%', Some(byte)) => {
                out.push(byte);
                i += 3;
            }
            (c, _) => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn is_image(path: &str) -> bool {
    let lower = path.to_lowercase();
    ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp"].iter().any(|e| lower.ends_with(&format!(".{e}")))
}

// file:///C:/x -> C:/x on Windows, file:///home/x -> /home/x elsewhere.
fn file_uri_path(uri: &str) -> String {
    let rest = uri.trim_start_matches("file://");
    let rest = rest.strip_prefix("localhost").unwrap_or(rest);
    let path = percent_decode(rest);
    let bytes = path.as_bytes();
    if bytes.len() > 2 && bytes[0] == b'/' && bytes[2] == b':' && bytes[1].is_ascii_alphabetic() {
        path[1..].to_string()
    } else {
        path
    }
}

pub fn write_text(text: &str) -> bool {
    arboard::Clipboard::new().and_then(|mut c| c.set_text(text.to_string())).is_ok()
}

pub fn read_text() -> String {
    arboard::Clipboard::new().and_then(|mut c| c.get_text()).unwrap_or_default()
}

fn save_image(img: arboard::ImageData) -> Option<Value> {
    let dir = std::env::temp_dir().join("neowork-clipboard");
    fs::create_dir_all(&dir).ok()?;
    let ms = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).ok()?.as_millis();
    let path = dir.join(format!("agent-img-{ms}.png"));
    let (w, h) = (img.width as u32, img.height as u32);
    image::RgbaImage::from_raw(w, h, img.bytes.into_owned())?.save(&path).ok()?;
    let (path_str, size) = (path.to_string_lossy().into_owned(), fs::metadata(&path).ok()?.len());
    Some(json!({ "type": "image", "path": path_str, "text": path_str, "width": w, "height": h, "sizeBytes": size }))
}

// Image first, then a file:// uri pointing at a file, then plain text.
pub fn read_smart() -> Value {
    let Ok(mut clipboard) = arboard::Clipboard::new() else { return json!({ "type": "empty", "text": "" }) };
    if let Some(saved) = clipboard.get_image().ok().and_then(save_image) {
        return saved;
    }
    let text = clipboard.get_text().unwrap_or_default();
    if text.is_empty() {
        return json!({ "type": "empty", "text": "" });
    }
    let trimmed = text.trim();
    if trimmed.starts_with("file://") {
        let path = file_uri_path(trimmed);
        if Path::new(&path).exists() {
            let kind = if is_image(&path) { "image" } else { "file" };
            return json!({ "type": kind, "path": path, "text": path });
        }
    }
    json!({ "type": "text", "text": text })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_file_uris() {
        assert_eq!(file_uri_path("file:///home/a%20b/c.png"), "/home/a b/c.png");
        assert_eq!(file_uri_path("file:///C:/Users/x%C3%B1.txt"), "C:/Users/xñ.txt");
        assert_eq!(percent_decode("100%"), "100%");
        assert!(is_image("/x/A.PNG") && !is_image("/x/a.txt"));
    }
}
