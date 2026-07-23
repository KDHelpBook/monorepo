/**
 * The `docsets.json` manifest a packed distribution ships (written by
 * `khb pack` / `patch`): the bundled docsets the viewer loads on start.
 * The types and the transport rules live here (not in main.ts) so they are
 * unit-testable without a DOM.
 */

export interface ManifestEntry {
  /** Path under the dist root; a trailing `.gz` marks a gzip-compressed file. */
  file: string;
  id: string;
  title: string;
  language: string;
  /** Product/family key; older manifests omit it (fall back to `id`). */
  collection?: string;
  /** Content version (`meta.version`); may be absent. */
  version?: string;
  /** Sidecar `.khba` attachment packs (paths relative to the dist root). */
  attachments?: string[];
  /** Opt-in page-level streaming: open this docset over HTTP `Range` instead of
   *  fetching it whole (worth it for big books only — set by `khb pack
   *  --stream`). A preference, not a promise: the viewer probes the host and
   *  falls back to the whole fetch when Range isn't honoured. */
  streaming?: boolean;
}

/** A leaf of the `folders` tree: places a product family inside a folder. */
export interface FolderRef {
  collection: string;
}

/** A node of the `folders` tree (see folders.ts for the semantics). */
export interface FolderNode {
  /** Stable key — TOC expansion state persists on it (`@shelf:<id>`). */
  id: string;
  title: string;
  /** Per-UI-language titles; resolution is `titles[uiLang] ?? title`. */
  titles?: Record<string, string>;
  children?: (FolderRef | FolderNode)[];
}

export interface Manifest {
  docsets: ManifestEntry[];
  /** Optional nested grouping of product families for the TOC (folders.ts).
   *  Families it doesn't mention render at the root, as without it. */
  folders?: FolderNode[];
}

/** Resolve a manifest-relative path (`docsets/foo.khb`) against the site base. */
export function resolveManifestUrl(file: string, base: string): string {
  return new URL(file, base).href;
}

/**
 * Whether a bundled entry may stream: it must opt in (`"streaming": true`) and
 * every file involved must be served raw — Range requests address SQLite pages,
 * so a gzip-compressed docset or pack (`.gz`, including reader-attached extras)
 * forces the whole-fetch path (where gzip is fine: decompressed after fetch).
 */
export function streamEligible(
  entry: ManifestEntry,
  extraPacks: string[] = [],
): boolean {
  const gz = (f: string): boolean => f.endsWith(".gz");
  return (
    entry.streaming === true &&
    !gz(entry.file) &&
    ![...(entry.attachments ?? []), ...extraPacks].some(gz)
  );
}
