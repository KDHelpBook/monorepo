import "./styles/main.css";
import { Collection } from "./data/collection";
import type { TocNode } from "./data/docset";

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
  file: string;
  id: string;
  title: string;
  language: string;
  mode: string;
}
interface Manifest {
  docsets: ManifestEntry[];
}

async function loadCollection(language: string): Promise<Collection> {
  const manifestRes = await fetch("docsets.json");
  const manifest = (await manifestRes.json()) as Manifest;
  const entries = manifest.docsets.filter((d) => d.language === language);
  if (!entries.length) throw new Error(`no docsets for language "${language}"`);
  return Collection.load(entries, language);
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

function start(collection: Collection): void {
  const leftBody = $("#left-body");
  const leftTitle = $("#left-title");
  const content = $("#content");
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
  let currentId = "";
  let mode: Mode = "contents";
  let filterCategory = "";
  let fontSize = 13;

  const toc = collection.tocTree();
  (function buildPages(nodes: TocNode[], path: string[]) {
    for (const n of nodes) {
      pages.set(n.pageId, {
        title: n.title,
        path: [...path],
        hasChildren: n.children.length > 0,
      });
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

  // ---- Contents tree ----
  const isAncestorOfCurrent = (id: string): boolean =>
    (pages.get(currentId)?.path ?? []).includes(id);

  function treeNode(n: TocNode): HTMLLIElement {
    const li = document.createElement("li");
    const kids = n.children.length > 0;
    const row = document.createElement("div");
    row.className = "node";
    row.dataset.id = n.pageId;
    const open = isAncestorOfCurrent(n.pageId) || n.pageId === currentId;
    row.innerHTML =
      `<span class="twisty ${kids ? "" : "leaf"}">${kids ? (open ? "−" : "+") : ""}</span>` +
      pageIcon(kids) +
      `<span class="label">${esc(n.title)}</span>`;
    li.appendChild(row);
    if (kids) {
      const sub = document.createElement("ul");
      sub.style.display = open ? "" : "none";
      for (const c of n.children) sub.appendChild(treeNode(c));
      li.appendChild(sub);
      row.querySelector(".twisty")!.addEventListener("click", (e) => {
        e.stopPropagation();
        const showing = sub.style.display !== "none";
        sub.style.display = showing ? "none" : "";
        row.querySelector(".twisty")!.textContent = showing ? "+" : "−";
      });
    }
    row.addEventListener("click", () => openPage(n.pageId));
    return li;
  }

  function renderTree(): void {
    leftBody.innerHTML = "";
    if (filterCategory) {
      const ids = new Set(collection.pagesByCategory(filterCategory));
      const list = document.createElement("div");
      list.className = "index-list";
      for (const [id, info] of pages) {
        if (!ids.has(id)) continue;
        const row = document.createElement("div");
        row.className = "node";
        row.dataset.id = id;
        row.innerHTML =
          pageIcon(false) + `<span class="label">${esc(info.title)}</span>`;
        row.addEventListener("click", () => openPage(id));
        list.appendChild(row);
      }
      leftBody.appendChild(list);
    } else {
      const ul = document.createElement("ul");
      ul.className = "tree";
      for (const n of toc) ul.appendChild(treeNode(n));
      leftBody.appendChild(ul);
    }
    highlightTree();
  }

  const highlightTree = (): void => {
    leftBody.querySelectorAll<HTMLElement>(".node").forEach((el) => {
      el.classList.toggle("sel", el.dataset.id === currentId);
    });
  };

  function syncTree(): void {
    filterCategory = "";
    filterSel.value = "";
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
    const keys = collection
      .keywords()
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
        row.addEventListener("click", () => openPage(k.pageIds[0]!));
        wrap.appendChild(row);
      } else {
        const sub = document.createElement("div");
        sub.className = "idx-sub";
        sub.style.display = "none";
        for (const id of k.pageIds) {
          const t = document.createElement("div");
          t.className = "idx-topic";
          t.textContent = pages.get(id)?.title ?? id;
          t.addEventListener("click", () => openPage(id));
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
    statusCount.textContent = `${keys.length} keywords`;
  }

  // ---- Search ----
  const crumb = (id: string): string =>
    (pages.get(id)?.path ?? [])
      .map((p) => esc(pages.get(p)?.title ?? p))
      .join(" › ") || "—";

  function runSearch(query: string): void {
    const q = query.trim();
    if (!q) {
      leftBody.innerHTML =
        '<div class="empty">Type words to search the documentation.</div>';
      statusCount.textContent = "";
      return;
    }
    const results = collection.search(q, 40);
    if (!results.length) {
      leftBody.innerHTML = `<div class="empty">No results for:<br><b>${esc(q)}</b></div>`;
      statusCount.textContent = "0 results";
      return;
    }
    const frag = document.createDocumentFragment();
    for (const hit of results) {
      const div = document.createElement("div");
      div.className = "result";
      div.innerHTML =
        `<div class="r-title">${esc(hit.title)}</div>` +
        `<div class="r-crumb">${crumb(hit.pageId)}</div>` +
        `<div class="r-snip">${hit.snippet}</div>`;
      div.addEventListener("click", () => openPage(hit.pageId));
      frag.appendChild(div);
    }
    leftBody.innerHTML = "";
    leftBody.appendChild(frag);
    statusCount.textContent = `${results.length} results`;
  }

  // ---- Favorites ----
  function renderFavorites(): void {
    if (!favorites.size) {
      leftBody.innerHTML =
        '<div class="empty">No favorites yet.<br>Open a page and click <b>☆ Favorite</b>.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    for (const id of favorites) {
      const info = pages.get(id);
      if (!info) continue;
      const row = document.createElement("div");
      row.className = "fav-row";
      row.innerHTML = `<span class="f-star">★</span><span class="f-title">${esc(info.title)}</span><span class="f-del" title="Remove">×</span>`;
      row
        .querySelector(".f-title")!
        .addEventListener("click", () => openPage(id));
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
    favToggle.innerHTML = (on ? "★" : "☆") + " Favorite";
    favToggle.style.color = on ? "var(--swoosh)" : "";
  };

  // ---- Modes ----
  function setMode(next: Mode): void {
    mode = next;
    // Highlight the active tab in both the bottom tabs and the side strip.
    document.querySelectorAll<HTMLElement>("[data-mode]").forEach((b) => {
      b.classList.toggle("on", b.dataset.mode === next);
    });
    filterbar.style.display = next === "contents" ? "" : "none";
    searchBox.style.display = next === "search" ? "" : "none";
    leftTitle.textContent = {
      contents: "Contents",
      index: "Index",
      search: "Search",
      favorites: "Favorites",
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
    const kws = pageKeywords.get(id);
    if (kws?.length) {
      const kw = document.createElement("div");
      kw.className = "kw";
      kw.innerHTML = "<b>Keywords:</b> " + kws.map(esc).join(", ");
      d.appendChild(kw);
    }
    return d.innerHTML;
  }

  function renderTabs(): void {
    const info = pages.get(currentId);
    tabstrip.innerHTML = `<div class="doctab active"><span class="dt-name">${esc(
      info?.title ?? currentId,
    )}</span></div>`;
  }

  function loadContent(id: string): void {
    currentId = id;
    const info = pages.get(id);
    const page = collection.page(id);
    const title = page?.title ?? info?.title ?? id;
    content.innerHTML = page
      ? decorate(page.bodyHtml, id)
      : `<h1>Topic not found</h1><p>No page with address <code>${esc(id)}</code>.</p>`;
    contentWrap.scrollTop = 0;
    document.title = `${title} — kdhelp`;
    const { docsetId, localId } = collection.split(id);
    address.value = `ms-help://${docsetId}/${localId}.htm`;
    renderTabs();
    updateFavBtn();
    if (mode === "contents") renderTree();
    else highlightTree();
    if (location.hash.slice(1) !== id) location.hash = id;
    status.textContent = "Ready";
  }

  function openPage(id: string): void {
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
        content.style.setProperty("--content-size", `${fontSize}px`);
        break;
      case "font-down":
        fontSize = Math.max(11, fontSize - 1);
        content.style.setProperty("--content-size", `${fontSize}px`);
        break;
      case "print":
        window.print();
        break;
      case "find":
        status.textContent = "Use your browser Find (Ctrl/⌘-F).";
        break;
      case "open-docset":
        status.textContent = "Opening other docsets: coming soon.";
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
      "<div>A documentation reader in the spirit of Microsoft Document Explorer.</div>" +
      `<p style="color:#5b6675;margin:.8em 0 0">Language: <b>${esc(collection.language)}</b></p></div>` +
      '<div style="padding:10px 16px;text-align:right;border-top:1px solid var(--chrome-border)"><button style="font-family:var(--font-ui);font-size:12px;padding:4px 16px;border:1px solid #16305a;border-radius:2px;background:linear-gradient(180deg,#eef4fd,#cbd9ec);cursor:pointer">OK</button></div></div>';
    const close = (): void => bg.remove();
    bg.addEventListener("click", (e) => {
      if (e.target === bg || (e.target as HTMLElement).tagName === "BUTTON")
        close();
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
  });

  let searchTimer = 0;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => runSearch(searchInput.value), 160);
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
  $("#tab-new").addEventListener(
    "click",
    () => (status.textContent = "Tabs: coming soon."),
  );

  content.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>(
      'a[href^="#"]',
    );
    if (!a) return;
    e.preventDefault();
    // In-content links are `#localId`, relative to the current page's book.
    openPage(
      collection.resolveLink(currentId, a.getAttribute("href")!.slice(1)),
    );
  });

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
  openPage(pages.has(startId) ? startId : (toc[0]?.pageId ?? ""));
}

// ---------------------------------------------------------------------------
loadCollection("en")
  .then(start)
  .catch((err: unknown) => {
    const content = document.querySelector("#content");
    if (content)
      content.innerHTML = `<h1>Failed to load</h1><pre>${String(err)}</pre>`;
    // eslint-disable-next-line no-console
    console.error(err);
  });
