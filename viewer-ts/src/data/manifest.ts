/**
 * The `docsets.json` manifest a packed distribution ships (written by
 * `khb pack` / `patch`): the bundled docsets the viewer loads on start.
 * The types and the transport rules live here (not in main.ts) so they are
 * unit-testable without a DOM.
 */

/**
 * One *older* edition of the entry's book: same docset id, a different `version`.
 * Both producers write it — the registry worker from its `latest.json` archive, and
 * `khb pack`/`patch` when several editions of one id are packed. The current edition
 * is the entry itself, so `versions` never repeats it.
 *
 * The display metadata is carried per edition (rather than inherited from the entry)
 * because a book may have been retitled — or moved to another collection — between
 * releases, and the switcher must name each edition as it was published.
 */
export interface ManifestEdition {
  version: string;
  /** Path under the dist root, like the entry's `file`. */
  file: string;
  title: string;
  language: string;
  collection: string;
  hash?: string;
  attachments?: string[];
  /** ISO timestamp, informational (the registry records it; nothing renders it yet). */
  publishedAt?: string;
}

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
  /** Older editions of this same book, offered in the viewer's version switcher.
   *  Absent/empty ⇒ the book ships as a single edition (every manifest before this
   *  field existed). */
  versions?: ManifestEdition[];
  /** Sidecar `.khba` attachment packs (paths relative to the dist root). */
  attachments?: string[];
  /** Opt-in page-level streaming: open this docset over HTTP `Range` instead of
   *  fetching it whole (worth it for big books only — set by `khb pack
   *  --stream`). A preference, not a promise: the viewer probes the host and
   *  falls back to the whole fetch when Range isn't honoured. */
  streaming?: boolean;
  /** Short content hash of the shipped file. Appended to the docset URL as
   *  `?v=<hash>` so a rebuilt same-named book gets a fresh HTTP-cache key (no
   *  stale byte range mixing into a malformed image), while an unchanged book
   *  keeps its cache across deploys. Absent on older packs → fall back to the
   *  per-build stamp. */
  hash?: string;
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

/**
 * One edition of one book, flattened out of a manifest entry: everything needed to
 * *describe* it (the version switcher, the Manage matrix) without touching the
 * network. Turning it into a loadable source is a separate, lazy step — see
 * `variants.ts` — so a book with ten archived editions costs no more at start-up
 * than a book with one.
 */
export interface EditionDescriptor {
  id: string;
  collection: string;
  language: string;
  version: string;
  title: string;
  file: string;
  hash?: string;
  attachments: string[];
  /** The entry's transport preference; `streamEligible` still vetoes per edition. */
  streaming: boolean;
}

const isEdition = (value: unknown): value is ManifestEdition => {
  if (!value || typeof value !== "object") return false;
  const e = value as Partial<ManifestEdition>;
  return (
    typeof e.version === "string" &&
    e.version !== "" &&
    typeof e.file === "string" &&
    e.file !== "" &&
    typeof e.title === "string" &&
    typeof e.language === "string" &&
    typeof e.collection === "string"
  );
};

/**
 * A manifest entry's editions, current first: the entry itself, then each older
 * edition it lists. Malformed editions are dropped with a warning rather than
 * failing the boot (same tolerance as the `folders` tree), as is one repeating the
 * current version — the viewer must never offer the same version twice.
 */
export function expandEditions(entry: ManifestEntry): EditionDescriptor[] {
  const current: EditionDescriptor = {
    id: entry.id,
    collection: entry.collection ?? entry.id,
    language: entry.language,
    version: entry.version ?? "",
    title: entry.title,
    file: entry.file,
    ...(entry.hash ? { hash: entry.hash } : {}),
    attachments: entry.attachments ?? [],
    streaming: entry.streaming === true,
  };
  const seen = new Set([current.version]);
  const editions: EditionDescriptor[] = [current];
  for (const value of entry.versions ?? []) {
    if (!isEdition(value)) {
      console.warn("docsets.json: ignoring invalid `versions` entry", value);
      continue;
    }
    if (seen.has(value.version)) continue;
    seen.add(value.version);
    editions.push({
      id: entry.id,
      collection: value.collection,
      language: value.language,
      version: value.version,
      title: value.title,
      file: value.file,
      ...(value.hash ? { hash: value.hash } : {}),
      attachments: value.attachments ?? [],
      streaming: entry.streaming === true,
    });
  }
  return editions;
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
  entry: { file: string; streaming?: boolean; attachments?: string[] },
  extraPacks: string[] = [],
): boolean {
  const gz = (f: string): boolean => f.endsWith(".gz");
  return (
    entry.streaming === true &&
    !gz(entry.file) &&
    ![...(entry.attachments ?? []), ...extraPacks].some(gz)
  );
}
