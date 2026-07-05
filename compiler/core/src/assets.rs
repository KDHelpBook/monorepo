//! Binary attachments (images and downloadable files).
//!
//! Authors drop files under `assets/` in a source directory and reference them from
//! Markdown as `![alt](assets/x.png)` or `[file](assets/y.zip)`. The compiler stores
//! the bytes in a SQLite container — either embedded in the `.khb` or in a sidecar
//! `.khba` — and rewrites the rendered HTML so those URLs become `asset:<path>`,
//! which the viewer resolves to a blob URL at load time.

/// The prefix authored asset links use (a folder under the source directory).
pub const ASSETS_DIR: &str = "assets";

/// The URL scheme rewritten into the stored HTML and resolved by the viewer.
pub const ASSET_SCHEME: &str = "asset:";

/// Best-effort MIME type from a path's extension. Falls back to
/// `application/octet-stream` (which the viewer treats as a download).
pub fn guess_mime(path: &str) -> &'static str {
    let ext = path
        .rsplit('.')
        .next()
        .filter(|e| !e.contains('/'))
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "bmp" => "image/bmp",
        "pdf" => "application/pdf",
        "zip" => "application/zip",
        "json" => "application/json",
        "txt" | "md" => "text/plain",
        "csv" => "text/csv",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        _ => "application/octet-stream",
    }
}

/// Normalise a docset-relative asset path: strip a leading `./` or `/` so
/// `./assets/x` and `/assets/x` and `assets/x` all key the same stored asset.
pub fn normalize_path(path: &str) -> String {
    path.trim_start_matches("./")
        .trim_start_matches('/')
        .to_string()
}

/// Rewrite `src`/`href` attribute values that point under `assets/` into
/// `asset:<normalized-path>`. Handles `assets/…`, `./assets/…` and `/assets/…`
/// with either quote style. Everything else (external URLs, `#anchor` links) is
/// left untouched.
pub fn rewrite_asset_urls(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let bytes = html.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if let Some(after_attr) = attr_at(html, i) {
            // `after_attr` is the index just past `src="` / `href="` (or `'`).
            let quote = bytes[after_attr - 1] as char;
            if let Some(end) = html[after_attr..].find(quote) {
                let value = &html[after_attr..after_attr + end];
                out.push_str(&html[i..after_attr]);
                if is_asset_ref(value) {
                    out.push_str(ASSET_SCHEME);
                    out.push_str(&normalize_path(value));
                } else {
                    out.push_str(value);
                }
                i = after_attr + end;
                continue;
            }
        }
        // Copy this byte through, staying on char boundaries.
        let ch_len = utf8_len(bytes[i]);
        out.push_str(&html[i..i + ch_len]);
        i += ch_len;
    }
    out
}

/// If `src="`/`href="`/`src='`/`href='` begins at `i`, return the index just after
/// the opening quote.
fn attr_at(html: &str, i: usize) -> Option<usize> {
    for name in ["src", "href"] {
        for quote in ['"', '\''] {
            let token = format!("{name}={quote}");
            if html[i..].starts_with(&token) {
                return Some(i + token.len());
            }
        }
    }
    None
}

fn is_asset_ref(value: &str) -> bool {
    let v = value.trim_start_matches("./").trim_start_matches('/');
    v.starts_with("assets/") && v.len() > "assets/".len()
}

fn utf8_len(first: u8) -> usize {
    match first {
        b if b < 0x80 => 1,
        b if b >> 5 == 0b110 => 2,
        b if b >> 4 == 0b1110 => 3,
        _ => 4,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrites_only_asset_refs() {
        let html = r##"<img src="assets/a.png"><a href="./assets/b.zip">b</a>
<a href="https://x/assets/c">ext</a><a href="#anchor">a</a>"##;
        let out = rewrite_asset_urls(html);
        assert!(out.contains(r#"src="asset:assets/a.png""#));
        assert!(out.contains(r#"href="asset:assets/b.zip""#));
        assert!(out.contains(r#"href="https://x/assets/c""#));
        assert!(out.contains(r##"href="#anchor""##));
    }

    #[test]
    fn mime_by_extension() {
        assert_eq!(guess_mime("assets/x.svg"), "image/svg+xml");
        assert_eq!(guess_mime("assets/x.PNG"), "image/png");
        assert_eq!(guess_mime("assets/data.bin"), "application/octet-stream");
    }
}
