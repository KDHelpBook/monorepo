/**
 * Cheap structural sanity check on an uploaded `.khb`/`.khba` (both are SQLite
 * databases). This is NOT the security boundary — that's the OIDC permission
 * map (a repo can only ever write its own docset ids); this only catches honest
 * mistakes like uploading the wrong file. The strong id/version check runs in
 * the publishing workflow (`khb inspect` before upload); a full in-worker
 * b-tree walk of the meta table is a documented follow-up, not implemented.
 */

/** `"SQLite format 3\0"` — the first 16 bytes of every SQLite database. */
const MAGIC = [
  0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61,
  0x74, 0x20, 0x33, 0x00,
];

/** How much of the file head [`checkKhbHead`] needs. */
export const HEAD_BYTES = 100;

/**
 * Validate the head of an uploaded file. Returns an error message, or null
 * when the head looks like a plausible SQLite database of `totalSize` bytes.
 */
export function checkKhbHead(head: Uint8Array, totalSize: number): string | null {
  if (totalSize < 512) return "file too small to be a SQLite database";
  if (head.length < 20) return "file head truncated";
  for (let i = 0; i < MAGIC.length; i++) {
    if (head[i] !== MAGIC[i]) return "not a SQLite database (bad magic)";
  }
  // Big-endian u16 at offset 16; the value 1 means 65536.
  const raw = (head[16]! << 8) | head[17]!;
  const pageSize = raw === 1 ? 65536 : raw;
  if (pageSize < 512 || pageSize > 65536 || (pageSize & (pageSize - 1)) !== 0) {
    return `invalid SQLite page size ${raw}`;
  }
  if (totalSize % pageSize !== 0) {
    return "file size is not a multiple of the page size (truncated upload?)";
  }
  return null;
}
