import "./styles/main.css";
// The page-body typography, injected as a string into the sandboxed content frame.
import contentCss from "./styles/content.css?inline";
import {
  Collection,
  fetchDocsetBytes,
  type DocsetSource,
} from "./data/collection";
import { Docset, type SearchHit, type TocNode } from "./data/docset";
import {
  addRemote,
  allDocsets,
  deleteDocset,
  getRemotes,
  putDocset,
  removeRemote,
} from "./data/library";
import {
  loadExpanded,
  loadFavorites,
  loadTabs,
  saveExpanded,
  saveFavorites,
  saveTabs,
} from "./data/uistate";
import { applyStatic, strings, type Strings } from "./i18n";

interface Config {
  externalSources: boolean;
  pwa: boolean;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const $ = <T extends Element = HTMLElement>(sel: string): T =>
  document.querySelector(sel) as T;

const esc = (s: string): string =>
  s.replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c,
  );

/**
 * Trusted bridge injected into the sandboxed content frame. It is the *only*
 * channel across the isolation boundary: it posts link intents to the app
 * (`{t:'kdhelp', …}`) and applies display-only messages from it (`kdhelp-app`).
 * It runs alongside any (contained, origin-isolated) untrusted content JS, so the
 * app side validates every inbound message by source and shape.
 */
const FRAME_BRIDGE = `(function(){
var P=parent;
function post(m){try{P.postMessage(m,'*')}catch(e){}}
function link(e,mid){var a=e.target&&e.target.closest&&e.target.closest('a');if(!a)return;
 if(a.hasAttribute('data-target')){e.preventDefault();post({t:'kdhelp',a:'open',id:a.getAttribute('data-target'),newTab:!!(mid||e.ctrlKey||e.metaKey)})}
 else if(a.hasAttribute('data-ext')){e.preventDefault();post({t:'kdhelp',a:'ext',url:a.getAttribute('data-ext')})}}
addEventListener('click',function(e){link(e,false)},true);
addEventListener('auxclick',function(e){if(e.button===1)link(e,true)},true);
addEventListener('message',function(e){var d=e.data;if(!d||d.t!=='kdhelp-app')return;
 if(d.a==='font'&&typeof d.size==='number'){document.documentElement.style.setProperty('--content-size',d.size+'px')}});
function ready(){var m=document.querySelector('mark.hl');if(m)m.scrollIntoView({block:'center'})}
if(document.readyState!=='loading')ready();else addEventListener('DOMContentLoaded',ready);
})();`;

// ---------------------------------------------------------------------------
// Manifest loading (single docset for now; collections come later)
// ---------------------------------------------------------------------------
interface ManifestEntry {
  /** Path under the dist root; a trailing `.gz` marks a gzip-compressed file. */
  file: string;
  id: string;
  title: string;
  language: string;
  /** Sidecar `.khba` attachment packs (paths relative to the dist root). */
  attachments?: string[];
}
interface Manifest {
  docsets: ManifestEntry[];
}

const LANG_KEY = "kdhelp.lang";

function readSavedLang(): string | null {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
}

function chooseLang(available: string[]): string {
  const saved = readSavedLang();
  if (saved && available.includes(saved)) return saved;
  const nav = (navigator.language || "en").slice(0, 2);
  if (available.includes(nav)) return nav;
  return available.includes("en") ? "en" : (available[0] ?? "en");
}

async function loadConfig(): Promise<Config> {
  try {
    const res = await fetch("config.json");
    if (res.ok) return (await res.json()) as Config;
  } catch {
    /* no config.json → defaults */
  }
  return { externalSources: true, pwa: true };
}

async function bootstrap(): Promise<void> {
  const manifestRes = await fetch("docsets.json");
  const manifest = (await manifestRes.json()) as Manifest;
  const config = await loadConfig();

  // Uploaded docsets (bytes in IndexedDB) and remote docsets (URLs, re-fetched each
  // session — the online/hybrid path) both extend the languages + collection.
  const uploadedAll = config.externalSources ? await allDocsets() : [];
  // A remote is either whole-fetched (bytes) or streamed page-by-page (no bytes).
  const remotes: {
    url: string;
    bytes?: Uint8Array;
    language: string;
    streaming: boolean;
    attachments?: string[];
  }[] = [];
  if (config.externalSources) {
    for (const entry of getRemotes()) {
      try {
        if (entry.streaming) {
          const { StreamingDocset } = await import("./data/streaming-docset");
          const { language } = await StreamingDocset.peek(entry.url);
          remotes.push({
            url: entry.url,
            language,
            streaming: true,
            attachments: entry.attachments,
          });
        } else {
          const bytes = await fetchDocsetBytes(entry.url);
          const ds = await Docset.open(bytes);
          remotes.push({ url: entry.url, bytes, language: ds.language, streaming: false });
          ds.close();
        }
      } catch {
        /* unreachable/invalid remote — skip; the user can remove it */
      }
    }
  }
  const available = [
    ...new Set([
      ...manifest.docsets.map((d) => d.language),
      ...uploadedAll.map((d) => d.language),
      ...remotes.map((r) => r.language),
    ]),
  ];
  const lang = chooseLang(available);
  document.documentElement.lang = lang;
  applyStatic(lang);

  const bundled: DocsetSource[] = manifest.docsets
    .filter((d) => d.language === lang)
    .map((d) => ({
      file: d.file,
      // A `.gz` suffix (on the docset or a pack) triggers decompression on fetch.
      attachments: (d.attachments ?? []).map((file) => ({ file })),
    }));
  const uploaded: DocsetSource[] = uploadedAll
    .filter((d) => d.language === lang)
    .map((d) => ({
      bytes: d.bytes,
      attachments: (d.attachments ?? []).map((bytes) => ({ bytes })),
    }));
  const remote: DocsetSource[] = remotes
    .filter((r) => r.language === lang)
    .map((r) =>
      r.streaming
        ? { url: r.url, mode: "streaming" as const, attachments: r.attachments }
        : { bytes: r.bytes! },
    );
  const sources = [...bundled, ...uploaded, ...remote];
  if (!sources.length) throw new Error(`no docsets for language "${lang}"`);

  if (config.pwa) registerServiceWorker();
  start(await Collection.load(sources, lang), lang, available, config);
}

function registerServiceWorker(): void {
  if (import.meta.env.DEV) return; // no SW in dev — it would fight HMR
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {
        /* offline support is best-effort */
      });
    });
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
type Mode = "contents" | "index" | "search" | "favorites";

interface PageInfo {
  title: string;
  path: string[];
  hasChildren: boolean;
}

function start(
  collection: Collection,
  lang: string,
  available: string[],
  config: Config,
): void {
  const s: Strings = strings(lang);
  // Locked (bundled) builds hide the "open other docsets" affordances.
  if (!config.externalSources) {
    document
      .querySelectorAll<HTMLElement>(
        '[data-action="open-docset"], [data-action="open-url"], [data-action="manage-docsets"]',
      )
      .forEach((el) => (el.style.display = "none"));
  }
  const leftBody = $("#left-body");
  const leftTitle = $("#left-title");
  const content = $("#content"); // app UI (Search page)
  const frame = $<HTMLIFrameElement>("#content-frame"); // sandboxed page bodies
  const contentWrap = $("#content-wrap");
  const filterbar = $("#filterbar");
  const filterSel = $<HTMLSelectElement>("#filter");
  const searchBox = $("#search-box");
  const searchInput = $<HTMLInputElement>("#search-input");
  const address = $<HTMLInputElement>("#address");
  const status = $("#status");
  const statusCount = $("#status-count");
  const favToggle = $("#fav-toggle");
  const tabstrip = $("#tabstrip");

  const pages = new Map<string, PageInfo>();
  const pageKeywords = new Map<string, string[]>();
  const favorites = new Set<string>(loadFavorites());
  // Expanded tree nodes (page ids + `@collection:…` folders). Persisted so several
  // folders can stay open at once and the shape survives a reload — unlike the old
  // behaviour that recomputed openness from the current page and collapsed the rest.
  const expanded = new Set<string>(loadExpanded());
  const persistTabs = (): void =>
    saveTabs({
      // Persist the open pages only, not each tab's transient back/forward stack.
      tabs: tabs.map((t) => (t.query != null ? { id: t.id, query: t.query } : { id: t.id })),
      active,
    });
  // A tab is a docset page, or the full Search results page (id === SEARCH_ID,
  // which carries its query + the last scroll of scope/sort controls).
  const SEARCH_ID = "@search";
  // Each tab keeps its OWN back/forward stack (`hist` + `pos`), like MS Document
  // Explorer and browser tabs — Back/Forward move within the active tab only, and
  // switching tabs never touches another tab's history. `id` mirrors `hist[pos]`.
  interface Tab {
    id: string;
    query?: string;
    hist: string[];
    pos: number;
  }
  const mkTab = (id: string, query?: string): Tab => ({
    id,
    query,
    hist: [id],
    pos: 0,
  });
  const tabs: Tab[] = [];
  let active = -1;
  const searchScope = { category: "", product: "", sort: "rank" };
  // Touch device? Tree folder-pages then expand on a single tap (double-tap zooms).
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  let currentId = "";
  // Monotonic tokens so a slow async load/search (streaming) that finishes after a
  // newer one has started is dropped instead of clobbering the newer result.
  let loadSeq = 0;
  let searchSeq = 0; // side-panel search
  let pageSearchSeq = 0; // full Search page
  let mode: Mode = "contents";
  let filterCategory = "";
  let filterProduct = ""; // family/collection scope (union by default)
  let fontSize = 13;
  // Terms to highlight in the opened page — set when a search result is clicked,
  // persisted across navigation (like MS Document Explorer) until explicitly cleared.
  let highlightTerms: string[] = [];

  const escapeRe = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const queryTerms = (q: string): string[] => [
    ...new Set(
      q
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length >= 2),
    ),
  ];

  // Ctrl/⌘-click or middle-click opens a link in a new document tab.
  const wantNew = (e: MouseEvent): boolean => e.ctrlKey || e.metaKey;
  const linkOpen = (el: Element, id: string): void => {
    el.addEventListener("click", (e) => openPage(id, wantNew(e as MouseEvent)));
    el.addEventListener("auxclick", (e) => {
      const me = e as MouseEvent;
      if (me.button === 1) {
        me.preventDefault();
        openPage(id, true);
      }
    });
  };

  const toc = collection.tocTree();
  (function buildPages(nodes: TocNode[], path: string[]) {
    for (const n of nodes) {
      // Family folders are not pages; keep them out of the page map but include
      // them in descendants' path so the tree can auto-expand to the current page.
      if (!n.group) {
        pages.set(n.pageId, {
          title: n.title,
          path: [...path],
          hasChildren: n.children.length > 0,
        });
      }
      if (n.children.length) buildPages(n.children, [...path, n.pageId]);
    }
  })(toc, []);
  for (const k of collection.keywords()) {
    for (const pid of k.pageIds) {
      const list = pageKeywords.get(pid);
      if (list) list.push(k.term);
      else pageKeywords.set(pid, [k.term]);
    }
  }

  // ---- page icons ----
  const pageIcon = (hasKids: boolean): string =>
    hasKids
      ? '<svg class="ico" viewBox="0 0 16 16"><path d="M1.5 4.5h4l1.2 1.2h7.8v8H1.5z" fill="#ffd98a" stroke="#c98a12"/></svg>'
      : '<svg class="ico" viewBox="0 0 16 16"><path d="M3 1.5h6l4 4v9H3z" fill="#fff" stroke="#5b6675"/><path d="M9 1.5v4h4" fill="none" stroke="#5b6675"/><path d="M5 8h6M5 10.5h6M5 5.5h2" stroke="#3d75bd" stroke-width="1" stroke-linecap="round"/></svg>';
  // A stack of books for a product/family folder.
  const groupIcon = (): string =>
    '<svg class="ico" viewBox="0 0 16 16"><rect x="2.2" y="2.5" width="3.2" height="11" rx=".4" fill="#7fa8dd" stroke="#33608f"/><rect x="6.1" y="3" width="3.2" height="10.5" rx=".4" fill="#a9c6ea" stroke="#33608f"/><rect x="10" y="2.5" width="3.6" height="11" rx=".4" fill="#d6e5f7" stroke="#33608f"/></svg>';

  // ---- Contents tree ----
  // Reveal the current page: expand the folders on its path (adding them to the
  // persisted set — never collapsing others), then re-render only if that changed
  // the shape, and scroll it into view. This is what replaces the old
  // collapse-everything-but-the-current-branch behaviour.
  function revealCurrent(): void {
    const path = pages.get(currentId)?.path ?? [];
    let changed = false;
    for (const id of path)
      if (!expanded.has(id)) {
        expanded.add(id);
        changed = true;
      }
    if (changed) {
      saveExpanded(expanded);
      renderTree();
    } else {
      highlightTree();
    }
    leftBody
      .querySelector(`.node[data-id="${CSS.escape(currentId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }

  function treeNode(n: TocNode, forceOpen = false): HTMLLIElement {
    const li = document.createElement("li");
    const kids = n.children.length > 0;
    const row = document.createElement("div");
    row.className = "node" + (n.group ? " group" : "");
    row.dataset.id = n.pageId;
    const open = forceOpen || expanded.has(n.pageId);
    row.innerHTML =
      `<span class="twisty ${kids ? "" : "leaf"}">${kids ? (open ? "−" : "+") : ""}</span>` +
      (n.group ? groupIcon() : pageIcon(kids)) +
      `<span class="label">${esc(n.title)}</span>`;
    li.appendChild(row);
    if (kids) {
      const sub = document.createElement("ul");
      sub.style.display = open ? "" : "none";
      for (const c of n.children) sub.appendChild(treeNode(c, forceOpen));
      li.appendChild(sub);
      const twistyEl = row.querySelector(".twisty")!;
      const toggle = (): void => {
        const showing = sub.style.display !== "none";
        sub.style.display = showing ? "none" : "";
        twistyEl.textContent = showing ? "+" : "−";
        if (showing) expanded.delete(n.pageId);
        else expanded.add(n.pageId);
        saveExpanded(expanded);
      };
      twistyEl.addEventListener("click", (e) => {
        e.stopPropagation();
        toggle();
      });
      if (n.group) {
        // A family folder has no page — clicking its row just expands/collapses.
        row.addEventListener("click", toggle);
      } else if (coarsePointer) {
        // Touch: one tap opens the chapter's page AND reveals its children (double
        // tap would trigger zoom). It never collapses via the row — use the +/−.
        row.addEventListener("click", () => {
          if (!expanded.has(n.pageId)) toggle();
          openPage(n.pageId);
        });
      } else {
        // Desktop folder-page: single-click opens its page, double-click expands
        // (MS Help style); the +/− twisty toggles it too.
        row.addEventListener("dblclick", (e) => {
          e.preventDefault();
          toggle();
        });
      }
    }
    // Leaf pages, and desktop folder-pages, open on a single click (ctrl/⌘ or middle
    // click → new tab). Touch folder-pages are handled above.
    if (!n.group && !(kids && coarsePointer)) linkOpen(row, n.pageId);
    return li;
  }

  function renderTree(): void {
    leftBody.innerHTML = "";
    const ul = document.createElement("ul");
    ul.className = "tree";
    // A product scope drills into that family's subtree (drops the wrapper).
    const roots = familyRoots(filterProduct);
    if (filterCategory) {
      // Prune to pages in the category, but KEEP the folder/tree structure (the
      // ancestors leading to a match survive); reveal it fully expanded.
      const ids = new Set(collection.pagesByCategory(filterCategory));
      const pruned = pruneTree(roots, (id) => ids.has(id) && inProduct(id));
      for (const n of pruned) ul.appendChild(treeNode(n, true));
    } else {
      for (const n of roots) ul.appendChild(treeNode(n));
    }
    leftBody.appendChild(ul);
    highlightTree();
  }

  // Keep a node when it is a matching page or has a matching descendant, so the
  // path (folders + intermediate pages) to every match is preserved.
  function pruneTree(
    nodes: TocNode[],
    keep: (id: string) => boolean,
  ): TocNode[] {
    const out: TocNode[] = [];
    for (const n of nodes) {
      const children = n.children.length ? pruneTree(n.children, keep) : [];
      if (children.length || (!n.group && keep(n.pageId))) {
        out.push({
          pageId: n.pageId,
          title: n.title,
          group: n.group,
          children,
        });
      }
    }
    return out;
  }

  // True if a page belongs to the scoped product (or no product scope is set).
  const inProduct = (nsId: string): boolean =>
    !filterProduct || collection.collectionOf(nsId) === filterProduct;
  // The top-level nodes to render for a product scope: the matching family's
  // children (unwrapped), or the whole toc when unscoped / ungrouped.
  const familyRoots = (product: string): TocNode[] => {
    if (!product) return toc;
    const g = toc.find((n) => n.group && n.pageId === `@collection:${product}`);
    return g ? g.children : toc;
  };

  const highlightTree = (): void => {
    leftBody.querySelectorAll<HTMLElement>(".node").forEach((el) => {
      el.classList.toggle("sel", el.dataset.id === currentId);
    });
  };

  function syncTree(): void {
    filterCategory = "";
    filterSel.value = "";
    filterProduct = "";
    $<HTMLSelectElement>("#filter-product").value = "";
    showMode("contents");
    revealCurrent(); // expand the path to the current page + scroll it into view
  }

  // ---- Index ----
  function renderIndex(): void {
    const locale = collection.language || "en";
    // Same "Filtered by:" facets as Contents — restrict the index to keywords that
    // still point at a page in the chosen product and/or category.
    const allowed = filterCategory
      ? new Set(collection.pagesByCategory(filterCategory))
      : null;
    const keys = collection
      .keywords()
      .map((k) => ({
        term: k.term,
        pageIds: k.pageIds.filter(
          (id) => inProduct(id) && (!allowed || allowed.has(id)),
        ),
      }))
      .filter((k) => k.pageIds.length > 0)
      .sort((a, b) =>
        a.term.localeCompare(b.term, locale, { sensitivity: "base" }),
      );
    const wrap = document.createElement("div");
    wrap.className = "index-list";
    let letter = "";
    for (const k of keys) {
      const L = (k.term[0] ?? "").toLocaleUpperCase(locale);
      if (L !== letter) {
        letter = L;
        const h = document.createElement("div");
        h.className = "idx-letter";
        h.textContent = L;
        wrap.appendChild(h);
      }
      const row = document.createElement("div");
      row.className = "idx-key" + (k.pageIds.length > 1 ? " multi" : "");
      row.textContent = k.term;
      if (k.pageIds.length === 1) {
        linkOpen(row, k.pageIds[0]!);
        wrap.appendChild(row);
      } else {
        const sub = document.createElement("div");
        sub.className = "idx-sub";
        sub.style.display = "none";
        for (const id of k.pageIds) {
          const t = document.createElement("div");
          t.className = "idx-topic";
          t.textContent = pages.get(id)?.title ?? id;
          linkOpen(t, id);
          sub.appendChild(t);
        }
        row.addEventListener("click", () => {
          sub.style.display = sub.style.display === "none" ? "" : "none";
        });
        wrap.appendChild(row);
        wrap.appendChild(sub);
      }
    }
    leftBody.innerHTML = "";
    leftBody.appendChild(wrap);
    statusCount.textContent = s.indexKeywords(keys.length);
  }

  // ---- Search ----
  const crumb = (id: string): string =>
    (pages.get(id)?.path ?? [])
      .map((p) => esc(pages.get(p)?.title ?? p))
      .join(" › ") || "—";

  async function runSearch(query: string): Promise<void> {
    const q = query.trim();
    if (!q) {
      highlightTerms = [];
      leftBody.innerHTML = `<div class="empty">${esc(s.searchPrompt)}</div>`;
      statusCount.textContent = "";
      return;
    }
    const token = ++searchSeq;
    const results = await collection.search(q, 40);
    if (token !== searchSeq) return; // superseded by a newer keystroke
    if (!results.length) {
      leftBody.innerHTML = `<div class="empty">${esc(s.noResults)}<br><b>${esc(q)}</b></div>`;
      statusCount.textContent = s.searchResults(0);
      return;
    }
    const terms = queryTerms(q);
    const frag = document.createDocumentFragment();
    for (const hit of results) {
      const div = document.createElement("div");
      div.className = "result";
      div.innerHTML =
        `<div class="r-title">${esc(hit.title)}</div>` +
        `<div class="r-crumb">${crumb(hit.pageId)}</div>` +
        `<div class="r-snip">${hit.snippet}</div>`;
      // Opening a result highlights the query terms on the destination page.
      div.addEventListener("click", (e) => {
        highlightTerms = terms;
        openPage(hit.pageId, wantNew(e));
      });
      div.addEventListener("auxclick", (e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        highlightTerms = terms;
        openPage(hit.pageId, true);
      });
      frag.appendChild(div);
    }
    leftBody.innerHTML = "";
    leftBody.appendChild(frag);
    statusCount.textContent = s.searchResults(results.length);
  }

  // ---- Full Search page (roomy results in the document area, dexplore-style) ----
  // Open (or focus) the Search page tab for `query`, keeping any reading tab.
  function openSearchPage(query: string): void {
    const existing = tabs.find((t) => t.id === SEARCH_ID);
    if (existing) {
      existing.query = query;
      active = tabs.indexOf(existing);
    } else {
      tabs.push(mkTab(SEARCH_ID, query));
      active = tabs.length - 1;
    }
    loadContent(SEARCH_ID);
  }

  // Apply the scope/sort controls to a raw search over the whole collection.
  async function searchPageResults(query: string): Promise<SearchHit[]> {
    let hits = await collection.search(query, 200);
    if (searchScope.category) {
      const allowed = new Set(collection.pagesByCategory(searchScope.category));
      hits = hits.filter((h) => allowed.has(h.pageId));
    }
    if (searchScope.product) {
      hits = hits.filter(
        (h) => collection.collectionOf(h.pageId) === searchScope.product,
      );
    }
    const locale = collection.language || "en";
    if (searchScope.sort === "title") {
      hits = [...hits].sort((a, b) =>
        a.title.localeCompare(b.title, locale, { sensitivity: "base" }),
      );
    } else if (searchScope.sort === "source") {
      hits = [...hits].sort(
        (a, b) =>
          collection
            .docsetTitle(a.pageId)
            .localeCompare(collection.docsetTitle(b.pageId), locale) ||
          b.score - a.score,
      );
    }
    return hits;
  }

  async function renderSearchResults(query: string): Promise<void> {
    const box = $("#sp-results");
    const countEl = $("#sp-count");
    const q = query.trim();
    if (!q) {
      box.innerHTML = `<div class="empty">${esc(s.searchPrompt)}</div>`;
      countEl.textContent = "";
      return;
    }
    const token = ++pageSearchSeq;
    const hits = await searchPageResults(q);
    if (token !== pageSearchSeq) return; // superseded
    const terms = queryTerms(q);
    countEl.textContent = s.searchResults(hits.length);
    if (!hits.length) {
      box.innerHTML = `<div class="empty">${esc(s.noResults)}<br><b>${esc(q)}</b></div>`;
      return;
    }
    const showSource = collection.books().length > 1;
    box.innerHTML = "";
    for (const hit of hits) {
      const trail = crumb(hit.pageId);
      const book = showSource ? esc(collection.docsetTitle(hit.pageId)) : "";
      const source = [trail === "—" ? "" : trail, book].filter(Boolean).join(" · ");
      const div = document.createElement("div");
      div.className = "sp-hit";
      div.innerHTML =
        `<div class="sp-h-title">${esc(hit.title)}</div>` +
        `<div class="sp-h-snip">${hit.snippet}</div>` +
        `<div class="sp-h-src">${esc(s.sourceLabel)} ${source || "—"}</div>`;
      const open = (e: MouseEvent): void => {
        highlightTerms = terms;
        openPage(hit.pageId, true); // new tab; keep the Search page
        if (e.button === 1) e.preventDefault();
      };
      div.addEventListener("click", open);
      div.addEventListener("auxclick", (e) => {
        if (e.button === 1) open(e);
      });
      box.appendChild(div);
    }
  }

  function renderSearchPage(): void {
    const query = tabs[active]?.query ?? "";
    document.title = `${s.search} — kdhelp`;
    address.value = `search:${query}`;
    const cats = collection.categories();
    const products = collection.families();
    const multiProduct = products.length > 1;
    const opts = (
      items: { id: string; title: string }[],
      first: string,
    ): string =>
      `<option value="">${esc(first)}</option>` +
      items
        .map((i) => `<option value="${esc(i.id)}">${esc(i.title)}</option>`)
        .join("");
    content.innerHTML =
      `<div class="search-page">` +
      `<form class="sp-bar" id="sp-form">` +
      `<input id="sp-q" type="search" value="${esc(query)}" placeholder="${esc(s.searchPlaceholder)}" autocomplete="off">` +
      `<button type="submit" class="sp-go">${esc(s.search)}</button>` +
      `</form>` +
      `<div class="sp-controls">` +
      (multiProduct
        ? `<label>${esc(s.scopeProduct)} <select id="sp-product">${opts(products, s.allProducts)}</select></label>`
        : "") +
      `<label>${esc(s.filterLabel)} <select id="sp-cat">${opts(cats, s.filterAll)}</select></label>` +
      `<label>${esc(s.sortBy)} <select id="sp-sort">` +
      `<option value="rank">${esc(s.sortRank)}</option>` +
      `<option value="title">${esc(s.sortTitle)}</option>` +
      (multiProduct
        ? `<option value="source">${esc(s.sortSource)}</option>`
        : "") +
      `</select></label>` +
      `<span class="sp-count" id="sp-count"></span>` +
      `</div>` +
      `<div class="sp-results" id="sp-results"></div>` +
      `</div>`;

    const catSel = $<HTMLSelectElement>("#sp-cat");
    const productSel = document.querySelector<HTMLSelectElement>("#sp-product");
    const sortSel = $<HTMLSelectElement>("#sp-sort");
    catSel.value = searchScope.category;
    if (productSel) productSel.value = searchScope.product;
    sortSel.value = searchScope.sort;
    const rerun = (): void => void renderSearchResults(tabs[active]?.query ?? "");
    $("#sp-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = $<HTMLInputElement>("#sp-q").value;
      const t = tabs[active];
      if (t) t.query = v;
      persistTabs(); // remember the Search tab's query across sessions
      address.value = `search:${v}`;
      rerun();
    });
    catSel.addEventListener("change", () => {
      searchScope.category = catSel.value;
      rerun();
    });
    productSel?.addEventListener("change", () => {
      searchScope.product = productSel.value;
      rerun();
    });
    sortSel.addEventListener("change", () => {
      searchScope.sort = sortSel.value;
      rerun();
    });

    renderSearchResults(query);
    content.scrollTop = 0;
    renderTabs();
    updateFavBtn();
    highlightTree();
    status.textContent = s.ready;
  }

  // ---- Favorites ----
  function renderFavorites(): void {
    if (!favorites.size) {
      leftBody.innerHTML = `<div class="empty">${esc(s.favEmpty1)}<br>${esc(s.favEmpty2)}</div>`;
      return;
    }
    const frag = document.createDocumentFragment();
    for (const id of favorites) {
      const info = pages.get(id);
      if (!info) continue;
      const row = document.createElement("div");
      row.className = "fav-row";
      row.innerHTML = `<span class="f-star">★</span><span class="f-title">${esc(info.title)}</span><span class="f-del" title="Remove">×</span>`;
      linkOpen(row.querySelector(".f-title")!, id);
      row.querySelector(".f-del")!.addEventListener("click", (e) => {
        e.stopPropagation();
        favorites.delete(id);
        saveFavorites(favorites);
        renderFavorites();
        updateFavBtn();
      });
      frag.appendChild(row);
    }
    leftBody.innerHTML = "";
    leftBody.appendChild(frag);
  }

  const updateFavBtn = (): void => {
    const on = favorites.has(currentId);
    favToggle.innerHTML = (on ? "★" : "☆") + " " + esc(s.favorite);
    favToggle.style.color = on ? "var(--swoosh)" : "";
  };

  // ---- Modes ----
  function setMode(next: Mode): void {
    mode = next;
    // Highlight the active tab in both the bottom tabs and the side strip.
    document.querySelectorAll<HTMLElement>("[data-mode]").forEach((b) => {
      b.classList.toggle("on", b.dataset.mode === next);
    });
    filterbar.style.display =
      next === "contents" || next === "index" ? "" : "none";
    searchBox.style.display = next === "search" ? "" : "none";
    leftTitle.textContent = {
      contents: s.contents,
      index: s.index,
      search: s.search,
      favorites: s.favorites,
    }[next];
    statusCount.textContent = "";
    if (next === "contents") renderTree();
    else if (next === "index") renderIndex();
    else if (next === "search") {
      runSearch(searchInput.value);
      setTimeout(() => searchInput.focus(), 0);
    } else renderFavorites();
  }
  // ---- Panel state machine (Visual Studio dock / auto-hide) ----
  // Desktop states, driven by classes on `.window`, toggled by the pushpin:
  //   docked   (default) — panel in flow, bottom tabs, no side strip.
  //   autohide           — side strip is the switcher; hovering a strip tab flies
  //                        its panel out OVER the content, beside the strip, and it
  //                        retracts on mouse-leave / document click.
  // Compact (narrow *or* short — phones portrait and landscape): the panel is a
  // drawer overlay toggled by ☰ (`flyout`). Height matters so a landscape phone
  // (wide but only ~375px tall) uses the drawer instead of the cramped docked
  // layout. Keep this query in sync with the CSS `@media` blocks.
  const win = $("#window");
  const pinBtn = $("#left-pin");
  const COMPACT_MQ = "(max-width: 640px), (max-height: 480px)";
  const narrow = (): boolean => window.matchMedia(COMPACT_MQ).matches;

  let pinned = true; // docked vs auto-hide
  // Auto-hide reveals the panel on hover, which a touch device can't do. On coarse
  // pointers (tablets) keep it docked and drop the pin toggle — the ☰ drawer covers
  // "hide the panel" on phones/short screens.
  if (coarsePointer) pinBtn.style.display = "none";

  const renderPanel = (): void => {
    win.classList.toggle("autohide", !pinned);
    if (pinned) win.classList.remove("flyout");
    pinBtn.classList.toggle("unpinned", !pinned);
    pinBtn.title = pinned ? "Auto-hide (unpin)" : "Dock (pin)";
  };
  // Reveal the fly-out panel (auto-hide on desktop, drawer on mobile).
  const flyout = (): void => {
    if (narrow() || !pinned) win.classList.add("flyout");
  };
  const retract = (): void => win.classList.remove("flyout");

  const showMode = (m: Mode): void => {
    flyout();
    setMode(m);
  };

  // ---- Content ----
  function decorate(html: string, id: string): string {
    const d = document.createElement("div");
    d.innerHTML = html;
    const h1 = d.querySelector("h1");
    const el = h1?.nextElementSibling;
    if (
      el &&
      el.tagName === "P" &&
      el.children.length === 1 &&
      el.firstElementChild?.tagName === "EM" &&
      el.firstElementChild.textContent === el.textContent
    ) {
      el.className = "sub";
      el.innerHTML = (el.firstElementChild as HTMLElement).innerHTML;
    }
    // "See also" — curated related pages (this book or, via a `docsetId:localId`
    // id, another book). `data-rel` carries the full id; links to books that aren't
    // loaded are dropped rather than shown broken.
    const related = collection.related(id).filter((rid) => pages.has(rid));
    if (related.length) {
      const links = related
        .map((rid) => {
          const title = pages.get(rid)?.title ?? rid;
          return `<a class="rel-link" data-rel="${esc(rid)}" href="#">${esc(title)}</a>`;
        })
        .join(", ");
      const sa = document.createElement("div");
      sa.className = "see-also";
      sa.innerHTML = `<b>${esc(s.seeAlso)}</b> ${links}`;
      d.appendChild(sa);
    }
    const kws = pageKeywords.get(id);
    if (kws?.length) {
      const kw = document.createElement("div");
      kw.className = "kw";
      kw.innerHTML =
        `<b>${esc(s.keywordsLabel)}</b> ` + kws.map(esc).join(", ");
      d.appendChild(kw);
    }
    return d.innerHTML;
  }

  // Resolve `asset:<path>` references to `data:` URLs (self-contained, so they load
  // inside the origin-isolated content frame where blob URLs would not). Images
  // render inline; other files become downloads.
  async function resolveAssets(root: ParentNode, pageId: string): Promise<void> {
    // Assets arrive parked in `data-asset-src`/`data-asset-href` (see
    // `parkAssetUrls`) so the browser never speculatively fetches the bare
    // `asset:` URL. Resolve to a self-contained `data:` URL, then set the real attr.
    const rewrite = async (
      el: Element,
      parked: string,
      attr: "src" | "href",
    ): Promise<void> => {
      const raw = el.getAttribute(parked) ?? "";
      el.removeAttribute(parked);
      if (!raw.startsWith("asset:")) return;
      const path = raw.slice("asset:".length);
      const blob = await collection.asset(pageId, path);
      if (!blob) {
        el.setAttribute("data-asset-missing", "");
        return;
      }
      el.setAttribute(attr, `data:${blob.mime};base64,${toBase64(blob.data)}`);
      if (attr === "href") {
        (el as HTMLAnchorElement).download = path.split("/").pop() ?? "download";
      }
    };
    const jobs: Promise<void>[] = [];
    root
      .querySelectorAll("img[data-asset-src]")
      .forEach((el) => jobs.push(rewrite(el, "data-asset-src", "src")));
    root
      .querySelectorAll("[data-asset-href]")
      .forEach((el) => jobs.push(rewrite(el, "data-asset-href", "href")));
    await Promise.all(jobs);
  }

  // Park `asset:` URLs in a data-attribute *before* the markup is ever parsed into
  // DOM, so the browser can't speculatively fetch the (invalid) `asset:` URL while
  // it sits in a detached node awaiting resolution. `resolveAssets` reads these.
  function parkAssetUrls(html: string): string {
    return html.replace(
      /\s(src|href)=("|')asset:([^"']*)\2/gi,
      ' data-asset-$1=$2asset:$3$2',
    );
  }

  // Base64-encode bytes (chunked to avoid call-stack limits on big attachments).
  function toBase64(bytes: Uint8Array): string {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  // Drop elements that could misbehave even inside the sandbox, and inline event
  // handlers. The frame (no allow-scripts) already blocks JS; this is hygiene.
  function stripDangerous(root: ParentNode): void {
    root
      .querySelectorAll(
        "script,style,iframe,object,embed,form,meta,base,link,noscript",
      )
      .forEach((el) => el.remove());
    root.querySelectorAll<HTMLElement>("*").forEach((el) => {
      for (const attr of [...el.attributes]) {
        if (attr.name.toLowerCase().startsWith("on")) {
          el.removeAttribute(attr.name);
        }
      }
    });
  }

  // Tag links for the frame bridge: internal (`#local` / see-also) links carry the
  // full page id in `data-target`; external links keep their href + `data-ext`. The
  // bridge intercepts clicks and posts them to the app. `javascript:` etc. are
  // neutralised (href removed) so they never run even with scripts enabled.
  function rewriteFrameLinks(root: ParentNode, fromId: string): void {
    root.querySelectorAll<HTMLAnchorElement>("a").forEach((a) => {
      const rel = a.getAttribute("data-rel");
      if (rel) {
        a.setAttribute("data-target", rel);
        a.setAttribute("href", "#");
        a.removeAttribute("data-rel");
        a.classList.remove("rel-link");
        return;
      }
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("#")) {
        a.setAttribute("data-target", collection.resolveLink(fromId, href.slice(1)));
        a.setAttribute("href", "#");
      } else if (/^(https?:|mailto:|tel:)/i.test(href)) {
        a.setAttribute("data-ext", href);
      } else if (!href.startsWith("data:")) {
        a.removeAttribute("href");
      }
    });
  }

  // Wrap page-body HTML into a full document for the sandboxed frame: the theme CSS
  // (the frame can't see the app stylesheet) + our trusted bridge script.
  const frameDoc = (bodyHtml: string): string =>
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="referrer" content="no-referrer">` +
    `<style>${contentCss}\n:root{--content-size:${fontSize}px}</style>` +
    `</head><body class="content">${bodyHtml}<script>${FRAME_BRIDGE}</script></body></html>`;

  // Wrap every occurrence of the active search terms in the content in <mark>,
  // skipping script/style and our keyword footer. Runs after each page load.
  function applyHighlight(root: Node): void {
    if (!highlightTerms.length) return;
    const re = new RegExp(`(${highlightTerms.map(escapeRe).join("|")})`, "giu");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        (node as Text).parentElement?.closest("script,style,mark,.kw")
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    });
    const targets: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) targets.push(n as Text);
    for (const node of targets) {
      const text = node.nodeValue ?? "";
      re.lastIndex = 0;
      if (!re.test(text)) continue;
      re.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        if (m.index > last)
          frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const mark = document.createElement("mark");
        mark.className = "hl";
        mark.textContent = m[0];
        frag.appendChild(mark);
        last = m.index + m[0].length;
        if (re.lastIndex === m.index) re.lastIndex++; // guard against empty match
      }
      if (last < text.length)
        frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode?.replaceChild(frag, node);
    }
  }

  function renderTabs(): void {
    tabstrip.innerHTML = "";
    tabs.forEach((t, i) => {
      const name =
        t.id === SEARCH_ID ? s.search : (pages.get(t.id)?.title ?? t.id);
      const tab = document.createElement("div");
      tab.className = "doctab" + (i === active ? " active" : "");
      tab.innerHTML =
        `<span class="dt-name">${esc(name)}</span>` +
        (tabs.length > 1
          ? '<span class="dt-x" title="Close tab">×</span>'
          : "");
      tab.addEventListener("click", () => activateTab(i));
      tab.addEventListener("auxclick", (e) => {
        if (e.button === 1) {
          e.preventDefault();
          closeTab(i);
        }
      });
      tab.querySelector(".dt-x")?.addEventListener("click", (e) => {
        e.stopPropagation();
        closeTab(i);
      });
      tabstrip.appendChild(tab);
    });
    tabstrip.children[active]?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
    });
  }

  function activateTab(i: number): void {
    active = i;
    const t = tabs[i];
    if (t) loadContent(t.id);
    else renderTabs();
  }

  function closeTab(i: number): void {
    if (tabs.length <= 1) return;
    tabs.splice(i, 1);
    if (i < active || active >= tabs.length) active = Math.max(0, active - 1);
    const t = tabs[active];
    if (t) loadContent(t.id);
  }

  async function loadContent(id: string): Promise<void> {
    currentId = id;
    const token = ++loadSeq;
    persistTabs(); // tabs/active are settled by the caller before we render
    if (id === SEARCH_ID) {
      renderSearchPage(); // app UI, rendered into #content (not the sandbox)
      frame.style.display = "none";
      content.style.display = "";
      return;
    }
    const info = pages.get(id);
    // A streamed page body may take a round-trip; show the intended title now.
    status.textContent = s.ready;
    const page = await collection.page(id);
    if (token !== loadSeq) return; // a newer navigation superseded this one
    const title = page?.title ?? info?.title ?? id;
    if (page) {
      // Build in a detached container (parent origin — full DOM access), then hand
      // the serialized HTML to the sandboxed frame, which isolates the untrusted
      // docset markup from the app's origin.
      const holder = document.createElement("div");
      holder.innerHTML = decorate(parkAssetUrls(page.bodyHtml), id);
      stripDangerous(holder);
      await resolveAssets(holder, id); // parked asset: → data: (may stream)
      if (token !== loadSeq) return;
      applyHighlight(holder);
      rewriteFrameLinks(holder, id);
      frame.srcdoc = frameDoc(holder.innerHTML);
    } else {
      frame.srcdoc = frameDoc(
        `<h1>${esc(s.notFoundTitle)}</h1><p>${s.notFoundBody(esc(id))}</p>`,
      );
    }
    frame.style.display = "";
    content.style.display = "none";
    document.title = `${title} — kdhelp`;
    const { docsetId, localId } = collection.split(id);
    address.value = `ms-help://${docsetId}/${localId}.htm`;
    renderTabs();
    updateFavBtn();
    if (mode === "contents") revealCurrent();
    else highlightTree();
    // Reflect the current page in the URL for deep-linking/bookmarking, but with
    // replaceState so it doesn't build a *browser* history that would fight the
    // per-tab Back/Forward (the toolbar buttons own navigation now).
    if (location.hash.slice(1) !== id) history.replaceState(null, "", `#${id}`);
    status.textContent = s.ready;
  }

  function openPage(id: string, newTab = false): void {
    const t = tabs[active];
    if (newTab || active < 0 || !t) {
      tabs.push(mkTab(id));
      active = tabs.length - 1;
    } else if (t.id !== id) {
      // Navigate the active tab: drop any forward history, then push.
      t.hist = t.hist.slice(0, t.pos + 1);
      t.hist.push(id);
      t.pos = t.hist.length - 1;
      t.id = id;
    }
    loadContent(id);
    // Close the drawer (mobile) or retract the auto-hide fly-out after a pick.
    if (narrow() || !pinned) retract();
  }

  // Back/Forward move within the *active* tab's own history only.
  function goHistory(delta: number): void {
    const t = tabs[active];
    if (!t) return;
    const next = t.pos + delta;
    if (next < 0 || next >= t.hist.length) return;
    t.pos = next;
    t.id = t.hist[next]!;
    loadContent(t.id);
  }

  // ---- Actions (menu / toolbar / tabs) ----
  function runAction(action: string): void {
    switch (action) {
      case "mode-contents":
        showMode("contents");
        break;
      case "mode-index":
        showMode("index");
        break;
      case "mode-search":
        showMode("search");
        break;
      case "mode-favorites":
        showMode("favorites");
        break;
      case "sync":
        syncTree();
        break;
      case "back":
        goHistory(-1);
        break;
      case "forward":
        goHistory(1);
        break;
      case "font-up":
        fontSize = Math.min(20, fontSize + 1);
        setFrameFont();
        break;
      case "font-down":
        fontSize = Math.max(11, fontSize - 1);
        setFrameFont();
        break;
      case "print":
        window.print();
        break;
      case "clear-highlight":
        highlightTerms = [];
        loadContent(currentId);
        break;
      case "find":
        status.textContent = "Use your browser Find (Ctrl/⌘-F).";
        break;
      case "open-docset":
        pickDocset();
        break;
      case "open-url":
        openUrl();
        break;
      case "manage-docsets":
        void showLibrary();
        break;
      case "about":
        showAbout();
        break;
    }
  }

  // ---- Menu bar ----
  const menubar = $("#menubar");
  menubar
    .querySelectorAll<HTMLElement>(".menu > .menu-label")
    .forEach((label) => {
      label.addEventListener("click", (e) => {
        e.stopPropagation();
        const menu = label.parentElement!;
        const wasOpen = menu.classList.contains("open");
        menubar
          .querySelectorAll(".menu")
          .forEach((m) => m.classList.remove("open"));
        menu.classList.toggle("open", !wasOpen);
      });
    });
  document.addEventListener("click", () =>
    menubar
      .querySelectorAll(".menu")
      .forEach((m) => m.classList.remove("open")),
  );

  // Delegated action handling for menu items, toolbar and left-tabs.
  document.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (el) runAction(el.dataset.action!);
  });

  // ---- About modal ----
  function showAbout(): void {
    const bg = document.createElement("div");
    bg.style.cssText =
      "position:fixed;inset:0;background:rgba(20,35,60,.35);display:grid;place-items:center;z-index:50";
    bg.innerHTML =
      '<div style="width:420px;background:var(--chrome-top);border:1px solid #17335c;border-radius:3px;box-shadow:0 12px 40px rgba(0,0,0,.5);overflow:hidden">' +
      '<div style="background:linear-gradient(180deg,var(--title-top),var(--title-bot));color:#fff;font-weight:bold;padding:6px 10px">About kdhelp</div>' +
      '<div style="padding:16px 18px;line-height:1.6"><div style="font-size:15px;font-weight:bold;color:var(--content-h)">kdhelp</div>' +
      `<div>${esc(s.aboutTagline)}</div>` +
      `<p style="color:#5b6675;margin:.8em 0 0">${esc(s.aboutLanguage)} <b>${esc(collection.language)}</b></p></div>` +
      '<div style="padding:10px 16px;text-align:right;border-top:1px solid var(--chrome-border)"><button style="font-family:var(--font-ui);font-size:12px;padding:4px 16px;border:1px solid #16305a;border-radius:2px;background:linear-gradient(180deg,#eef4fd,#cbd9ec);cursor:pointer">OK</button></div></div>';
    const close = (): void => bg.remove();
    bg.addEventListener("click", (e) => {
      if (e.target === bg || (e.target as HTMLElement).tagName === "BUTTON")
        close();
    });
    document.body.appendChild(bg);
  }

  // ---- Library: open / manage user docsets ----
  function pickDocset(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".khb,.khba";
    input.multiple = true; // a .khb plus any number of sidecar .khba packs
    input.addEventListener("change", () => {
      const files = [...(input.files ?? [])];
      const khb = files.find((f) => f.name.toLowerCase().endsWith(".khb"));
      const khba = files.filter((f) => f.name.toLowerCase().endsWith(".khba"));
      if (khb) void uploadDocset(khb, khba);
    });
    input.click();
  }

  // Add a remote (online) docset by URL, merged into the collection each session.
  // Two modes: whole-fetch (default) or **stream** — opened page-by-page over HTTP
  // `Range` (real FTS5), never downloaded whole. Streaming needs a Range-capable,
  // CORS-reachable host serving the `.khb` uncompressed.
  function openUrl(): void {
    const btn =
      "font-family:var(--font-ui);font-size:12px;padding:4px 16px;border:1px solid #16305a;border-radius:2px;cursor:pointer";
    const bg = document.createElement("div");
    bg.style.cssText =
      "position:fixed;inset:0;background:rgba(20,35,60,.35);display:grid;place-items:center;z-index:50";
    bg.innerHTML =
      '<div style="width:480px;max-width:92vw;background:var(--chrome-top);border:1px solid #17335c;border-radius:3px;box-shadow:0 12px 40px rgba(0,0,0,.5);overflow:hidden">' +
      `<div style="background:linear-gradient(180deg,var(--title-top),var(--title-bot));color:#fff;font-weight:bold;padding:6px 10px">${esc(s.openUrlTitle)}</div>` +
      `<div style="padding:14px 18px"><div style="color:var(--muted);margin-bottom:6px">${esc(s.openUrlHint)}</div>` +
      '<input class="url-in" type="url" placeholder="https://…/docs.khb" spellcheck="false" style="width:100%;font-family:var(--font-mono);font-size:12px;padding:5px 7px;border:1px solid #7f9bc0;border-radius:2px;box-sizing:border-box">' +
      `<label style="display:flex;align-items:center;gap:6px;margin-top:8px;color:var(--content-fg);font-size:12px;cursor:pointer"><input class="url-stream" type="checkbox"> ${esc(s.streamOption)}</label>` +
      `<div style="color:var(--muted);font-size:11px;margin-top:2px;margin-left:22px">${esc(s.streamHint)}</div>` +
      `<div class="url-sidecars-row" style="display:none;margin-top:8px"><div style="color:var(--muted);font-size:11px;margin-bottom:3px">${esc(s.streamSidecars)}</div>` +
      '<textarea class="url-sidecars" rows="2" spellcheck="false" placeholder="https://…/docs.khba" style="width:100%;font-family:var(--font-mono);font-size:12px;padding:5px 7px;border:1px solid #7f9bc0;border-radius:2px;box-sizing:border-box;resize:vertical"></textarea></div>' +
      '<div class="url-err" style="color:#a33;font-size:11px;min-height:15px;margin-top:5px"></div></div>' +
      '<div style="padding:10px 16px;border-top:1px solid var(--chrome-border);display:flex;gap:8px;justify-content:flex-end">' +
      `<button class="url-cancel" style="${btn};background:#eef1f6">${esc(s.cancel)}</button>` +
      `<button class="url-add" style="${btn};background:linear-gradient(180deg,#eef4fd,#cbd9ec)">${esc(s.add)}</button></div></div>`;
    const input = bg.querySelector<HTMLInputElement>(".url-in")!;
    const stream = bg.querySelector<HTMLInputElement>(".url-stream")!;
    const sidecarsRow = bg.querySelector<HTMLElement>(".url-sidecars-row")!;
    const sidecars = bg.querySelector<HTMLTextAreaElement>(".url-sidecars")!;
    const err = bg.querySelector<HTMLElement>(".url-err")!;
    const add = bg.querySelector<HTMLButtonElement>(".url-add")!;
    // Sidecar packs only make sense for a streamed docset.
    stream.addEventListener("change", () => {
      sidecarsRow.style.display = stream.checked ? "" : "none";
    });
    const submit = async (): Promise<void> => {
      const url = input.value.trim();
      if (!url) return;
      const streaming = stream.checked;
      const packs = streaming
        ? sidecars.value.split(/\s+/).map((u) => u.trim()).filter(Boolean)
        : [];
      err.style.color = "var(--muted)";
      err.textContent = s.openUrlChecking;
      add.disabled = true;
      try {
        // Validate: streaming needs a Range-served `.khb` (peek); whole-fetch reads it.
        if (streaming) {
          const { StreamingDocset } = await import("./data/streaming-docset");
          await StreamingDocset.peek(url);
        } else (await Docset.open(await fetchDocsetBytes(url))).close();
        addRemote(url, streaming, packs);
        location.reload();
      } catch {
        err.style.color = "#a33";
        err.textContent = s.openUrlError;
        add.disabled = false;
      }
    };
    add.addEventListener("click", () => void submit());
    bg.querySelector(".url-cancel")!.addEventListener("click", () => bg.remove());
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void submit();
    });
    bg.addEventListener("click", (e) => {
      if (e.target === bg) bg.remove();
    });
    document.body.appendChild(bg);
    setTimeout(() => input.focus(), 0);
  }

  async function uploadDocset(
    file: File,
    attachmentFiles: File[] = [],
  ): Promise<void> {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const attachments = await Promise.all(
        attachmentFiles.map(
          async (f) => new Uint8Array(await f.arrayBuffer()),
        ),
      );
      const ds = await Docset.open(bytes, attachments); // validates + reads meta
      await putDocset({
        id: ds.id,
        language: ds.language,
        title: ds.title,
        bytes,
        attachments,
      });
      if (ds.language !== lang) {
        try {
          localStorage.setItem(LANG_KEY, ds.language);
        } catch {
          /* ignore */
        }
      }
      location.reload();
    } catch {
      status.textContent = s.uploadError;
    }
  }

  async function showLibrary(): Promise<void> {
    const uploaded = await allDocsets();
    const rmBtn =
      'font-family:var(--font-ui);font-size:12px;padding:3px 10px;border:1px solid #b3462f;border-radius:2px;background:#fdeeea;color:#a33;cursor:pointer';
    const row = (label: string, attr: string): string =>
      `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--rule)"><span style="flex:1;overflow:hidden;text-overflow:ellipsis">${label}</span><button ${attr} style="${rmBtn}">${esc(s.remove)}</button></div>`;
    const uploadedRows = uploaded.length
      ? uploaded
          .map((d) =>
            row(
              `${esc(d.title)} <span style="color:var(--muted)">(${esc(d.language)})</span>`,
              `data-remove="${esc(d.id)}"`,
            ),
          )
          .join("")
      : `<div style="color:var(--muted);padding:6px 0">${esc(s.noUploaded)}</div>`;
    const remoteList = getRemotes();
    const remoteRows = remoteList
      .map((e) =>
        row(
          `<span style="font-family:var(--font-mono);font-size:11px">${esc(e.url)}</span>` +
            (e.streaming
              ? ` <span style="font-size:10px;color:var(--muted)">${esc(s.streamingBadge)}</span>`
              : ""),
          `data-remove-url="${esc(e.url)}"`,
        ),
      )
      .join("");
    const rows =
      uploadedRows +
      (remoteList.length
        ? `<div style="margin-top:12px;color:var(--content-h);font-weight:bold">${esc(s.remotesTitle)}</div>${remoteRows}`
        : "");
    const bg = document.createElement("div");
    bg.style.cssText =
      "position:fixed;inset:0;background:rgba(20,35,60,.35);display:grid;place-items:center;z-index:50";
    bg.innerHTML =
      '<div style="width:460px;max-width:92vw;background:var(--chrome-top);border:1px solid #17335c;border-radius:3px;box-shadow:0 12px 40px rgba(0,0,0,.5);overflow:hidden">' +
      `<div style="background:linear-gradient(180deg,var(--title-top),var(--title-bot));color:#fff;font-weight:bold;padding:6px 10px">${esc(s.uploadedTitle)}</div>` +
      `<div style="padding:14px 18px;line-height:1.5;max-height:50vh;overflow:auto">${rows}</div>` +
      '<div style="padding:10px 16px;text-align:right;border-top:1px solid var(--chrome-border)"><button class="lib-ok" style="font-family:var(--font-ui);font-size:12px;padding:4px 16px;border:1px solid #16305a;border-radius:2px;background:linear-gradient(180deg,#eef4fd,#cbd9ec);cursor:pointer">OK</button></div></div>';
    bg.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const rm = t.getAttribute("data-remove");
      const rmUrl = t.getAttribute("data-remove-url");
      if (rm) {
        void deleteDocset(rm).then(() => location.reload());
      } else if (rmUrl) {
        removeRemote(rmUrl);
        location.reload();
      } else if (t === bg || t.classList.contains("lib-ok")) {
        bg.remove();
      }
    });
    document.body.appendChild(bg);
  }

  // ---- Other wiring ----
  for (const c of collection.categories()) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.title;
    filterSel.appendChild(o);
  }
  filterSel.addEventListener("change", () => {
    filterCategory = filterSel.value;
    if (mode === "contents") renderTree();
    else if (mode === "index") renderIndex();
  });

  // Product (family) scope — only meaningful when more than one family is loaded.
  const productSel = $<HTMLSelectElement>("#filter-product");
  const families = collection.families();
  if (families.length > 1) {
    for (const f of families) {
      const o = document.createElement("option");
      o.value = f.id;
      o.textContent = f.title;
      productSel.appendChild(o);
    }
    $("#filter-product-row").style.display = "";
  }
  productSel.addEventListener("change", () => {
    filterProduct = productSel.value;
    if (mode === "contents") renderTree();
    else if (mode === "index") renderIndex();
  });

  // Language switcher: persist + reload (the content docset changes with the UI).
  // Language selectors — the toolbar one and the mobile ⋯-menu one behave alike.
  const langNames: Record<string, string> = { en: "English", pl: "Polski" };
  document.querySelectorAll<HTMLSelectElement>(".lang-select").forEach((sel) => {
    for (const l of available) {
      if (![...sel.options].some((o) => o.value === l)) {
        const opt = document.createElement("option");
        opt.value = l;
        opt.textContent = langNames[l] ?? l;
        sel.appendChild(opt);
      }
    }
    for (const opt of Array.from(sel.options)) {
      opt.disabled = !available.includes(opt.value);
    }
    sel.value = lang;
    sel.addEventListener("change", () => {
      try {
        localStorage.setItem(LANG_KEY, sel.value);
      } catch {
        /* ignore storage errors */
      }
      location.reload();
    });
  });

  // Mobile overflow (⋯) menu — the actions inside reuse the global data-action
  // delegation; here we just toggle the dropdown and close it on outside click.
  const moreBtn = $("#btn-more");
  const moreMenu = $("#more-menu");
  moreBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (moreMenu.hidden) {
      const r = moreBtn.getBoundingClientRect();
      moreMenu.style.top = `${Math.round(r.bottom + 2)}px`;
      moreMenu.style.left = `${Math.round(r.left)}px`;
    }
    moreMenu.hidden = !moreMenu.hidden;
  });
  moreMenu.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest(".more-item")) moreMenu.hidden = true;
  });
  document.addEventListener("click", (e) => {
    if (!moreMenu.hidden && !moreMenu.contains(e.target as Node)) {
      moreMenu.hidden = true;
    }
  });

  let searchTimer = 0;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => runSearch(searchInput.value), 160);
  });
  // Enter opens the roomy Search page (in the document area) for the full results.
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && searchInput.value.trim()) {
      e.preventDefault();
      openSearchPage(searchInput.value);
      if (narrow() || !pinned) retract();
    }
  });

  address.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const v = address.value.trim();
    const m = v.match(/ms-help:\/\/([^/]+)\/([^/]+?)(?:\.htm)?$/);
    if (m) openPage(`${m[1]}:${m[2]}`);
    else openPage(v.includes(":") ? v : collection.resolveLink(currentId, v));
  });

  favToggle.addEventListener("click", () => {
    if (favorites.has(currentId)) favorites.delete(currentId);
    else favorites.add(currentId);
    saveFavorites(favorites);
    updateFavBtn();
    if (mode === "favorites") renderFavorites();
  });
  // ＋ opens the current page in a new tab.
  $("#tab-new").addEventListener("click", () => openPage(currentId, true));

  // Live font size — a display-only message to the frame (no srcdoc rebuild).
  const setFrameFont = (): void => {
    frame.contentWindow?.postMessage(
      { t: "kdhelp-app", a: "font", size: fontSize },
      "*",
    );
  };

  // The only inbound channel from the sandboxed frame. Everything here is treated
  // as untrusted (a hostile docset's JS could also post): verify the source is our
  // frame, require a known shape, and keep every action safe-by-design — `open`
  // just routes (unknown id → "not found"); `ext` only opens vetted URL schemes.
  window.addEventListener("message", (e) => {
    if (e.source !== frame.contentWindow) return;
    const d = e.data as {
      t?: unknown;
      a?: unknown;
      id?: unknown;
      url?: unknown;
      newTab?: unknown;
    };
    if (!d || d.t !== "kdhelp") return;
    if (d.a === "open" && typeof d.id === "string") {
      openPage(d.id, d.newTab === true);
    } else if (
      d.a === "ext" &&
      typeof d.url === "string" &&
      /^(https?:|mailto:|tel:)/i.test(d.url)
    ) {
      window.open(d.url, "_blank", "noopener,noreferrer");
    }
  });

  // Page-body links live inside the sandboxed frame; the bridge posts clicks here.
  window.addEventListener("hashchange", () => {
    const id = location.hash.slice(1);
    if (id && id !== currentId) openPage(id);
  });

  // Splitter
  (function () {
    const sp = $("#splitter");
    const left = $<HTMLElement>("#left-pane");
    let drag = false;
    sp.addEventListener("mousedown", (e) => {
      drag = true;
      document.body.style.cursor = "col-resize";
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!drag) return;
      const box = $(".body").getBoundingClientRect();
      const w = Math.max(
        170,
        Math.min(box.width * 0.6, e.clientX - box.left - 5),
      );
      left.style.width = `${w}px`;
    });
    window.addEventListener("mouseup", () => {
      drag = false;
      document.body.style.cursor = "";
    });
  })();

  // Panel wiring
  // ☰ (mobile) toggles the drawer.
  $("#btn-pane").addEventListener("click", () =>
    win.classList.contains("flyout") ? retract() : flyout(),
  );
  // 📌 toggles dock <-> auto-hide.
  pinBtn.addEventListener("click", () => {
    pinned = !pinned;
    renderPanel();
  });
  $("#scrim").addEventListener("click", retract);

  // Touch swipes: open the drawer with a right-swipe from the left edge, close it
  // with a left-swipe on the drawer or scrim. Only clearly-horizontal drags fire,
  // so vertical scrolling in the tree/content is untouched.
  const onSwipe = (
    el: HTMLElement,
    dir: "left" | "right",
    action: () => void,
  ): void => {
    let x0 = 0;
    let y0 = 0;
    let live = false;
    el.addEventListener(
      "touchstart",
      (e) => {
        const t = e.touches[0];
        if (!t) return;
        x0 = t.clientX;
        y0 = t.clientY;
        live = true;
      },
      { passive: true },
    );
    el.addEventListener(
      "touchmove",
      (e) => {
        const t = e.touches[0];
        if (!live || !t) return;
        const dx = t.clientX - x0;
        const dy = t.clientY - y0;
        if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
        live = false;
        if ((dir === "right" && dx > 0) || (dir === "left" && dx < 0)) action();
      },
      { passive: true },
    );
    el.addEventListener("touchend", () => {
      live = false;
    });
  };
  onSwipe($("#edge-swipe"), "right", () => {
    if (narrow()) flyout();
  });
  onSwipe($("#left-pane"), "left", retract);
  onSwipe($("#scrim"), "left", retract);
  // Strip » re-docks (pins) the panel.
  $("#strip-exp").addEventListener("click", () => {
    pinned = true;
    renderPanel();
  });

  // Auto-hide: hovering a specific side tab flies out *that* mode next to the strip.
  const strip = $("#left-strip");
  strip
    .querySelectorAll<HTMLElement>('button[data-action^="mode-"]')
    .forEach((btn) => {
      btn.addEventListener("mouseenter", () => runAction(btn.dataset.action!));
    });
  // Retract when the mouse leaves the panel (unless it moved onto the strip) or a
  // click lands in the document.
  $("#left-pane").addEventListener("mouseleave", (e) => {
    if (narrow()) return;
    const to = e.relatedTarget;
    if (to instanceof Node && strip.contains(to)) return;
    retract();
  });
  contentWrap.addEventListener("mousedown", () => {
    if (!pinned) retract();
  });
  renderPanel();

  // ---- Start ----
  setMode("contents");
  // A hash deep link, if any (our own navigation also parks the current page here,
  // so it usually just names the session's active page on reload).
  const deepLink = pages.has(location.hash.slice(1)) ? location.hash.slice(1) : "";
  const firstPageId = pages.keys().next().value ?? "";
  const validTab = (t: { id: string }): boolean =>
    t.id === SEARCH_ID || pages.has(t.id);
  const saved = loadTabs();
  const restored = (saved?.tabs ?? []).filter(validTab);
  if (restored.length) {
    // Restore the previous session's tabs + active tab first — never let the hash
    // (which we set on every navigation) collapse it back to a single tab. Each
    // restored tab starts a fresh (single-entry) back/forward history.
    tabs.push(...restored.map((t) => mkTab(t.id, t.query)));
    active = Math.min(Math.max(0, saved?.active ?? 0), tabs.length - 1);
    const openIdx = deepLink ? tabs.findIndex((t) => t.id === deepLink) : -1;
    if (deepLink && openIdx === -1) {
      openPage(deepLink, true); // a genuine deep link to a page not in the session
    } else {
      if (openIdx !== -1) active = openIdx; // focus the deep-linked tab if present
      void loadContent(tabs[active]!.id);
    }
  } else if (deepLink) {
    openPage(deepLink);
  } else {
    openPage(firstPageId);
  }
}

// ---------------------------------------------------------------------------
bootstrap().catch((err: unknown) => {
  const content = document.querySelector("#content");
  if (content)
    content.innerHTML = `<h1>Failed to load</h1><pre>${String(err)}</pre>`;
  // eslint-disable-next-line no-console
  console.error(err);
});
