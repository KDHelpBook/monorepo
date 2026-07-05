import "./styles/main.css";
// The page-body typography, injected as a string into the sandboxed content frame.
import contentCss from "./styles/content.css?inline";
import { Collection, type DocsetSource } from "./data/collection";
import { Docset, type TocNode } from "./data/docset";
import { allDocsets, deleteDocset, putDocset } from "./data/library";
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

  // Uploaded docsets extend both the available languages and the current collection.
  const uploadedAll = config.externalSources ? await allDocsets() : [];
  const available = [
    ...new Set([
      ...manifest.docsets.map((d) => d.language),
      ...uploadedAll.map((d) => d.language),
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
  const sources = [...bundled, ...uploaded];
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
        '[data-action="open-docset"], [data-action="manage-docsets"]',
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
  const favorites = new Set<string>();
  // A tab is a docset page, or the full Search results page (id === SEARCH_ID,
  // which carries its query + the last scroll of scope/sort controls).
  const SEARCH_ID = "@search";
  const tabs: { id: string; query?: string }[] = [];
  let active = -1;
  const searchScope = { category: "", product: "", sort: "rank" };
  let currentId = "";
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
  const isAncestorOfCurrent = (id: string): boolean =>
    (pages.get(currentId)?.path ?? []).includes(id);

  function treeNode(n: TocNode, forceOpen = false): HTMLLIElement {
    const li = document.createElement("li");
    const kids = n.children.length > 0;
    const row = document.createElement("div");
    row.className = "node" + (n.group ? " group" : "");
    row.dataset.id = n.pageId;
    const open =
      forceOpen || isAncestorOfCurrent(n.pageId) || n.pageId === currentId;
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
      };
      twistyEl.addEventListener("click", (e) => {
        e.stopPropagation();
        toggle();
      });
      // A family folder has no page — clicking its row just expands/collapses.
      if (n.group) row.addEventListener("click", toggle);
    }
    if (!n.group) linkOpen(row, n.pageId);
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
    const info = pages.get(currentId);
    if (!info) return;
    for (const id of [...info.path, currentId]) {
      const row = leftBody.querySelector<HTMLElement>(
        `.node[data-id="${CSS.escape(id)}"]`,
      );
      const sub = row?.parentElement?.querySelector<HTMLElement>(":scope > ul");
      if (sub) {
        sub.style.display = "";
        const t = row?.querySelector(".twisty");
        if (t) t.textContent = "−";
      }
    }
    leftBody
      .querySelector(`.node[data-id="${CSS.escape(currentId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
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

  function runSearch(query: string): void {
    const q = query.trim();
    if (!q) {
      highlightTerms = [];
      leftBody.innerHTML = `<div class="empty">${esc(s.searchPrompt)}</div>`;
      statusCount.textContent = "";
      return;
    }
    const results = collection.search(q, 40);
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
      tabs.push({ id: SEARCH_ID, query });
      active = tabs.length - 1;
    }
    loadContent(SEARCH_ID);
  }

  // Apply the scope/sort controls to a raw search over the whole collection.
  function searchPageResults(query: string): ReturnType<Collection["search"]> {
    let hits = collection.search(query, 200);
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

  function renderSearchResults(query: string): void {
    const box = $("#sp-results");
    const countEl = $("#sp-count");
    const q = query.trim();
    if (!q) {
      box.innerHTML = `<div class="empty">${esc(s.searchPrompt)}</div>`;
      countEl.textContent = "";
      return;
    }
    const hits = searchPageResults(q);
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
    const rerun = (): void => renderSearchResults(tabs[active]?.query ?? "");
    $("#sp-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const v = $<HTMLInputElement>("#sp-q").value;
      const t = tabs[active];
      if (t) t.query = v;
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
  // Narrow (<=640px): the panel is always a drawer overlay toggled by ☰ (`flyout`).
  const win = $("#window");
  const pinBtn = $("#left-pin");
  const narrow = (): boolean => window.matchMedia("(max-width: 640px)").matches;

  let pinned = true; // docked vs auto-hide

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
  function resolveAssets(root: ParentNode, pageId: string): void {
    const rewrite = (el: Element, attr: "src" | "href"): void => {
      const raw = el.getAttribute(attr);
      if (!raw || !raw.startsWith("asset:")) return;
      const path = raw.slice("asset:".length);
      const blob = collection.asset(pageId, path);
      if (!blob) {
        el.removeAttribute(attr);
        el.setAttribute("data-asset-missing", "");
        return;
      }
      el.setAttribute(attr, `data:${blob.mime};base64,${toBase64(blob.data)}`);
      if (attr === "href") {
        (el as HTMLAnchorElement).download = path.split("/").pop() ?? "download";
      }
    };
    root.querySelectorAll("img[src^='asset:']").forEach((el) => rewrite(el, "src"));
    root.querySelectorAll("a[href^='asset:']").forEach((el) => rewrite(el, "href"));
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

  // Retarget links for the sandboxed frame: internal (`#local` / see-also) links
  // navigate the top window's hash (→ our router); external links open a new tab;
  // anything else is neutralised.
  function rewriteFrameLinks(root: ParentNode, fromId: string): void {
    root.querySelectorAll<HTMLAnchorElement>("a").forEach((a) => {
      const rel = a.getAttribute("data-rel");
      if (rel) {
        a.setAttribute("href", `#${rel}`);
        a.setAttribute("target", "_top");
        a.removeAttribute("data-rel");
        a.classList.remove("rel-link");
        return;
      }
      const href = a.getAttribute("href") ?? "";
      if (href.startsWith("#")) {
        a.setAttribute("href", `#${collection.resolveLink(fromId, href.slice(1))}`);
        a.setAttribute("target", "_top");
      } else if (/^(https?:|mailto:|tel:)/i.test(href)) {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
      } else if (!href.startsWith("data:")) {
        a.removeAttribute("href"); // e.g. javascript: — inert in the sandbox anyway
      }
    });
  }

  // Wrap page-body HTML into a full document for the sandboxed frame, injecting the
  // theme CSS (the frame is isolated and can't see the app stylesheet).
  const frameDoc = (bodyHtml: string): string =>
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="referrer" content="no-referrer">` +
    `<style>${contentCss}\n:root{--content-size:${fontSize}px}</style>` +
    `</head><body class="content">${bodyHtml}</body></html>`;

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

  function loadContent(id: string): void {
    currentId = id;
    if (id === SEARCH_ID) {
      renderSearchPage(); // app UI, rendered into #content (not the sandbox)
      frame.style.display = "none";
      content.style.display = "";
      return;
    }
    const info = pages.get(id);
    const page = collection.page(id);
    const title = page?.title ?? info?.title ?? id;
    if (page) {
      // Build in a detached container (parent origin — full DOM access), then hand
      // the serialized HTML to the sandboxed frame, which isolates the untrusted
      // docset markup from the app's origin.
      const holder = document.createElement("div");
      holder.innerHTML = decorate(page.bodyHtml, id);
      stripDangerous(holder);
      resolveAssets(holder, id); // asset: → data:
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
    if (mode === "contents") renderTree();
    else highlightTree();
    if (location.hash.slice(1) !== id) location.hash = id;
    status.textContent = s.ready;
  }

  function openPage(id: string, newTab = false): void {
    if (newTab || active < 0) {
      tabs.push({ id });
      active = tabs.length - 1;
    } else {
      const t = tabs[active];
      if (t) t.id = id;
    }
    loadContent(id);
    // Close the drawer (mobile) or retract the auto-hide fly-out after a pick.
    if (narrow() || !pinned) retract();
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
        history.back();
        break;
      case "forward":
        history.forward();
        break;
      case "font-up":
        fontSize = Math.min(20, fontSize + 1);
        if (currentId !== SEARCH_ID) loadContent(currentId); // re-inject frame CSS
        break;
      case "font-down":
        fontSize = Math.max(11, fontSize - 1);
        if (currentId !== SEARCH_ID) loadContent(currentId);
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
    const rows = uploaded.length
      ? uploaded
          .map(
            (d) =>
              `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--rule)"><span style="flex:1">${esc(d.title)} <span style="color:var(--muted)">(${esc(d.language)})</span></span><button data-remove="${esc(d.id)}" style="font-family:var(--font-ui);font-size:12px;padding:3px 10px;border:1px solid #b3462f;border-radius:2px;background:#fdeeea;color:#a33;cursor:pointer">${esc(s.remove)}</button></div>`,
          )
          .join("")
      : `<div style="color:var(--muted);padding:6px 0">${esc(s.noUploaded)}</div>`;
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
      if (rm) {
        void deleteDocset(rm).then(() => location.reload());
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
  const langSel = $<HTMLSelectElement>("#lang-select");
  const langNames: Record<string, string> = { en: "English", pl: "Polski" };
  for (const l of available) {
    if (![...langSel.options].some((o) => o.value === l)) {
      const opt = document.createElement("option");
      opt.value = l;
      opt.textContent = langNames[l] ?? l;
      langSel.appendChild(opt);
    }
  }
  for (const opt of Array.from(langSel.options)) {
    opt.disabled = !available.includes(opt.value);
  }
  langSel.value = lang;
  langSel.addEventListener("change", () => {
    try {
      localStorage.setItem(LANG_KEY, langSel.value);
    } catch {
      /* ignore storage errors */
    }
    location.reload();
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
    updateFavBtn();
    if (mode === "favorites") renderFavorites();
  });
  // ＋ opens the current page in a new tab.
  $("#tab-new").addEventListener("click", () => openPage(currentId, true));

  // Page-body links live inside the sandboxed frame and navigate the top window's
  // hash (see rewriteFrameLinks) — handled by the hashchange listener below.
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
  const startId = location.hash.slice(1);
  // The first real page (the toc roots may be family folders, which aren't pages).
  const firstPageId = pages.keys().next().value ?? "";
  openPage(pages.has(startId) ? startId : firstPageId);
}

// ---------------------------------------------------------------------------
bootstrap().catch((err: unknown) => {
  const content = document.querySelector("#content");
  if (content)
    content.innerHTML = `<h1>Failed to load</h1><pre>${String(err)}</pre>`;
  // eslint-disable-next-line no-console
  console.error(err);
});
