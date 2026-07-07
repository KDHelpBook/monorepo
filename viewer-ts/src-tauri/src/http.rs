//! An HTTP [`RangeReader`] so the desktop app streams a **remote** `.khb` page-by-page
//! over `Range` requests (the native counterpart of the browser's wa-sqlite streaming).
//! A near-verbatim copy of `compiler/cli/src/http.rs` — kept local so `khb-core` stays
//! HTTP-free; could later be unified into core behind an optional `http` feature.

use std::io::Read;

use anyhow::{bail, Context, Result};
use khb_core::RangeReader;

/// Reads bytes from an HTTP(S) URL via `Range` requests. Requires a server that honours
/// ranges (returns `206 Partial Content`) — any static host does.
pub struct HttpRangeReader {
    url: String,
    size: u64,
}

impl HttpRangeReader {
    /// Probe the URL: a `bytes=0-0` request proves range support and yields the total
    /// size from `Content-Range: bytes 0-0/TOTAL`.
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
        let total = cr
            .rsplit('/')
            .next()
            .and_then(|s| s.trim().parse::<u64>().ok())
            .with_context(|| format!("unparseable Content-Range: {cr}"))?;
        Ok(Self {
            url: url.to_string(),
            size: total,
        })
    }
}

/// Download a whole file over HTTP (no Range) — the fallback for a host that doesn't
/// honour `Range`. Native, so no CORS applies (unlike a browser `fetch`).
pub fn fetch_all(url: &str) -> Result<Vec<u8>> {
    let resp = ureq::get(url)
        .call()
        .with_context(|| format!("fetching {url}"))?;
    let mut bytes = Vec::new();
    resp.into_reader()
        .read_to_end(&mut bytes)
        .with_context(|| format!("reading {url}"))?;
    Ok(bytes)
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
        Ok(())
    }
}
