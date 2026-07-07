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
/// `./assets/x` and `/assets/x` and `assets/x` all key the same stored asset,
/// and drop any `#fragment` — fragments carry author hints (see
/// [`apply_image_size_hints`]), never part of the stored path.
pub fn normalize_path(path: &str) -> String {
    let path = path.split('#').next().unwrap_or(path);
    path.trim_start_matches("./")
        .trim_start_matches('/')
        .to_string()
}

/// Turn a `#w=…` size hint on an asset image into an inline `max-width`, so the
/// author controls how large an image *displays* without touching the file:
/// `![alt](assets/big.png#w=300)` caps it at 300 px, `#w=50%` at half the column.
/// `min(…, 100%)` keeps a pixel cap from overflowing narrow viewports, and the
/// stylesheet's `height: auto` preserves the aspect ratio. The fragment is
/// stripped from `src` either way (unknown hints are dropped); the hint only
/// affects display — the lightbox still opens the full-size image.
pub fn apply_image_size_hints(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut rest = html;
    while let Some(tag_start) = rest.find("<img ") {
        let Some(tag_len) = rest[tag_start..].find('>') else {
            break;
        };
        out.push_str(&rest[..tag_start]);
        let tag = &rest[tag_start..tag_start + tag_len + 1];
        out.push_str(&sized_img_tag(tag).unwrap_or_else(|| tag.to_string()));
        rest = &rest[tag_start + tag_len + 1..];
    }
    out.push_str(rest);
    out
}

/// Rewrite one `<img …>` tag whose asset `src` carries a `#…` fragment: strip the
/// fragment and, for a valid `w=` hint, inject the `max-width` style. `None` when
/// the tag needs no change.
fn sized_img_tag(tag: &str) -> Option<String> {
    for quote in ['"', '\''] {
        let token = format!("src={quote}");
        let Some(v_start) = tag.find(&token).map(|i| i + token.len()) else {
            continue;
        };
        let v_end = v_start + tag[v_start..].find(quote)?;
        let value = &tag[v_start..v_end];
        if !is_asset_ref(value) || !value.contains('#') {
            return None;
        }
        let (path, fragment) = value.split_once('#').unwrap();
        let style = fragment.split('&').find_map(|hint| {
            let w = hint.strip_prefix("w=")?;
            // The Markdown renderer percent-encodes `%` in URLs, so `#w=50%`
            // arrives as `#w=50%25`.
            let (digits, unit) = match w.strip_suffix('%').or(w.strip_suffix("%25")) {
                Some(d) => (d, "%"),
                None => (w, "px"),
            };
            if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
                return None;
            }
            Some(match unit {
                "%" => format!("max-width:{digits}%"),
                _ => format!("max-width:min({digits}px,100%)"),
            })
        });
        let mut rebuilt = String::with_capacity(tag.len());
        rebuilt.push_str("<img ");
        if let Some(style) = style {
            rebuilt.push_str(&format!("style={quote}{style}{quote} "));
        }
        rebuilt.push_str(&tag["<img ".len()..v_start]);
        rebuilt.push_str(path);
        rebuilt.push_str(&tag[v_end..]);
        return Some(rebuilt);
    }
    None
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
    fn image_size_hints_become_max_width() {
        // Pixel cap: min(px, 100%) so it can't overflow a narrow viewport.
        let out = apply_image_size_hints(r#"<p><img src="assets/big.png#w=300" alt="x"></p>"#);
        assert_eq!(
            out,
            r#"<p><img style="max-width:min(300px,100%)" src="assets/big.png" alt="x"></p>"#
        );
        // Percent of the column — plain, and percent-encoded as the Markdown
        // renderer emits it (`%` → `%25`).
        let out = apply_image_size_hints(r#"<img src="assets/a.png#w=50%">"#);
        assert_eq!(out, r#"<img style="max-width:50%" src="assets/a.png">"#);
        let out = apply_image_size_hints(r#"<img src="assets/a.png#w=50%25">"#);
        assert_eq!(out, r#"<img style="max-width:50%" src="assets/a.png">"#);
        // Unknown hints are dropped with the fragment; no style appears.
        let out = apply_image_size_hints(r#"<img src="assets/a.png#zoom=2">"#);
        assert_eq!(out, r#"<img src="assets/a.png">"#);
        // Non-asset images and fragment-free tags pass through untouched.
        let html = r#"<img src="https://x/p.png#w=1"><img src="assets/a.png">"#;
        assert_eq!(apply_image_size_hints(html), html);
    }

    #[test]
    fn normalize_drops_fragments() {
        // A stray fragment on a download link must not break asset lookup.
        assert_eq!(normalize_path("assets/a.zip#w=3"), "assets/a.zip");
        let out = rewrite_asset_urls(r#"<a href="assets/b.zip#x">b</a>"#);
        assert!(out.contains(r#"href="asset:assets/b.zip""#));
    }

    #[test]
    fn mime_by_extension() {
        assert_eq!(guess_mime("assets/x.svg"), "image/svg+xml");
        assert_eq!(guess_mime("assets/x.PNG"), "image/png");
        assert_eq!(guess_mime("assets/data.bin"), "application/octet-stream");
    }
}
