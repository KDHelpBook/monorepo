import { invoke } from "@tauri-apps/api/core";
import {
  buildTocTree,
  type AssetBlob,
  type Category,
  type IDocset,
  type KeywordEntry,
  type Page,
  type Product,
  type SearchHit,
  type TocNode,
} from "./docset";

/** A docset to open natively: the `.khb` path plus any sidecar `.khba` paths. */
export interface OpenSpec {
  path: string;
  sidecars?: string[];
}

/** The `open_docsets`/`bundled_docsets` command payload (mirrors the Rust `DocsetInit`).
 *  `toc` is left loosely typed — it's flat rows fed straight to `buildTocTree`. */
interface DocsetInit {
  id: string;
  language: string;
  title: string;
  collection: string;
  collectionTitle: string;
  version: string;
  products: Product[];
  toc: Record<string, unknown>[];
  categories: Category[];
  keywords: KeywordEntry[];
  related: [string, string][]; // (pageId, relatedId)
  pageCategories: [string, string][]; // (categoryId, pageId)
  missing: { path: string; pack: string }[];
}

/**
 * A book backed by the native Rust `khb-core` over Tauri IPC — the desktop `IDocset`.
 * Structure (toc/categories/keywords/related/products) is eager-loaded once at open and
 * served synchronously from these fields (like `StreamingDocset`); `page`/`asset`/`search`
 * are async `invoke()` calls answered by native SQLite + real FTS5. Rust holds the open
 * `Docset`, so this class is a thin client keyed by docset id.
 */
export class TauriDocset implements IDocset {
  private constructor(
    readonly id: string,
    readonly language: string,
    readonly title: string,
    readonly collection: string,
    readonly collectionTitle: string,
    readonly version: string,
    readonly products: Product[],
    private readonly toc: TocNode[],
    private readonly cats: Category[],
    private readonly kws: KeywordEntry[],
    private readonly byCategory: Map<string, string[]>,
    private readonly relatedById: Map<string, string[]>,
    private readonly missing: { path: string; pack: string }[],
  ) {}

  private static fromInit(init: DocsetInit): TauriDocset {
    const byCategory = new Map<string, string[]>();
    for (const [cid, pid] of init.pageCategories) {
      (byCategory.get(cid) ?? byCategory.set(cid, []).get(cid)!).push(pid);
    }
    const relatedById = new Map<string, string[]>();
    for (const [pid, rid] of init.related) {
      (relatedById.get(pid) ?? relatedById.set(pid, []).get(pid)!).push(rid);
    }
    return new TauriDocset(
      init.id,
      init.language,
      init.title,
      init.collection,
      init.collectionTitle,
      init.version,
      init.products,
      buildTocTree(init.toc),
      init.categories,
      init.keywords,
      byCategory,
      relatedById,
      init.missing,
    );
  }

  /** Open the demo docsets bundled with the app (resources/docsets), opened natively. */
  static async bundled(): Promise<TauriDocset[]> {
    const inits = await invoke<DocsetInit[]>("bundled_docsets");
    return inits.map((i) => TauriDocset.fromInit(i));
  }

  /** Open `.khb` files chosen from disk (File → Open), with any sidecar `.khba`. */
  static async open(specs: OpenSpec[]): Promise<TauriDocset[]> {
    const inits = await invoke<DocsetInit[]>("open_docsets", { specs });
    return inits.map((i) => TauriDocset.fromInit(i));
  }

  // --- synchronous structure (from the eager caches) ---
  tocTree(): TocNode[] {
    return this.toc;
  }
  categories(): Category[] {
    return this.cats;
  }
  keywords(): KeywordEntry[] {
    return this.kws;
  }
  pagesByCategory(categoryId: string): string[] {
    return this.byCategory.get(categoryId) ?? [];
  }
  related(id: string): string[] {
    return this.relatedById.get(id) ?? [];
  }
  missingAssets(): { path: string; pack: string }[] {
    return this.missing;
  }

  // --- native, on demand ---
  async page(id: string): Promise<Page | null> {
    return (
      (await invoke<Page | null>("page", {
        docsetId: this.id,
        pageId: id,
      })) ?? null
    );
  }

  async asset(path: string): Promise<AssetBlob | null> {
    const a = await invoke<{ mime: string; base64: string } | null>("asset", {
      docsetId: this.id,
      path,
    });
    return a ? { mime: a.mime, data: b64ToBytes(a.base64) } : null;
  }

  async search(query: string, limit = 40): Promise<SearchHit[]> {
    return invoke<SearchHit[]>("search", { docsetId: this.id, query, limit });
  }

  close(): void {
    /* Rust owns the connection; nothing to free on the JS side. */
  }
}

/** Decode a base64 string (from the `asset` command) to bytes. */
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** True when running inside the Tauri desktop shell (vs a plain browser). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
