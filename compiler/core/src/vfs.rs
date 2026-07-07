//! A read-only SQLite VFS that serves a `.khb` through a **byte-range reader**, so
//! only the pages a query touches are fetched — the native basis for streaming a
//! remote docset over HTTP (see `docs/streaming.md`).
//!
//! It is written directly against `rusqlite::ffi` (the crate's own bundled SQLite),
//! so the VFS registers on the *same* SQLite instance the rest of the engine uses —
//! avoiding the "two SQLite libraries" pitfall. The database is treated as
//! **immutable and read-only**: writes/locks are no-ops, and the device reports
//! `IMMUTABLE`, so SQLite never wants a journal or WAL.

use std::collections::HashMap;
use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, Once, OnceLock};

use anyhow::{Context, Result};
use rusqlite::ffi;

use crate::docset::Docset;

/// Reads bytes at arbitrary offsets from an immutable `.khb` — over the network
/// (HTTP `Range`) or from a local file. Called repeatedly; the VFS coalesces reads
/// into aligned blocks and caches them, so an implementation only needs positioned
/// reads.
pub trait RangeReader: Send + Sync {
    /// Total size of the file, in bytes.
    fn size(&self) -> u64;
    /// Fill `buf` completely with bytes starting at `offset` (always within `size`).
    fn read_at(&self, offset: u64, buf: &mut [u8]) -> Result<()>;
}

/// The registered VFS name.
pub const VFS_NAME: &str = "khb-range";
/// Fetch/cache granularity — reads are coalesced to this many bytes.
const BLOCK: u64 = 65536;

fn registry() -> &'static Mutex<HashMap<String, Arc<dyn RangeReader>>> {
    static R: OnceLock<Mutex<HashMap<String, Arc<dyn RangeReader>>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(HashMap::new()))
}
static COUNTER: AtomicU64 = AtomicU64::new(0);

/// Register a reader and return a unique db name to open with [`VFS_NAME`]; the VFS
/// is installed on first use. [`Docset::open_reader`] wraps this.
pub fn register(reader: Arc<dyn RangeReader>) -> String {
    ensure_vfs();
    let name = format!("khb-range-{}", COUNTER.fetch_add(1, Ordering::Relaxed));
    registry().lock().unwrap().insert(name.clone(), reader);
    name
}

/// Drop a reader registration once its connection is open (the open file keeps its
/// own `Arc`).
pub fn unregister(name: &str) {
    registry().lock().unwrap().remove(name);
}

impl Docset {
    /// Open a docset read-only through the Range-VFS, backed by `reader` — so queries
    /// stream only the pages they touch instead of loading the whole file.
    pub fn open_reader(reader: Arc<dyn RangeReader>) -> Result<Docset> {
        let name = register(reader);
        let result = rusqlite::Connection::open_with_flags_and_vfs(
            Path::new(&name),
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
            VFS_NAME,
        );
        unregister(&name);
        Ok(Docset::from_conn(
            result.context("opening streamed docset")?,
        ))
    }
}

// ---------------------------------------------------------------------------
// Per-open file state
// ---------------------------------------------------------------------------

struct FileState {
    reader: Arc<dyn RangeReader>,
    size: u64,
    cache: HashMap<u64, Vec<u8>>,
}

impl FileState {
    fn ensure_block(&mut self, idx: u64) -> Result<()> {
        if !self.cache.contains_key(&idx) {
            let start = idx * BLOCK;
            let len = BLOCK.min(self.size - start) as usize;
            let mut b = vec![0u8; len];
            self.reader.read_at(start, &mut b)?;
            self.cache.insert(idx, b);
        }
        Ok(())
    }

    /// Fill `buf` from `offset`, returning how many bytes came from the file (the
    /// caller zero-fills any short tail).
    fn read(&mut self, offset: u64, buf: &mut [u8]) -> Result<usize> {
        let mut done = 0usize;
        while done < buf.len() {
            let pos = offset + done as u64;
            if pos >= self.size {
                break;
            }
            let idx = pos / BLOCK;
            let within = (pos % BLOCK) as usize;
            self.ensure_block(idx)?;
            let block = &self.cache[&idx];
            let n = (block.len() - within).min(buf.len() - done);
            buf[done..done + n].copy_from_slice(&block[within..within + n]);
            done += n;
        }
        Ok(done)
    }
}

#[repr(C)]
struct VfsFile {
    base: ffi::sqlite3_file,
    state: *mut FileState,
}

// ---------------------------------------------------------------------------
// io_methods (per-file operations)
// ---------------------------------------------------------------------------

static IO_METHODS: ffi::sqlite3_io_methods = ffi::sqlite3_io_methods {
    iVersion: 1,
    xClose: Some(x_close),
    xRead: Some(x_read),
    xWrite: Some(x_write),
    xTruncate: Some(x_truncate),
    xSync: Some(x_sync),
    xFileSize: Some(x_file_size),
    xLock: Some(x_lock_ok),
    xUnlock: Some(x_lock_ok),
    xCheckReservedLock: Some(x_check_reserved),
    xFileControl: Some(x_file_control),
    xSectorSize: Some(x_sector_size),
    xDeviceCharacteristics: Some(x_device_characteristics),
    xShmMap: None,
    xShmLock: None,
    xShmBarrier: None,
    xShmUnmap: None,
    xFetch: None,
    xUnfetch: None,
};

unsafe extern "C" fn x_close(f: *mut ffi::sqlite3_file) -> c_int {
    let vf = f as *mut VfsFile;
    if !(*vf).state.is_null() {
        drop(Box::from_raw((*vf).state));
        (*vf).state = std::ptr::null_mut();
    }
    ffi::SQLITE_OK
}

unsafe extern "C" fn x_read(
    f: *mut ffi::sqlite3_file,
    buf: *mut c_void,
    amt: c_int,
    off: ffi::sqlite3_int64,
) -> c_int {
    let st = &mut *(*(f as *mut VfsFile)).state;
    let out = std::slice::from_raw_parts_mut(buf as *mut u8, amt as usize);
    match st.read(off as u64, out) {
        Ok(n) if n == out.len() => ffi::SQLITE_OK,
        Ok(n) => {
            out[n..].fill(0);
            ffi::SQLITE_IOERR_SHORT_READ
        }
        Err(_) => ffi::SQLITE_IOERR_READ,
    }
}

unsafe extern "C" fn x_write(
    _f: *mut ffi::sqlite3_file,
    _buf: *const c_void,
    _amt: c_int,
    _off: ffi::sqlite3_int64,
) -> c_int {
    ffi::SQLITE_READONLY
}

unsafe extern "C" fn x_truncate(_f: *mut ffi::sqlite3_file, _size: ffi::sqlite3_int64) -> c_int {
    ffi::SQLITE_READONLY
}

unsafe extern "C" fn x_sync(_f: *mut ffi::sqlite3_file, _flags: c_int) -> c_int {
    ffi::SQLITE_OK
}

unsafe extern "C" fn x_file_size(
    f: *mut ffi::sqlite3_file,
    p_size: *mut ffi::sqlite3_int64,
) -> c_int {
    *p_size = (*(*(f as *mut VfsFile)).state).size as ffi::sqlite3_int64;
    ffi::SQLITE_OK
}

unsafe extern "C" fn x_lock_ok(_f: *mut ffi::sqlite3_file, _lock: c_int) -> c_int {
    ffi::SQLITE_OK
}

unsafe extern "C" fn x_check_reserved(_f: *mut ffi::sqlite3_file, p_res_out: *mut c_int) -> c_int {
    *p_res_out = 0;
    ffi::SQLITE_OK
}

unsafe extern "C" fn x_file_control(
    _f: *mut ffi::sqlite3_file,
    _op: c_int,
    _arg: *mut c_void,
) -> c_int {
    ffi::SQLITE_NOTFOUND
}

unsafe extern "C" fn x_sector_size(_f: *mut ffi::sqlite3_file) -> c_int {
    4096
}

unsafe extern "C" fn x_device_characteristics(_f: *mut ffi::sqlite3_file) -> c_int {
    ffi::SQLITE_IOCAP_IMMUTABLE
}

// ---------------------------------------------------------------------------
// vfs methods
// ---------------------------------------------------------------------------

unsafe extern "C" fn x_open(
    _vfs: *mut ffi::sqlite3_vfs,
    z_name: ffi::sqlite3_filename,
    file: *mut ffi::sqlite3_file,
    _flags: c_int,
    p_out_flags: *mut c_int,
) -> c_int {
    if z_name.is_null() {
        return ffi::SQLITE_CANTOPEN;
    }
    let name = CStr::from_ptr(z_name).to_string_lossy().into_owned();
    let reader = match registry().lock().unwrap().get(&name) {
        Some(r) => r.clone(),
        None => return ffi::SQLITE_CANTOPEN,
    };
    let size = reader.size();
    let state = Box::into_raw(Box::new(FileState {
        reader,
        size,
        cache: HashMap::new(),
    }));
    let vf = file as *mut VfsFile;
    (*vf).base.pMethods = &IO_METHODS;
    (*vf).state = state;
    if !p_out_flags.is_null() {
        *p_out_flags = ffi::SQLITE_OPEN_READONLY;
    }
    ffi::SQLITE_OK
}

unsafe extern "C" fn x_delete(
    _vfs: *mut ffi::sqlite3_vfs,
    _z_name: *const c_char,
    _sync_dir: c_int,
) -> c_int {
    ffi::SQLITE_OK
}

unsafe extern "C" fn x_access(
    _vfs: *mut ffi::sqlite3_vfs,
    _z_name: *const c_char,
    _flags: c_int,
    p_res_out: *mut c_int,
) -> c_int {
    *p_res_out = 0; // nothing (journal/wal) exists — immutable db
    ffi::SQLITE_OK
}

unsafe extern "C" fn x_full_pathname(
    _vfs: *mut ffi::sqlite3_vfs,
    z_name: *const c_char,
    n_out: c_int,
    z_out: *mut c_char,
) -> c_int {
    let with_nul = CStr::from_ptr(z_name).to_bytes_with_nul();
    if with_nul.len() > n_out as usize {
        return ffi::SQLITE_CANTOPEN;
    }
    std::ptr::copy_nonoverlapping(z_name, z_out, with_nul.len());
    ffi::SQLITE_OK
}

unsafe extern "C" fn x_randomness(
    _vfs: *mut ffi::sqlite3_vfs,
    n_byte: c_int,
    z_out: *mut c_char,
) -> c_int {
    std::ptr::write_bytes(z_out, 0, n_byte as usize);
    n_byte
}

unsafe extern "C" fn x_sleep(_vfs: *mut ffi::sqlite3_vfs, microseconds: c_int) -> c_int {
    microseconds
}

unsafe extern "C" fn x_current_time(_vfs: *mut ffi::sqlite3_vfs, p_now: *mut f64) -> c_int {
    *p_now = 2_451_545.0; // J2000; time is irrelevant for a read-only db
    ffi::SQLITE_OK
}

unsafe extern "C" fn x_get_last_error(
    _vfs: *mut ffi::sqlite3_vfs,
    _n: c_int,
    _out: *mut c_char,
) -> c_int {
    ffi::SQLITE_OK
}

fn ensure_vfs() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| unsafe {
        let name = CString::new(VFS_NAME).expect("vfs name has no nul");
        let vfs = Box::new(ffi::sqlite3_vfs {
            iVersion: 1,
            szOsFile: std::mem::size_of::<VfsFile>() as c_int,
            mxPathname: 512,
            pNext: std::ptr::null_mut(),
            zName: name.as_ptr(),
            pAppData: std::ptr::null_mut(),
            xOpen: Some(x_open),
            xDelete: Some(x_delete),
            xAccess: Some(x_access),
            xFullPathname: Some(x_full_pathname),
            xDlOpen: None,
            xDlError: None,
            xDlSym: None,
            xDlClose: None,
            xRandomness: Some(x_randomness),
            xSleep: Some(x_sleep),
            xCurrentTime: Some(x_current_time),
            xGetLastError: Some(x_get_last_error),
            xCurrentTimeInt64: None,
            xSetSystemCall: None,
            xGetSystemCall: None,
            xNextSystemCall: None,
        });
        std::mem::forget(name); // keep zName valid for the process lifetime
        ffi::sqlite3_vfs_register(Box::into_raw(vfs), 0);
    });
}

// ---------------------------------------------------------------------------
// A local-file reader — for tests and local streaming.
// ---------------------------------------------------------------------------

/// A [`RangeReader`] over a local file: positioned reads with a byte counter, so a
/// test can prove only the touched pages are fetched.
pub struct FileRangeReader {
    file: Mutex<std::fs::File>,
    size: u64,
    bytes_read: AtomicU64,
}

impl FileRangeReader {
    pub fn open(path: &Path) -> Result<Self> {
        let file =
            std::fs::File::open(path).with_context(|| format!("opening {}", path.display()))?;
        let size = file.metadata()?.len();
        Ok(Self {
            file: Mutex::new(file),
            size,
            bytes_read: AtomicU64::new(0),
        })
    }
    /// Total bytes served so far (across all reads).
    pub fn bytes_read(&self) -> u64 {
        self.bytes_read.load(Ordering::Relaxed)
    }
}

impl RangeReader for FileRangeReader {
    fn size(&self) -> u64 {
        self.size
    }
    fn read_at(&self, offset: u64, buf: &mut [u8]) -> Result<()> {
        use std::io::{Read, Seek, SeekFrom};
        let mut f = self.file.lock().unwrap();
        f.seek(SeekFrom::Start(offset))?;
        f.read_exact(buf)?;
        self.bytes_read
            .fetch_add(buf.len() as u64, Ordering::Relaxed);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{RenderedDocset, RenderedPage, TocNode};

    fn big_docset() -> RenderedDocset {
        let body = format!(
            "<h1>Page</h1><p>{}</p>",
            "lorem ipsum dolor sit ".repeat(250)
        );
        let plain = "lorem ipsum dolor sit ".repeat(250);
        let pages: Vec<RenderedPage> = (0..150)
            .map(|i| RenderedPage {
                id: format!("p{i}"),
                title: format!("Page {i}"),
                body_html: body.clone(),
                plain: plain.clone(),
                keywords: vec![format!("kw{i}")],
                categories: vec![],
                related: vec![],
                md: None,
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
            id: "big".into(),
            title: "Big".into(),
            version: "1".into(),
            language: "en".into(),
            collection: "big".into(),
            collection_title: "Big".into(),
            products: vec![],
            pages,
            toc,
            categories: vec![],
            assets: vec![],
        }
    }

    #[test]
    fn streams_only_touched_pages() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("big.khb");
        crate::build::build_khb(&big_docset(), &path).unwrap();
        let total = std::fs::metadata(&path).unwrap().len();
        assert!(
            total > 3 * BLOCK,
            "test db too small ({total}) to prove laziness"
        );

        let reader = Arc::new(FileRangeReader::open(&path).unwrap());
        let ds = Docset::open_reader(reader.clone()).unwrap();

        // Queries stream through the VFS and match a direct (whole-file) open.
        let direct = Docset::open(&path).unwrap();
        assert_eq!(ds.id().unwrap(), "big");
        assert_eq!(ds.toc().unwrap().len(), direct.toc().unwrap().len());
        assert!(ds.page("p100").unwrap().unwrap().body_html.contains("<h1>"));
        assert_eq!(ds.search("kw100", 5).unwrap().len(), 1);

        // Laziness: only a fraction of the file was fetched.
        let read = reader.bytes_read();
        assert!(read < total, "streamed {read} of {total} bytes — not lazy");
    }
}
