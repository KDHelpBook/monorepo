/**
 * Editions of the bundled books, as loadable *variants*.
 *
 * A product can offer several editions — versions of one book (`versions[]` on a
 * manifest entry) and languages of one product (`collection`) — but the viewer
 * loads exactly one of them per collection (`pickVersions` → `pickLanguages`). So
 * building a variant must stay **free**: describing every edition costs no network,
 * and the transport negotiation (the `Range` probe + a streamed `peek`, or a look in
 * the prefetch cache) happens in `resolve()`, for the chosen edition only. Ten
 * archived editions then cost exactly what one costs at start-up.
 *
 * The effects are injected (`EditionEffects`) so this module — unlike the boot path
 * in `main.ts` — is unit-testable without a DOM, a network, or IndexedDB.
 */

import type { DocsetSource } from "./collection";
import {
  expandEditions,
  streamEligible,
  type EditionDescriptor,
  type ManifestEntry,
} from "./manifest";

/** How to prefetch one streamed book whole (for the offline cache). */
export interface PrefetchItem {
  url: string;
  hash: string;
  packUrls: string[];
}

/** Where a book came from + its packs — for the Manage docsets page. */
export interface BookOrigin {
  kind: "bundled" | "uploaded" | "remote";
  /** Storage key (uploaded) or URL (remote) to remove by; absent ⇒ not removable. */
  removeKey?: string;
  /** Page-level streaming: the remote's transport preference, or — for a bundled
   *  book — the transport actually negotiated at load. Undefined until resolved. */
  streaming?: boolean;
  /** Served whole from the prefetch cache (IndexedDB) — set when a book opens from
   *  cache, or a streamed book is hot-swapped to its cached copy. Shown as
   *  "· offline" instead of "· streaming". Mutated live on hot-swap. */
  offline?: boolean;
  /** Attachment packs: `.khba` paths/URLs (bundled/remote) or generic labels. */
  packs: string[];
}

/**
 * One edition (version × language) of a product, with a *promise* of a source.
 * `key` — not `id` — identifies it: editions of one book share a docset id, so any
 * per-edition bookkeeping (which one is loaded, which one failed) must key on this.
 */
export interface DocVariant {
  key: string;
  id: string;
  collection: string;
  language: string;
  version: string;
  title: string;
  origin: BookOrigin;
  /** Negotiate and return the load source. Memoized: repeated calls (a rebuild that
   *  re-picks the same edition) never re-probe. */
  resolve: () => Promise<DocsetSource>;
}

/** The identity of one edition: `id@version` (an unversioned book keys as `id@`). */
export function variantKey(id: string, version: string): string {
  return `${id}@${version}`;
}

/** The effectful bits of resolving a bundled edition, injected for testability. */
export interface EditionEffects {
  /** Absolute, content-keyed URL for a manifest path (`resolveManifestUrl` + hash stamp). */
  docsetUrl: (file: string, hash?: string) => string;
  /** Absolute, build-stamped URL for an attachment pack path. */
  packUrl: (file: string) => string;
  /** Dist-relative, content-keyed path for the whole-fetch fallback. */
  filePath: (file: string, hash?: string) => string;
  /** Prefetch-cache key for a docset URL at a content hash (`blobKey`). */
  blobKey: (url: string, hash: string) => string;
  /** Reader-attached extra `.khba` packs for a docset id. */
  extraPacks: (id: string) => string[];
  /** Whether the offline prefetch cache may be read (the per-device toggle). */
  prefetchOn: boolean;
  getBlob: (
    key: string,
  ) => Promise<{ bytes: Uint8Array; packs: Uint8Array[] } | null>;
  rangeSupported: (url: string) => Promise<boolean>;
  /** A cheap streamed open — validates engine + host end-to-end before committing. */
  peek: (url: string) => Promise<unknown>;
  /** Register a streamed book that can be downloaded whole in the background. */
  prefetchable: (id: string, item: PrefetchItem) => void;
}

/** Wrap an already-known source (uploaded/remote books) as a variant. */
export function eagerVariant(
  fields: Omit<DocVariant, "key" | "resolve">,
  source: DocsetSource,
): DocVariant {
  return {
    key: variantKey(fields.id, fields.version),
    ...fields,
    resolve: () => Promise.resolve(source),
  };
}

/** Run `fn` once, then hand every later caller the same promise. */
function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= fn());
}

function bundledVariant(
  edition: EditionDescriptor,
  effects: EditionEffects,
): DocVariant {
  const packs = [...edition.attachments, ...effects.extraPacks(edition.id)];
  const origin: BookOrigin = { kind: "bundled", packs };
  const eligible = streamEligible(edition, effects.extraPacks(edition.id));
  const url = effects.docsetUrl(edition.file, edition.hash);

  const resolve = once(async (): Promise<DocsetSource> => {
    // Cache-first: open the whole `.khb` from IndexedDB when we prefetched it.
    if (eligible && edition.hash && effects.prefetchOn) {
      const cached = await effects.getBlob(
        effects.blobKey(url, edition.hash),
      );
      if (cached) {
        origin.streaming = false;
        origin.offline = true;
        return {
          bytes: cached.bytes,
          attachments: cached.packs.map((bytes) => ({ bytes })),
        };
      }
    }
    if (eligible && (await effects.rangeSupported(url))) {
      try {
        await effects.peek(url);
        const packUrls = packs.map((p) => effects.packUrl(p));
        if (edition.hash) {
          effects.prefetchable(edition.id, {
            url,
            hash: edition.hash,
            packUrls,
          });
        }
        origin.streaming = true;
        return { url, mode: "streaming", attachments: packUrls };
      } catch (e) {
        // Fall back to a whole fetch — but say why, or a host/engine bug hides
        // behind a silently slower load.
        console.warn("khb: streaming open failed, fetching whole", e);
      }
    }
    origin.streaming = false;
    return {
      // Same content-keyed cache-busting on the whole-fetch fallback; packs carry
      // no per-content hash in the manifest, so they stay on the build stamp.
      file: effects.filePath(edition.file, edition.hash),
      // A `.gz` suffix (on the docset or a pack) decompresses on fetch.
      attachments: packs.map((file) => ({ file: effects.packUrl(file) })),
    };
  });

  return {
    key: variantKey(edition.id, edition.version),
    id: edition.id,
    collection: edition.collection,
    language: edition.language,
    version: edition.version,
    title: edition.title,
    origin,
    resolve,
  };
}

/**
 * Every edition of every bundled book, plus the prefetch-cache keys they may own.
 * Performs **no** I/O: the keys are derived from the manifest so stale-blob pruning
 * keeps the cached copy of an edition the reader has pinned but isn't loading now.
 */
export function bundledVariants(
  entries: ManifestEntry[],
  effects: EditionEffects,
): { variants: DocVariant[]; blobKeys: Set<string> } {
  const variants: DocVariant[] = [];
  const blobKeys = new Set<string>();
  for (const entry of entries) {
    for (const edition of expandEditions(entry)) {
      variants.push(bundledVariant(edition, effects));
      if (
        edition.hash &&
        streamEligible(edition, effects.extraPacks(edition.id))
      ) {
        blobKeys.add(
          effects.blobKey(
            effects.docsetUrl(edition.file, edition.hash),
            edition.hash,
          ),
        );
      }
    }
  }
  return { variants, blobKeys };
}

/** The load sources of the chosen editions, negotiated in parallel. */
export function openSources(chosen: DocVariant[]): Promise<DocsetSource[]> {
  return Promise.all(chosen.map((v) => v.resolve()));
}
