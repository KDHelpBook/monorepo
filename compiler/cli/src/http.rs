//! An HTTP [`RangeReader`]: reads a remote `.khb` with `Range` requests, so the
//! Range-VFS streams only the pages a query touches. This is the thin, client-side
//! trait impl the core VFS is designed for (see `docs/streaming.md`).

use std::io::Read;
use std::sync::atomic::{AtomicU64, Ordering};

use anyhow::{bail, Context, Result};
use kdhelp_core::RangeReader;

/// Reads bytes from an HTTP(S) URL via `Range` requests. Requires a server that
/// honours ranges (returns `206 Partial Content`) — any static host does.
pub struct HttpRangeReader {
    url: String,
    size: u64,
    bytes_read: AtomicU64,
}

impl HttpRangeReader {
    /// Probe the URL: a `bytes=0-0` request both proves range support and yields the
    /// total size from `Content-Range: bytes 0-0/TOTAL`.
    pub fn open(url: &str) -> Result<Self> {
        let resp = ureq::get(url)
            .set("Range", "bytes=0-0")
            .call()
            .with_context(|| format!("probing {url}"))?;
        if resp.status() != 206 {
            bail!(
                "{url} did not honour Range (status {}); need a server that supports byte ranges",
                resp.status()
            );
        }
        let cr = resp
            .header("Content-Range")
            .context("range response had no Content-Range header")?;
        // Content-Range: bytes 0-0/12345
        let total = cr
            .rsplit('/')
            .next()
            .and_then(|s| s.trim().parse::<u64>().ok())
            .with_context(|| format!("unparseable Content-Range: {cr}"))?;
        Ok(Self {
            url: url.to_string(),
            size: total,
            bytes_read: AtomicU64::new(0),
        })
    }

    /// Total bytes fetched so far — for reporting how little was streamed.
    pub fn bytes_read(&self) -> u64 {
        self.bytes_read.load(Ordering::Relaxed)
    }
}

impl RangeReader for HttpRangeReader {
    fn size(&self) -> u64 {
        self.size
    }

    fn read_at(&self, offset: u64, buf: &mut [u8]) -> Result<()> {
        let end = offset + buf.len() as u64 - 1;
        let resp = ureq::get(&self.url)
            .set("Range", &format!("bytes={offset}-{end}"))
            .call()
            .with_context(|| format!("GET {} bytes={offset}-{end}", self.url))?;
        if resp.status() != 206 {
            bail!("expected 206 for a range request, got {}", resp.status());
        }
        resp.into_reader()
            .read_exact(buf)
            .context("short read from range response")?;
        self.bytes_read
            .fetch_add(buf.len() as u64, Ordering::Relaxed);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::net::TcpListener;
    use std::sync::Arc;

    use kdhelp_core::{build, Docset, RenderedDocset, RenderedPage, TocNode};

    // A minimal HTTP/1.1 server that answers a `Range: bytes=a-b` GET with 206 +
    // the requested slice. One request per connection (Connection: close).
    fn serve_ranges(bytes: Vec<u8>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let mut s = match stream {
                    Ok(s) => s,
                    Err(_) => continue,
                };
                // Read the request head.
                let mut buf = Vec::new();
                let mut byte = [0u8; 1];
                while !buf.ends_with(b"\r\n\r\n") {
                    use std::io::Read as _;
                    if s.read(&mut byte).unwrap_or(0) == 0 {
                        break;
                    }
                    buf.push(byte[0]);
                }
                let req = String::from_utf8_lossy(&buf);
                let range = req
                    .lines()
                    .find_map(|l| l.strip_prefix("Range: bytes="))
                    .unwrap_or("0-");
                let (a, b) = range.split_once('-').unwrap_or(("0", ""));
                let start: usize = a.trim().parse().unwrap_or(0);
                let end: usize = b
                    .trim()
                    .parse()
                    .unwrap_or(bytes.len().saturating_sub(1))
                    .min(bytes.len().saturating_sub(1));
                let slice = &bytes[start..=end];
                let head = format!(
                    "HTTP/1.1 206 Partial Content\r\nAccept-Ranges: bytes\r\n\
                     Content-Range: bytes {start}-{end}/{}\r\nContent-Length: {}\r\n\
                     Connection: close\r\n\r\n",
                    bytes.len(),
                    slice.len()
                );
                let _ = s.write_all(head.as_bytes());
                let _ = s.write_all(slice);
            }
        });
        format!("http://{addr}/db.khb")
    }

    fn demo() -> RenderedDocset {
        let body = format!("<h1>Page</h1><p>{}</p>", "lorem ipsum ".repeat(300));
        let pages: Vec<_> = (0..120)
            .map(|i| RenderedPage {
                id: format!("p{i}"),
                title: format!("Page {i}"),
                body_html: body.clone(),
                plain: "lorem ipsum ".repeat(300),
                keywords: vec![format!("kw{i}")],
                categories: vec![],
                related: vec![],
            })
            .collect();
        let toc = pages
            .iter()
            .map(|p| TocNode {
                page_id: p.id.clone(),
                title: p.title.clone(),
                children: vec![],
            })
            .collect();
        RenderedDocset {
            id: "remote".into(),
            title: "Remote".into(),
            version: "1".into(),
            language: "en".into(),
            collection: "remote".into(),
            collection_title: "Remote".into(),
            pages,
            toc,
            categories: vec![],
            assets: vec![],
        }
    }

    #[test]
    fn streams_a_docset_over_http() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("db.khb");
        build::build_khb(&demo(), &path).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        let total = bytes.len() as u64;
        let url = serve_ranges(bytes);

        let reader = Arc::new(HttpRangeReader::open(&url).unwrap());
        assert_eq!(reader.size(), total);
        let ds = Docset::open_reader(reader.clone()).unwrap();

        // Queries stream over HTTP and match the built docset.
        assert_eq!(ds.id().unwrap(), "remote");
        assert!(ds.page("p50").unwrap().unwrap().body_html.contains("<h1>"));
        assert_eq!(ds.search("kw50", 5).unwrap().len(), 1);

        // Laziness over the wire: only a fraction of the file was fetched.
        assert!(
            reader.bytes_read() < total,
            "streamed {} of {} bytes",
            reader.bytes_read(),
            total
        );
    }
}
