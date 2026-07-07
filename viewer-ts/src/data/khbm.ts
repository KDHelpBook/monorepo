// `.khbm` — a KD Help Book manifest: a small JSON file that names several remote
// docsets (and their `.khba` attachment packs) so a whole product can be added in
// one step instead of URL-by-URL. Distinct from `docsets.json` (which describes a
// *packed dist* with paths relative to the dist root): a `.khbm` is authored for
// import, and its `url`/`attachments` are resolved relative to the manifest's own
// URL — so a product can ship `books.khbm` alongside its `.khb`/`.khba` files and
// reference them with plain relative paths.
//
// The manifest describes *what* the docsets are, not *how* to fetch them: whether
// to stream (page-by-page over HTTP Range) vs fetch whole is a reader/transport
// choice (host Range support, file size, bandwidth), so it's set per docset in the
// reader, not here.
//
// Shape:
//   {
//     "khbm": 1,
//     "title": "KD Help Book Documentation",          // optional display name
//     "docsets": [
//       { "url": "en.khb", "attachments": ["en.khba"] },
//       { "url": "https://cdn/…/pl.khb.gz" },
//       { "url": "big.khb", "attachments": ["big.khba"] }
//     ]
//   }

export interface KhbmDocset {
  /** Absolute URL of the `.khb` (resolved against the manifest URL). */
  url: string;
  /** Absolute `.khba` pack URLs (resolved against the manifest URL). */
  attachments: string[];
}
export interface KhbmManifest {
  title?: string;
  docsets: KhbmDocset[];
}

/**
 * Parse a `.khbm` document, resolving every `url`/`attachments` entry against
 * `baseUrl` (the manifest's own URL). Throws on a malformed top level; silently
 * skips entries without a usable `url`.
 */
export function parseKhbm(text: string, baseUrl: string): KhbmManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("not valid JSON");
  }
  if (!raw || typeof raw !== "object") throw new Error("not a khbm object");
  const obj = raw as { khbm?: unknown; title?: unknown; docsets?: unknown };
  if (obj.khbm == null) throw new Error('missing "khbm" marker');
  if (!Array.isArray(obj.docsets))
    throw new Error('"docsets" must be an array');

  const resolve = (u: string): string | null => {
    try {
      return new URL(u, baseUrl).href;
    } catch {
      return null;
    }
  };

  const docsets: KhbmDocset[] = [];
  for (const d of obj.docsets) {
    if (!d || typeof d !== "object") continue;
    const e = d as { url?: unknown; attachments?: unknown };
    if (typeof e.url !== "string") continue;
    const url = resolve(e.url);
    if (!url) continue;
    const attachments = Array.isArray(e.attachments)
      ? e.attachments
          .filter((a): a is string => typeof a === "string")
          .map(resolve)
          .filter((a): a is string => a != null)
      : [];
    docsets.push({ url, attachments });
  }

  const title = typeof obj.title === "string" ? obj.title : undefined;
  return title != null ? { title, docsets } : { docsets };
}
