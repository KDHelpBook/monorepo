import "./styles/main.css";
// The page-body typography, injected as a string into the sandboxed content frame.
import contentCss from "./styles/content.css?inline";
import syntaxCss from "./styles/syntax.css?inline";
import {
  Collection,
  fetchDocsetBytes,
  rangeSupported,
  type DocsetSource,
} from "./data/collection";
import { Docset, type SearchHit, type TocNode } from "./data/docset";
import {
  addExtraPack,
  addRemote,
  allDocsets,
  deleteDocset,
  getRemotes,
  importKhbm,
  loadExtraPacks,
  putDocset,
  removeRemote,
} from "./data/library";
import {
  loadDocsetLangs,
  loadDocsetVersions,
  loadExpanded,
  loadFavorites,
  loadFontSize,
  loadSeenVersions,
  loadTabs,
  saveDocsetLangs,
  saveDocsetVersions,
  saveExpanded,
  saveFavorites,
  saveFontSize,
  saveSeenVersions,
  saveTabs,
} from "./data/uistate";
import { languagesByCollection, pickLanguages } from "./data/langselect";
import {
  resolveManifestUrl,
  streamEligible,
  type Manifest,
} from "./data/manifest";
import {
  compareVersions,
  detectUpdates,
  pickVersions,
  versionsByCollection,
} from "./data/versions";
import { applyStatic, strings, type Strings } from "./i18n";

interface Config {
  externalSources: boolean;
  pwa: boolean;
  /** Cold-start landing: a page id (`docsetId:localId`) or `"search"`. When
   *  unset the viewer defaults to the Search page (search-first). */
  home?: string;
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
 if(a.hasAttribute('data-anchor')){e.preventDefault();var t=document.getElementById(a.getAttribute('data-anchor'));if(t)t.scrollIntoView({behavior:'smooth',block:'start'})}
 else if(a.hasAttribute('data-target')){e.preventDefault();post({t:'kdhelp',a:'open',id:a.getAttribute('data-target'),newTab:!!(mid||e.ctrlKey||e.metaKey)})}
 else if(a.hasAttribute('data-ext')){e.preventDefault();post({t:'kdhelp',a:'ext',url:a.getAttribute('data-ext')})}}
// Copy a code block. execCommand runs inside this frame's click gesture, so it works
// even though the sandbox (no allow-same-origin) blocks the async clipboard API.
function copyBtn(e){var b=e.target&&e.target.closest&&e.target.closest('button[data-copy]');if(!b)return false;e.preventDefault();
 var pre=(b.closest('.code-block')||b.parentNode).querySelector('pre');var txt=pre?(pre.textContent||''):'';
 var ta=document.createElement('textarea');ta.value=txt;ta.style.position='fixed';ta.style.top='-2000px';document.body.appendChild(ta);ta.select();
 try{document.execCommand('copy')}catch(_){}document.body.removeChild(ta);
 var done=b.getAttribute('data-copied')||'',orig=b.textContent;if(done){b.textContent=done}b.classList.add('done');
 setTimeout(function(){b.textContent=orig;b.classList.remove('done')},1200);return true}
// Toggle a Docus-style CodeCollapse: flip the .open class on the block (CSS reveals or
// clamps the code) and swap the button label (data-expand-label / data-collapse-label).
function collapseToggle(e){var b=e.target&&e.target.closest&&e.target.closest('button[data-collapse]');if(!b)return false;e.preventDefault();
 var box=b.closest('.code-collapse');if(box){var open=box.classList.toggle('open');
 var t=b.querySelector('.code-collapse-text');if(t)t.textContent=open?(b.getAttribute('data-collapse-label')||''):(b.getAttribute('data-expand-label')||'')}return true}
// A tap/click on a standalone content image (not a linked one) asks the app to
// open its zoomable lightbox. Only our resolved inline assets (data:image/…) —
// never an arbitrary URL — so the app can trust the source it gets.
function img(e){var el=e.target;if(!el||el.tagName!=='IMG')return false;
 if(el.closest&&el.closest('a'))return false;
 var src=el.currentSrc||el.getAttribute('src')||'';
 if(src.indexOf('data:image/')!==0)return false;
 e.preventDefault();post({t:'kdhelp',a:'img',src:src,alt:el.getAttribute('alt')||''});return true}
// A tap/click on a display equation enlarges it in an in-frame overlay (the math
// "lightbox"); a click anywhere on the overlay — the enlarged formula OR its backdrop
// — or Esc dismisses it. Handled here, not by the app: we never pass content markup to
// the trusted parent, so this stays a scaled clone over this sandboxed frame. Single
// tracked overlay + saved overflow, so the click that closes can't re-open a nested one
// (that would leave the scroll lock stuck on).
var mathOv=null,mathPrevOverflow='';
function mathClose(){if(!mathOv)return;mathOv.remove();mathOv=null;
 document.documentElement.style.overflow=mathPrevOverflow;removeEventListener('keydown',mathKey)}
function mathKey(ev){if(ev.key==='Escape')mathClose()}
function mathZoom(e){var t=e.target;
 // A click on the open overlay (formula clone included) closes — never re-opens.
 if(t&&t.closest&&t.closest('.math-overlay')){e.preventDefault();mathClose();return true}
 var m=t&&t.closest&&t.closest('math[display="block"]');if(!m)return false;
 e.preventDefault();if(mathOv)mathClose();
 var de=document.documentElement;mathPrevOverflow=de.style.overflow;
 mathOv=document.createElement('div');mathOv.className='math-overlay';mathOv.appendChild(m.cloneNode(true));
 addEventListener('keydown',mathKey);de.style.overflow='hidden';document.body.appendChild(mathOv);return true}
addEventListener('click',function(e){if(copyBtn(e))return;if(collapseToggle(e))return;if(mathZoom(e))return;if(img(e))return;link(e,false)},true);
addEventListener('auxclick',function(e){if(e.button===1)link(e,true)},true);
// Pull-to-refresh: a downward drag started at the top of the page posts a 'pull'
// to the app (the reading content lives in this sandboxed frame, so the app can't
// see the gesture itself). The app decides whether to act (only if remotes exist).
var py=0,pull=false;
function stop(){return (document.scrollingElement||document.documentElement).scrollTop}
addEventListener('touchstart',function(e){pull=stop()<=0;py=e.touches[0].clientY},{passive:true});
addEventListener('touchmove',function(e){if(pull&&e.touches[0].clientY-py>72){pull=false;post({t:'kdhelp',a:'pull'})}},{passive:true});
addEventListener('touchend',function(){pull=false},{passive:true});
addEventListener('message',function(e){var d=e.data;if(!d||d.t!=='kdhelp-app')return;
 if(d.a==='font'&&typeof d.size==='number'){document.documentElement.style.setProperty('--content-size',d.size+'px')}});
function ready(){var m=document.querySelector('mark.hl');if(m)m.scrollIntoView({block:'center'})}
if(document.readyState!=='loading')ready();else addEventListener('DOMContentLoaded',ready);
})();`;

// A generic document glyph for the code-block filename header (inline SVG so it stays
// self-contained in the sandboxed frame — no icon font or external ref).
const FILE_ICON =
  '<svg class="code-file-icon" viewBox="0 0 16 16" aria-hidden="true">' +
  '<path d="M4 1.7h5.1L12.8 5.4V13.4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.7a1 1 0 0 1 1-1Z" ' +
  'fill="none" stroke="currentColor" stroke-width="1.2"/>' +
  '<path d="M9 1.8V5.5h3.7" fill="none" stroke="currentColor" stroke-width="1.2" ' +
  'stroke-linejoin="round"/></svg>';

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
    id: string;
    language: string;
    title: string;
    collection: string;
    version: string;
    streaming: boolean;
    attachments?: string[];
  }[] = [];
  if (config.externalSources) {
    for (const entry of getRemotes()) {
      try {
        // Prefer streaming when the entry allows it AND the host honours Range;
        // otherwise (or if the streamed open fails) fetch the docset whole.
        let streamed = false;
        if (entry.streaming && (await rangeSupported(entry.url))) {
          try {
            const { StreamingDocset } = await import("./data/streaming-docset");
            const p = await StreamingDocset.peek(entry.url);
            remotes.push({
              url: entry.url,
              id: p.id,
              language: p.language,
              title: p.title,
              collection: p.collection,
              version: p.version,
              streaming: true,
              attachments: entry.attachments,
            });
            streamed = true;
          } catch {
            /* streaming open failed despite Range — fall back to a whole fetch */
          }
        }
        if (!streamed) {
          const bytes = await fetchDocsetBytes(entry.url);
          const ds = await Docset.open(bytes);
          remotes.push({
            url: entry.url,
            bytes,
            id: ds.id,
            language: ds.language,
            title: ds.title,
            collection: ds.collection,
            version: ds.version,
            streaming: false,
            attachments: entry.attachments, // fetched whole alongside the .khb
          });
          ds.close();
        }
      } catch {
        /* unreachable/invalid remote — skip; the user can remove it */
      }
    }
  }

  // Announce docsets whose version bumped since we last saw them (re-fetched
  // remotes, re-uploaded files) — bundled docsets are covered by the PWA prompt.
  const { updates, nextSeen } = detectUpdates(
    [
      ...remotes.map((r) => ({ id: r.id, title: r.title, version: r.version })),
      ...uploadedAll.map((d) => ({
        id: d.id,
        title: d.title,
        version: d.version ?? "",
      })),
    ],
    loadSeenVersions(),
  );
  saveSeenVersions(nextSeen);

  // Reader-attached `.khba` packs (URLs) that supply a docset's missing assets —
  // applied on load alongside the docset's own packs, keyed by docset id.
  const extraPacks = loadExtraPacks();
  const extraOf = (id: string): string[] => extraPacks[id] ?? [];

  // Bundled docsets are whole-fetched by default; an entry marked
  // `"streaming": true` (kdhelp pack --stream) opens page-by-page over HTTP
  // Range instead — even in a locked build, which never reaches the remotes
  // path above. Same negotiation as a remote: the host must honour Range and a
  // cheap streamed peek must succeed, else fall back to the whole fetch.
  const bundled: DocVariant[] = [];
  for (const d of manifest.docsets) {
    const packs = [...(d.attachments ?? []), ...extraOf(d.id)];
    let source: DocsetSource | null = null;
    // The manifest `file` is dist-relative — resolve it (and the packs) against
    // the site base so the Range probe and the streaming engine get real URLs.
    const url = resolveManifestUrl(d.file, document.baseURI);
    if (streamEligible(d, extraOf(d.id)) && (await rangeSupported(url))) {
      try {
        const { StreamingDocset } = await import("./data/streaming-docset");
        await StreamingDocset.peek(url); // validates engine + host end-to-end
        source = {
          url,
          mode: "streaming",
          attachments: packs.map((p) =>
            resolveManifestUrl(p, document.baseURI),
          ),
        };
      } catch {
        /* streaming open failed despite Range — fall back to a whole fetch */
      }
    }
    bundled.push({
      id: d.id,
      collection: d.collection ?? d.id,
      language: d.language,
      version: d.version ?? "",
      title: d.title,
      source: source ?? {
        file: d.file,
        // A `.gz` suffix (on the docset or a pack) decompresses on fetch.
        attachments: packs.map((file) => ({ file })),
      },
      origin: { kind: "bundled", streaming: source != null, packs },
    });
  }

  // Every available docset as a language "variant" of its collection, each paired
  // with a ready-to-load source descriptor. We then pick one language per
  // collection (override → UI language → fallback) so a book present only in
  // another language stays visible instead of vanishing on a language switch.
  const variants: DocVariant[] = [
    ...bundled,
    ...uploadedAll.map((d) => ({
      id: d.id,
      collection: d.collection ?? d.id,
      language: d.language,
      version: d.version ?? "",
      title: d.title,
      source: {
        bytes: d.bytes,
        attachments: [
          ...(d.attachments ?? []).map((bytes) => ({ bytes })),
          // Extra packs are URLs even for an uploaded (bytes) docset — fetched whole.
          ...extraOf(d.id).map((file) => ({ file })),
        ],
      } as DocsetSource,
      origin: {
        kind: "uploaded",
        removeKey: d.id,
        packs: [
          ...(d.attachments ?? []).map((_, i) => `pack ${i + 1}`),
          ...extraOf(d.id),
        ],
      } as BookOrigin,
    })),
    ...remotes.map((r) => ({
      id: r.id,
      collection: r.collection,
      language: r.language,
      version: r.version,
      title: r.title,
      source: (r.streaming
        ? {
            url: r.url,
            mode: "streaming" as const,
            attachments: [...(r.attachments ?? []), ...extraOf(r.id)],
          }
        : {
            bytes: r.bytes!,
            // Whole-fetch docset can still pair with remote packs (fetched whole).
            attachments: [...(r.attachments ?? []), ...extraOf(r.id)].map(
              (file) => ({ file }),
            ),
          }) as DocsetSource,
      origin: {
        kind: "remote",
        removeKey: r.url,
        streaming: r.streaming,
        packs: [...(r.attachments ?? []), ...extraOf(r.id)],
      } as BookOrigin,
    })),
  ];

  const available = [...new Set(variants.map((v) => v.language))];
  const lang = chooseLang(available);
  document.documentElement.lang = lang;
  applyStatic(lang);

  const { sources, langInfo, versionInfo } = resolveVariants(variants, lang);
  if (!sources.length) throw new Error("no docsets to show");

  if (config.pwa) registerServiceWorker(strings(lang));
  start(
    await Collection.load(sources, lang),
    lang,
    available,
    config,
    langInfo,
    versionInfo,
    updates,
    variants,
  );
}

/** Where a book came from + its packs — for the Manage docsets page. */
interface BookOrigin {
  kind: "bundled" | "uploaded" | "remote";
  /** Docset id (uploaded) or URL (remote) to remove by; absent ⇒ not removable. */
  removeKey?: string;
  /** Page-level streaming: the remote's transport preference, or — for a
   *  bundled book — the transport actually negotiated at load. */
  streaming?: boolean;
  /** Attachment packs: `.khba` paths/URLs (bundled/remote) or generic labels. */
  packs: string[];
}

/** One language/version edition of a product, with a ready-to-load source. */
interface DocVariant {
  id: string;
  collection: string;
  language: string;
  version: string;
  title: string;
  source: DocsetSource;
  origin: BookOrigin;
}

/** Per-collection language availability for the Manage docsets override UI. */
interface CollectionLangInfo {
  collection: string;
  title: string;
  langs: string[];
  chosen: string;
}

/**
 * Resolve the full variant list down to the shown source set + per-collection
 * choice info, honouring the persisted version/language overrides. Shared by the
 * initial bootstrap and the live in-place rebuild that runs when an override
 * changes — so switching version/language never needs a page reload.
 */
function resolveVariants(
  variants: DocVariant[],
  uiLang: string,
): {
  sources: DocsetSource[];
  langInfo: CollectionLangInfo[];
  versionInfo: CollectionVersionInfo[];
} {
  // Pick the version first (latest or override), then the language within it.
  const versioned = pickVersions(variants, loadDocsetVersions());
  const navLang = (navigator.language || "en").slice(0, 2);
  const fallbackOrder = [...new Set(["en", navLang])];
  const shown = pickLanguages(
    versioned,
    uiLang,
    loadDocsetLangs(),
    fallbackOrder,
  );
  const chosenByCol = new Map(shown.map((v) => [v.collection, v]));
  const label = (col: string): string => chosenByCol.get(col)?.title ?? col;
  const langInfo: CollectionLangInfo[] = [
    ...languagesByCollection(versioned).entries(),
  ]
    .filter(([, langs]) => langs.length > 1)
    .map(([collection, langs]) => ({
      collection,
      title: label(collection),
      langs,
      chosen: chosenByCol.get(collection)?.language ?? langs[0]!,
    }));
  const versionInfo: CollectionVersionInfo[] = [
    ...versionsByCollection(variants).entries(),
  ]
    .filter(([, versions]) => versions.length > 1)
    .map(([collection, versions]) => ({
      collection,
      title: label(collection),
      versions,
      chosen: chosenByCol.get(collection)?.version ?? versions[0]!,
    }));
  return { sources: shown.map((v) => v.source), langInfo, versionInfo };
}

/** Per-collection version availability for the Version switcher + Manage docsets. */
interface CollectionVersionInfo {
  collection: string;
  title: string;
  versions: string[]; // latest-first
  chosen: string;
}

function registerServiceWorker(s: Strings): void {
  if (import.meta.env.DEV) return; // no SW in dev — it would fight HMR
  if (!("serviceWorker" in navigator)) return;
  const register = (): void => {
    navigator.serviceWorker
      .register("sw.js")
      .then((reg) => {
        // A worker already waiting (updated in a past session, page reopened).
        if (reg.waiting && navigator.serviceWorker.controller) {
          showUpdatePrompt(reg.waiting, s);
        }
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            // "installed" while a controller exists ⇒ an update (not a first
            // install), so the new worker is parked in "waiting": offer a reload.
            if (
              sw.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              showUpdatePrompt(sw, s);
            }
          });
        });
      })
      .catch(() => {
        /* offline support is best-effort */
      });
  };
  // bootstrap() awaits docset + wasm loading, so `load` has usually already fired
  // by the time we get here — register now in that case rather than on a `load`
  // event that will never come.
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

// A small bottom toast offering to activate a downloaded update. Built once; the
// Reload button tells the waiting worker to take over → controllerchange reloads.
function showUpdatePrompt(waiting: ServiceWorker, s: Strings): void {
  if (document.getElementById("update-toast")) return;
  const toast = document.createElement("div");
  toast.id = "update-toast";
  toast.className = "update-toast";
  const msg = document.createElement("span");
  msg.textContent = s.updateReady;
  const reload = document.createElement("button");
  reload.type = "button";
  reload.className = "update-reload";
  reload.textContent = s.updateReload;
  reload.addEventListener("click", () => {
    reload.disabled = true;
    // Reload only when the *new* worker takes over (never on the initial claim of
    // a first install), so a fresh visit is never interrupted by a spurious reload.
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => location.reload(),
      { once: true },
    );
    waiting.postMessage({ type: "skip-waiting" });
  });
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "update-dismiss";
  dismiss.setAttribute("aria-label", s.close);
  dismiss.textContent = "×";
  dismiss.addEventListener("click", () => toast.remove());
  toast.append(msg, reload, dismiss);
  document.body.appendChild(toast);
}

// An informational (non-actionable) toast: docsets whose version bumped since the
// last visit. Auto-dismisses; reuses the update-toast styling minus the reload.
function showVersionToast(
  updates: { title: string; from: string; to: string }[],
  s: Strings,
): void {
  const toast = document.createElement("div");
  toast.className = "update-toast";
  const msg = document.createElement("span");
  msg.textContent = updates
    .map((u) => s.docsetUpdated(u.title, u.from, u.to))
    .join(" · ");
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "update-dismiss";
  dismiss.setAttribute("aria-label", s.close);
  dismiss.textContent = "×";
  dismiss.addEventListener("click", () => toast.remove());
  toast.append(msg, dismiss);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 12000);
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
  langInfo: CollectionLangInfo[],
  versionInfo: CollectionVersionInfo[],
  updates: { title: string; from: string; to: string }[],
  variants: DocVariant[],
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
      tabs: tabs.map((t) =>
        t.query != null ? { id: t.id, query: t.query } : { id: t.id },
      ),
      active,
    });
  // A tab is a docset page, or the full Search results page (id === SEARCH_ID,
  // which carries its query + the last scroll of scope/sort controls).
  const SEARCH_ID = "@search";
  const MANAGE_ID = "@manage"; // in-app Manage docsets page (rendered into #content)
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
  let fontSize = loadFontSize(13);
  // Terms to highlight in the opened page — set when a search result is clicked,
  // persisted across navigation (like MS Document Explorer) until explicitly cleared.
  let highlightTerms: string[] = [];

  const escapeRe = (t: string): string =>
    t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

  const langName = (l: string): string =>
    ({ en: "English", pl: "Polski" })[l] ?? l;

  // Per-collection version/language switch info + the namespaced TOC. All `let`
  // because a live version/language switch rebuilds them in place (see `rebuild`).
  let verByCol = new Map(versionInfo.map((v) => [v.collection, v]));
  let langByCol = new Map(langInfo.map((l) => [l.collection, l]));
  let switchableCols = new Set([...verByCol.keys(), ...langByCol.keys()]);
  let toc = collection.tocTree(switchableCols);

  // (Re)build the page-info and keyword maps from the current `collection`/`toc`.
  function buildPages(nodes: TocNode[], path: string[]): void {
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
  }
  function deriveMaps(): void {
    pages.clear();
    buildPages(toc, []);
    pageKeywords.clear();
    for (const k of collection.keywords()) {
      for (const pid of k.pageIds) {
        const list = pageKeywords.get(pid);
        if (list) list.push(k.term);
        else pageKeywords.set(pid, [k.term]);
      }
    }
  }
  deriveMaps();

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

  // Version(s) per family (collection), for the folder tooltip.
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
    // A switchable product folder shows its current version/language in parens and a
    // ⋯ button that opens a small menu to change either — right where you see the
    // book, instead of a disconnected filter dropdown.
    if (n.group && n.pageId.startsWith("@collection:")) {
      const col = n.pageId.slice("@collection:".length);
      if (switchableCols.has(col)) {
        const ver = verByCol.get(col);
        const lng = langByCol.get(col);
        const bits: string[] = [];
        if (ver) bits.push(ver.chosen);
        if (lng) bits.push(langName(lng.chosen));
        const meta = document.createElement("span");
        meta.className = "node-meta";
        meta.textContent = `(${bits.join(" · ")})`;
        const more = document.createElement("button");
        more.type = "button";
        more.className = "node-more";
        more.textContent = "⋯";
        more.title = s.changeVersionLang;
        more.addEventListener("click", (e) => {
          e.stopPropagation();
          openFolderMenu(more, col);
        });
        row.append(meta, more);
      }
    }
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

  // Popover anchored to a folder's ⋯ button: switch that product's version and/or
  // language. Picking an option saves the per-collection override and reloads.
  function openFolderMenu(anchor: HTMLElement, col: string): void {
    document.getElementById("folder-menu")?.remove();
    const menu = document.createElement("div");
    menu.id = "folder-menu";
    menu.className = "more-menu folder-menu";
    const head = (t: string): void => {
      const h = document.createElement("div");
      h.className = "fm-head";
      h.textContent = t;
      menu.appendChild(h);
    };
    const item = (label: string, active: boolean, apply: () => void): void => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "more-item fm-item" + (active ? " fm-active" : "");
      b.textContent = label;
      b.addEventListener("click", apply);
      menu.appendChild(b);
    };
    const ver = verByCol.get(col);
    if (ver) {
      head(s.versionLabel);
      for (const v of ver.versions) {
        item(v, v === ver.chosen, () => {
          const m = loadDocsetVersions();
          m[col] = v;
          saveDocsetVersions(m);
          void rebuild(); // live swap, no page reload
        });
      }
    }
    const lng = langByCol.get(col);
    if (lng) {
      head(s.docsetLanguage);
      for (const l of lng.langs) {
        item(langName(l), l === lng.chosen, () => {
          const m = loadDocsetLangs();
          m[col] = l;
          saveDocsetLangs(m);
          void rebuild();
        });
      }
    }
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(r.left, window.innerWidth - menu.offsetWidth - 8),
    );
    menu.style.top = `${Math.round(r.bottom + 2)}px`;
    menu.style.left = `${Math.round(left)}px`;
    const close = (e: Event): void => {
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      if (e.type === "click" && menu.contains(e.target as Node)) return;
      menu.remove();
      document.removeEventListener("click", close, true);
      document.removeEventListener("keydown", close, true);
    };
    setTimeout(() => {
      document.addEventListener("click", close, true);
      document.addEventListener("keydown", close, true);
    }, 0);
  }

  // Rebuild the loaded collection in place after a per-collection version/language
  // override changes — no page reload (which flashes and loses state). Re-resolves
  // the sources, swaps the collection, re-derives every collection-dependent map,
  // remaps open tabs to the new docset ids, then re-renders the panel + content.
  let rebuilding = false;
  async function rebuild(): Promise<void> {
    if (rebuilding) return;
    rebuilding = true;
    document.getElementById("folder-menu")?.remove();
    try {
      const oldDocsetToCol = new Map(
        collection.books().map((b) => [b.id, b.collection]),
      );
      const r = resolveVariants(variants, lang);
      const next = await Collection.load(r.sources, lang);
      const prev = collection;
      collection = next;
      prev.close();
      langInfo = r.langInfo;
      versionInfo = r.versionInfo;
      verByCol = new Map(versionInfo.map((v) => [v.collection, v]));
      langByCol = new Map(langInfo.map((l) => [l.collection, l]));
      switchableCols = new Set([...verByCol.keys(), ...langByCol.keys()]);
      toc = collection.tocTree(switchableCols);
      deriveMaps();
      fillFilters();

      // Open tabs / the current page point at the old docset ids; move each to the
      // matching page in its collection's new variant (same local id where it
      // exists, else that variant's first page). Untouched collections keep theirs.
      const newColToDocset = new Map(
        collection.books().map((b) => [b.collection, b.id]),
      );
      const firstOf = (docset: string): string => {
        for (const k of pages.keys()) if (k.startsWith(docset + ":")) return k;
        return pages.keys().next().value ?? "";
      };
      const remap = (id: string): string => {
        if (id === SEARCH_ID || id === MANAGE_ID) return id;
        const { docsetId, localId } = collection.split(id);
        const col = oldDocsetToCol.get(docsetId);
        if (col === undefined) {
          return pages.has(id) ? id : (pages.keys().next().value ?? id);
        }
        const newD = newColToDocset.get(col);
        if (newD === undefined) return pages.keys().next().value ?? id;
        const candidate = `${newD}:${localId}`;
        return pages.has(candidate) ? candidate : firstOf(newD);
      };
      for (const t of tabs) t.id = remap(t.id);
      currentId = remap(currentId);
      persistTabs();

      renderTabs();
      setMode(mode);
      await loadContent(tabs[active]?.id ?? currentId);
    } finally {
      rebuilding = false;
    }
  }

  function renderTree(): void {
    leftBody.innerHTML = "";
    const ul = document.createElement("ul");
    ul.className = "tree";
    // Product is a many-to-many tag: prune to books in the scoped product (keeping
    // the family folder structure), rather than drilling into a single family.
    if (filterCategory) {
      // Prune to pages in the category (and product), KEEPING the folder structure
      // (the ancestors leading to a match survive); reveal it fully expanded.
      const ids = new Set(collection.pagesByCategory(filterCategory));
      const pruned = pruneTree(toc, (id) => ids.has(id) && inProduct(id));
      for (const n of pruned) ul.appendChild(treeNode(n, true));
    } else if (filterProduct) {
      const pruned = pruneTree(toc, (id) => inProduct(id));
      for (const n of pruned) ul.appendChild(treeNode(n));
    } else {
      for (const n of toc) ul.appendChild(treeNode(n));
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

  // True if a page's book is tagged with the scoped product (or none is set).
  const inProduct = (nsId: string): boolean =>
    !filterProduct || collection.pageInProduct(nsId, filterProduct);

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

  // Open (or focus) the Manage docsets page tab.
  function openManagePage(): void {
    // A locked (bundled) build has no docset management — refuse to open the page
    // even if something (e.g. a stale persisted tab) asks for it.
    if (!config.externalSources) return;
    const existing = tabs.find((t) => t.id === MANAGE_ID);
    if (existing) active = tabs.indexOf(existing);
    else {
      tabs.push(mkTab(MANAGE_ID));
      active = tabs.length - 1;
    }
    void loadContent(MANAGE_ID);
    renderTabs();
  }

  // Apply the scope/sort controls to a raw search over the whole collection.
  async function searchPageResults(query: string): Promise<SearchHit[]> {
    let hits = await collection.search(query, 200);
    if (searchScope.category) {
      const allowed = new Set(collection.pagesByCategory(searchScope.category));
      hits = hits.filter((h) => allowed.has(h.pageId));
    }
    if (searchScope.product) {
      hits = hits.filter((h) =>
        collection.pageInProduct(h.pageId, searchScope.product),
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
      const source = [trail === "—" ? "" : trail, book]
        .filter(Boolean)
        .join(" · ");
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
    const products = collection.products();
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
    const rerun = (): void =>
      void renderSearchResults(tabs[active]?.query ?? "");
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
    // The star always shows; the word is wrapped so compact/phone CSS can hide it.
    favToggle.innerHTML =
      (on ? "★" : "☆") + ` <span class="fav-label">${esc(s.favorite)}</span>`;
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
  async function resolveAssets(
    root: ParentNode,
    pageId: string,
  ): Promise<void> {
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
        (el as HTMLAnchorElement).download =
          path.split("/").pop() ?? "download";
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
      " data-asset-$1=$2asset:$3$2",
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
  // Wrap each highlighted code block with a header (the ```lang [file] filename, if
  // any — carried on the <code> as data-meta) and a Copy button. The button is inert
  // markup here; the frame bridge handles the click (copies the code text).
  function enhanceCodeBlocks(root: ParentNode): void {
    root
      .querySelectorAll<HTMLPreElement>("pre.syntax-highlighting")
      .forEach((pre) => {
        const code = pre.querySelector("code");
        // `data-meta` is the fence info string past the language, e.g. the
        // `[main.rs] collapse` from ```rust [main.rs] collapse. A `[…]` is the
        // filename; bare words are flags (`collapse`, plus `open` to start expanded).
        const meta = code?.getAttribute("data-meta") ?? "";
        const file = (meta.match(/\[([^\]]*)\]/)?.[1] ?? "").trim();
        const flags = meta.replace(/\[[^\]]*\]/, "").trim().split(/\s+/);
        const collapsible = flags.includes("collapse");

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "code-copy";
        btn.setAttribute("data-copy", "");
        btn.setAttribute("data-copied", s.copied);
        btn.textContent = s.copy;

        const wrap = document.createElement("div");
        wrap.className = "code-block";
        pre.before(wrap);

        if (file) {
          // With a filename bar the Copy button lives in the header, vertically
          // centred; without one it floats over the code (hover-revealed).
          const head = document.createElement("div");
          head.className = "code-head";
          head.innerHTML = FILE_ICON; // trusted, hardcoded inline SVG
          const name = document.createElement("span");
          name.className = "code-file";
          name.textContent = file;
          head.appendChild(name);
          head.appendChild(btn);
          wrap.appendChild(head);
          wrap.appendChild(pre);
        } else {
          wrap.appendChild(pre);
          wrap.appendChild(btn);
        }

        if (collapsible) {
          // Docus-style collapse: keep a *peek* of the code visible (CSS clamps the
          // pre's height + a fade), toggled full-height by a centred button. Not a
          // <details> — that hides the body entirely; we want a partial preview. The
          // bridge flips `.open` and swaps the label on click.
          const startOpen = flags.includes("open");
          wrap.classList.add("code-collapse");
          if (startOpen) wrap.classList.add("open");
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "code-collapse-toggle";
          toggle.setAttribute("data-collapse", "");
          toggle.setAttribute("data-expand-label", s.expandCode);
          toggle.setAttribute("data-collapse-label", s.collapseCode);
          const chev = document.createElement("span");
          chev.className = "code-collapse-chevron";
          chev.setAttribute("aria-hidden", "true");
          const label = document.createElement("span");
          label.className = "code-collapse-text";
          label.textContent = startOpen ? s.collapseCode : s.expandCode;
          toggle.appendChild(chev);
          toggle.appendChild(label);
          wrap.appendChild(toggle);
        }
      });
  }

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
      // Link conventions: `#slug` = an in-page heading anchor; a bare `page-id` = a
      // page in this book; `docsetId:pageId` = a page in another book; http(s)/mail
      // = external; `data:` = an already-resolved asset download (left alone).
      if (href.startsWith("#")) {
        a.setAttribute("data-anchor", href.slice(1));
        a.setAttribute("href", "#");
      } else if (/^(https?:|mailto:|tel:)/i.test(href)) {
        a.setAttribute("data-ext", href);
      } else if (href.startsWith("data:")) {
        /* resolved asset (download) — keep as-is */
      } else if (href) {
        // A page reference: cross-book ids already carry `docsetId:`; a bare id is
        // namespaced to this book.
        a.setAttribute(
          "data-target",
          href.includes(":") ? href : collection.resolveLink(fromId, href),
        );
        a.setAttribute("href", "#");
      }
    });
  }

  // Wrap page-body HTML into a full document for the sandboxed frame: the theme CSS
  // (the frame can't see the app stylesheet) + our trusted bridge script.
  const frameDoc = (bodyHtml: string): string =>
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="referrer" content="no-referrer">` +
    // Typography + the syntax-highlighting theme (colours the compiler's class-tagged
    // code spans; the light theme, with a dormant [data-theme="dark"] block).
    `<style>${contentCss}\n${syntaxCss}\n:root{--content-size:${fontSize}px}</style>` +
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
        t.id === SEARCH_ID
          ? s.search
          : t.id === MANAGE_ID
            ? s.manageDocsets
            : (pages.get(t.id)?.title ?? t.id);
      const tab = document.createElement("div");
      tab.className = "doctab" + (i === active ? " active" : "");
      tab.innerHTML =
        `<span class="dt-name">${esc(name)}</span>` +
        (tabs.length > 1
          ? '<span class="dt-x" title="Close tab">×</span>'
          : "");
      let swiped = false; // set by a close-swipe so the trailing click is ignored
      tab.addEventListener("click", () => {
        if (swiped) return;
        activateTab(i);
      });
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
      // Touch: a clear upward swipe on a tab closes it (horizontal is reserved for
      // scrolling the strip). Only meaningful when more than one tab is open.
      if (coarsePointer && tabs.length > 1) {
        let sx = 0;
        let sy = 0;
        tab.addEventListener(
          "touchstart",
          (e) => {
            const p = e.touches[0];
            if (!p) return;
            sx = p.clientX;
            sy = p.clientY;
          },
          { passive: true },
        );
        tab.addEventListener(
          "touchmove",
          (e) => {
            const p = e.touches[0];
            if (swiped || !p) return;
            const dx = p.clientX - sx;
            const dy = p.clientY - sy;
            if (dy < -40 && Math.abs(dy) > Math.abs(dx) * 1.3) {
              swiped = true;
              closeTab(i);
            }
          },
          { passive: true },
        );
      }
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
    if (id === SEARCH_ID || id === MANAGE_ID) {
      // App UI, rendered into #content (not the sandbox). The overlay covers the
      // frame; we never display:none the frame itself — doing so drops a
      // sandboxed srcdoc iframe's compositing in Chromium (it repaints blank).
      if (id === SEARCH_ID) renderSearchPage();
      else renderManagePage();
      content.style.display = "";
      // Repaint the strip so the clicked tab highlights — activateTab reaches this
      // branch too, and the page path's renderTabs() below is skipped by the return.
      renderTabs();
      updateFavBtn();
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
      enhanceCodeBlocks(holder); // filename bar + copy button
      // The "On this page" nav is compiled into body_html; its `#slug` links route
      // through rewriteFrameLinks like any in-page anchor.
      rewriteFrameLinks(holder, id);
      frame.srcdoc = frameDoc(holder.innerHTML);
    } else {
      frame.srcdoc = frameDoc(
        `<h1>${esc(s.notFoundTitle)}</h1><p>${s.notFoundBody(esc(id))}</p>`,
      );
    }
    // Hide the app-UI overlay so the (always-visible) frame shows through.
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
      case "search-page":
        // The roomy Search page (scope + sort) with whatever's in the quick box.
        openSearchPage(searchInput.value.trim());
        if (narrow() || !pinned) retract();
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
        saveFontSize(fontSize);
        break;
      case "font-down":
        fontSize = Math.max(11, fontSize - 1);
        setFrameFont();
        saveFontSize(fontSize);
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
        openManagePage();
        break;
      case "about":
        showAbout();
        break;
      case "share":
        void shareCurrent();
        break;
    }
  }

  // Share the current page's deep link via the OS share sheet, falling back to
  // copying it to the clipboard.
  async function shareCurrent(): Promise<void> {
    const url = location.href;
    const title = document.title;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        status.textContent = s.linkCopied;
      }
    } catch {
      /* user dismissed the share sheet */
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
    // Loaded docsets with their versions (language shown too, since a fallback book
    // may differ from the UI language).
    const bookLines = collection
      .books()
      .map(
        (b) =>
          `<div>${esc(b.title)} <span style="color:var(--muted)">· ${esc(b.language)}${b.version ? ` · ${esc(s.versionLabel)} ${esc(b.version)}` : ""}</span></div>`,
      )
      .join("");
    bg.innerHTML =
      '<div style="width:420px;background:var(--chrome-top);border:1px solid #17335c;border-radius:3px;box-shadow:0 12px 40px rgba(0,0,0,.5);overflow:hidden">' +
      '<div style="background:linear-gradient(180deg,var(--title-top),var(--title-bot));color:#fff;font-weight:bold;padding:6px 10px">About kdhelp</div>' +
      '<div style="padding:16px 18px;line-height:1.6"><div style="font-size:15px;font-weight:bold;color:var(--content-h)">kdhelp</div>' +
      `<div>${esc(s.aboutTagline)}</div>` +
      `<p style="color:#5b6675;margin:.8em 0 .3em">${esc(s.aboutLanguage)} <b>${esc(collection.language)}</b></p>` +
      `<div style="font-size:11px;color:#5b6675">${bookLines}</div></div>` +
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
      `<label style="display:flex;align-items:center;gap:6px;margin-top:8px;color:var(--content-fg);font-size:12px;cursor:pointer"><input class="url-stream" type="checkbox" checked> ${esc(s.streamOption)}</label>` +
      `<div style="color:var(--muted);font-size:11px;margin-top:2px;margin-left:22px">${esc(s.streamHint)}</div>` +
      `<div class="url-sidecars-row" style="margin-top:8px"><div style="color:var(--muted);font-size:11px;margin-bottom:3px">${esc(s.streamSidecars)}</div>` +
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
    void sidecarsRow; // packs input is always shown (whole-fetch can use them too)
    const submit = async (): Promise<void> => {
      const url = input.value.trim();
      if (!url) return;
      const streaming = stream.checked; // prefer streaming; auto-falls back to whole
      const packs = sidecars.value
        .split(/\s+/)
        .map((u) => u.trim())
        .filter(Boolean);
      err.style.color = "var(--muted)";
      err.textContent = s.openUrlChecking;
      add.disabled = true;
      try {
        // Validate the URL is a reachable `.khb`: a cheap streaming peek when
        // streaming is preferred and the host honours Range, else a whole fetch
        // (which also covers a preferred-but-unavailable stream — it'll load whole).
        let validated = false;
        if (streaming && (await rangeSupported(url))) {
          try {
            const { StreamingDocset } = await import("./data/streaming-docset");
            await StreamingDocset.peek(url);
            validated = true;
          } catch {
            /* not Range-streamable after all — validate by fetching it whole */
          }
        }
        if (!validated)
          (await Docset.open(await fetchDocsetBytes(url))).close();
        addRemote(url, streaming, packs);
        location.reload();
      } catch {
        err.style.color = "#a33";
        err.textContent = s.openUrlError;
        add.disabled = false;
      }
    };
    add.addEventListener("click", () => void submit());
    bg.querySelector(".url-cancel")!.addEventListener("click", () =>
      bg.remove(),
    );
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
        attachmentFiles.map(async (f) => new Uint8Array(await f.arrayBuffer())),
      );
      const ds = await Docset.open(bytes, attachments); // validates + reads meta
      await putDocset({
        id: ds.id,
        language: ds.language,
        title: ds.title,
        collection: ds.collection,
        version: ds.version,
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

  // The unified Manage docsets page, rendered into #content (like the Search page).
  // One card per loaded book, grouped by product (family); per-product version +
  // language selectors switch live; each book shows its source + attachment packs.
  function renderManagePage(): void {
    address.value = "manage:";
    const langLabel = (l: string): string =>
      ({ en: "English", pl: "Polski" })[l] ?? l;
    const badge = (o: BookOrigin): string => {
      const kind =
        o.kind === "uploaded"
          ? s.uploadedBadge
          : o.kind === "remote"
            ? s.remoteBadge
            : s.bundledBadge;
      return o.streaming ? `${kind} ${s.streamingBadge}` : kind;
    };

    // Show every edition (variant) grouped by product, the loaded ones marked
    // active — so a multi-version × multi-language product shows its whole matrix,
    // and a click on any edition makes it the shown one (live).
    const activeIds = new Set(collection.books().map((b) => b.id));
    const hasVer = new Set(versionInfo.map((v) => v.collection));
    const hasLang = new Set(langInfo.map((l) => l.collection));
    const families = collection.families();
    const familyTitle = new Map(families.map((f) => [f.id, f.title]));
    const byCol = new Map<string, DocVariant[]>();
    for (const v of variants) {
      (
        byCol.get(v.collection) ??
        byCol.set(v.collection, []).get(v.collection)!
      ).push(v);
    }
    // Order groups by a stable key — the collection id. `families()` is *load*
    // order, which reshuffles when a language switch changes the loaded set (and
    // titles are language-dependent too), so neither is stable across a switch.
    const order = [...byCol.keys()].sort((a, b) => a.localeCompare(b));

    const groups =
      order
        .filter((c) => byCol.has(c))
        .map((col) => {
          const eds = [...byCol.get(col)!].sort(
            (a, b) =>
              compareVersions(b.version, a.version) ||
              a.language.localeCompare(b.language),
          );
          const title = familyTitle.get(col) ?? eds[0]!.title;
          const hint =
            eds.length > 1
              ? `<span class="mg-group-hint">${esc(s.chooseEdition)}</span>`
              : "";
          const rows = eds
            .map((v) => {
              const active = activeIds.has(v.id);
              const o = v.origin;
              const remove = o.removeKey
                ? `<button class="mg-remove" ${o.kind === "uploaded" ? `data-remove-id="${esc(o.removeKey)}"` : `data-remove-url="${esc(o.removeKey)}"`}>${esc(s.remove)}</button>`
                : "";
              const packs = o.packs.length
                ? `<span class="mg-packs">${esc(s.packsLabel)} ${o.packs.map((p) => `<span class="mg-pack">${esc(p.split("/").pop() || p)}</span>`).join(" ")}</span>`
                : "";
              // Missing assets are only knowable for a loaded (active) book — its
              // `asset_index` routes to a pack that wasn't loaded. Offer to attach one.
              const missing = active ? collection.missingAssets(v.id) : [];
              const missBadge = missing.length
                ? `<span class="mg-missing" title="${esc(missing.map((m) => m.path).join("\n"))}">${esc(s.missingAssets(missing.length))}</span>` +
                  `<button class="mg-addpack" data-id="${esc(v.id)}">${esc(s.addPack)}</button>`
                : "";
              return (
                `<div class="mg-ed${active ? " active" : ""}" data-col="${esc(col)}" data-ver="${esc(v.version)}" data-lang="${esc(v.language)}" role="button" tabindex="0">` +
                `<span class="mg-ed-dot">${active ? "●" : "○"}</span>` +
                `<span class="mg-ed-vl">${v.version ? `${esc(s.versionLabel)} ${esc(v.version)} · ` : ""}${esc(langLabel(v.language))}</span>` +
                `<span class="mg-badge mg-${o.kind}">${esc(badge(o))}</span>` +
                packs +
                missBadge +
                remove +
                `</div>`
              );
            })
            .join("");
          return (
            `<section class="mg-group"><header class="mg-group-head">` +
            `<span class="mg-group-title">${esc(title)}</span>${hint}</header>` +
            rows +
            `</section>`
          );
        })
        .join("") || `<div class="mg-empty">${esc(s.noDocsets)}</div>`;

    content.innerHTML =
      `<div class="manage-page"><h1 class="mg-h">${esc(s.manageDocsets)}</h1>` +
      `<div class="mg-bar">` +
      `<button class="mg-act mg-open-docset">${esc(s.openDocset)}</button>` +
      `<button class="mg-act mg-open-url">${esc(s.openUrl)}</button>` +
      `<form class="mg-import" id="mg-import"><input class="mg-import-url" type="url" placeholder="https://…/books.khbm" spellcheck="false"><button type="submit" class="mg-act">${esc(s.importManifest)}</button></form>` +
      `</div>` +
      `<div class="mg-import-hint">${esc(s.importManifestHint)}</div>` +
      `<div class="mg-import-err" id="mg-import-err"></div>` +
      `<div class="mg-list">${groups}</div></div>`;

    content
      .querySelector(".mg-open-docset")
      ?.addEventListener("click", () => pickDocset());
    content
      .querySelector(".mg-open-url")
      ?.addEventListener("click", () => openUrl());
    // Clicking an edition pins the version/language needed to make it the shown one
    // (only where the product actually has a choice), then rebuilds live.
    const activate = (el: HTMLElement): void => {
      if (el.classList.contains("active")) return;
      const col = el.getAttribute("data-col");
      if (!col) return;
      if (hasVer.has(col)) {
        const m = loadDocsetVersions();
        m[col] = el.getAttribute("data-ver") ?? "";
        saveDocsetVersions(m);
      }
      if (hasLang.has(col)) {
        const m = loadDocsetLangs();
        m[col] = el.getAttribute("data-lang") ?? "";
        saveDocsetLangs(m);
      }
      void rebuild();
    };
    content.querySelectorAll<HTMLElement>(".mg-ed").forEach((el) =>
      el.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest(".mg-remove")) return;
        activate(el);
      }),
    );
    // Removing a docset changes the loaded set → a full reload re-gathers sources.
    content.querySelectorAll<HTMLElement>(".mg-remove").forEach((btn) =>
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-remove-id");
        const url = btn.getAttribute("data-remove-url");
        if (id) void deleteDocset(id).then(() => location.reload());
        else if (url) {
          removeRemote(url);
          location.reload();
        }
      }),
    );
    // Attach a `.khba` pack (by URL) to supply a book's missing assets. Persisted
    // per docset id and applied on the next load, so a reload re-gathers sources.
    content.querySelectorAll<HTMLElement>(".mg-addpack").forEach((btn) =>
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        if (!id) return;
        const url = prompt(s.addPackPrompt)?.trim();
        if (!url) return;
        addExtraPack(id, url);
        location.reload();
      }),
    );
    const err = content.querySelector<HTMLElement>("#mg-import-err");
    content.querySelector("#mg-import")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const url = content
        .querySelector<HTMLInputElement>(".mg-import-url")
        ?.value.trim();
      if (!url || !err) return;
      err.style.color = "var(--muted)";
      err.textContent = s.openUrlChecking;
      importKhbm(url)
        .then((r) => {
          if (r.added) location.reload();
          else {
            err.style.color = "#a33";
            err.textContent = s.openUrlError;
          }
        })
        .catch(() => {
          err.style.color = "#a33";
          err.textContent = s.openUrlError;
        });
    });
  }

  // ---- Other wiring ----
  const productSel = $<HTMLSelectElement>("#filter-product");
  // (Re)populate the category + product scope selects from the current collection —
  // called on load and after a live switch (categories/family titles can change).
  function fillFilters(): void {
    while (filterSel.options.length > 1) filterSel.remove(1);
    for (const c of collection.categories()) {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.title;
      filterSel.appendChild(o);
    }
    if (!collection.categories().some((c) => c.id === filterCategory)) {
      filterCategory = "";
    }
    filterSel.value = filterCategory;

    while (productSel.options.length > 1) productSel.remove(1);
    const products = collection.products();
    for (const p of products) {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.title;
      productSel.appendChild(o);
    }
    if (!products.some((p) => p.id === filterProduct)) filterProduct = "";
    productSel.value = filterProduct;
    $("#filter-product-row").style.display = products.length > 1 ? "" : "none";
  }
  fillFilters();
  filterSel.addEventListener("change", () => {
    filterCategory = filterSel.value;
    if (mode === "contents") renderTree();
    else if (mode === "index") renderIndex();
  });
  productSel.addEventListener("change", () => {
    filterProduct = productSel.value;
    if (mode === "contents") renderTree();
    else if (mode === "index") renderIndex();
  });

  // Version/language of a versioned or multilingual product is switched from the
  // product's own folder in the tree (the ⋯ button → openFolderMenu), so the
  // control sits next to the book it affects — no disconnected filter dropdown.

  // Language switcher: persist + reload (the content docset changes with the UI).
  // Language selectors — the toolbar one and the mobile ⋯-menu one behave alike.
  const langNames: Record<string, string> = { en: "English", pl: "Polski" };
  document
    .querySelectorAll<HTMLSelectElement>(".lang-select")
    .forEach((sel) => {
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

  // ---- Image lightbox (mobile + desktop) ------------------------------------
  // The content frame posts a tapped image's data: URL; we show it in a fullscreen
  // overlay that zooms (wheel on desktop, pinch on touch, double-tap/-click) and
  // pans when zoomed. Built lazily, once, and reused for every image.
  let lightbox: { show: (src: string, alt: string) => void } | null = null;
  function openLightbox(src: string, alt: string): void {
    lightbox ??= buildLightbox();
    lightbox.show(src, alt);
  }
  function buildLightbox(): { show: (src: string, alt: string) => void } {
    const overlay = document.createElement("div");
    overlay.className = "lightbox";
    overlay.hidden = true;
    const img = document.createElement("img");
    img.className = "lightbox-img";
    img.draggable = false;
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "lightbox-close";
    closeBtn.textContent = "×";
    closeBtn.setAttribute("aria-label", s.close);
    overlay.append(img, closeBtn);
    document.body.appendChild(overlay);

    const MIN = 1;
    const MAX = 6;
    let scale = 1;
    let tx = 0;
    let ty = 0;
    const apply = (): void => {
      img.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`;
      overlay.classList.toggle("zoomed", scale > 1.01);
    };
    const reset = (): void => {
      scale = 1;
      tx = 0;
      ty = 0;
      apply();
    };
    const close = (): void => {
      overlay.hidden = true;
      img.removeAttribute("src");
      reset();
    };
    // Zoom to `factor` around a viewport point, keeping that point stationary.
    const zoomAt = (cx: number, cy: number, factor: number): void => {
      const next = Math.min(MAX, Math.max(MIN, scale * factor));
      if (next === scale) return;
      const px = cx - window.innerWidth / 2;
      const py = cy - window.innerHeight / 2;
      tx = px - ((px - tx) * next) / scale;
      ty = py - ((py - ty) * next) / scale;
      scale = next;
      if (scale <= MIN + 0.001) {
        tx = 0;
        ty = 0;
      }
      apply();
    };

    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", (e) => {
      if (!overlay.hidden && e.key === "Escape") close();
    });
    overlay.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
      },
      { passive: false },
    );
    img.addEventListener("dblclick", (e) => {
      e.preventDefault();
      if (scale > 1.01) reset();
      else zoomAt(e.clientX, e.clientY, 2.5);
    });

    // Pointer events unify mouse + touch: one pointer pans (when zoomed), two
    // pinch-zoom around their midpoint.
    const pts = new Map<number, { x: number; y: number }>();
    let startDist = 0;
    let startScale = 1;
    let mid = { x: 0, y: 0 };
    let panning = false;
    let lastX = 0;
    let lastY = 0;
    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === closeBtn) return;
      overlay.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        startDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        startScale = scale;
        mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
        panning = false;
      } else if (pts.size === 1 && scale > 1.01) {
        panning = true;
        lastX = e.clientX;
        lastY = e.clientY;
      }
    });
    overlay.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && startDist > 0) {
        const [a, b] = [...pts.values()];
        const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        const target = Math.min(
          MAX,
          Math.max(MIN, startScale * (dist / startDist)),
        );
        zoomAt(mid.x, mid.y, target / scale);
      } else if (panning) {
        tx += e.clientX - lastX;
        ty += e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        apply();
      }
    });
    const release = (e: PointerEvent): void => {
      pts.delete(e.pointerId);
      if (pts.size < 2) startDist = 0;
      if (pts.size === 0) panning = false;
    };
    overlay.addEventListener("pointerup", release);
    overlay.addEventListener("pointercancel", release);

    return {
      show: (src, alt) => {
        img.src = src;
        img.alt = alt;
        // SVG is vector: let it scale up to fill the overlay (crisp at any size)
        // rather than sit at its small intrinsic width. Raster stays capped so it
        // isn't upscaled into a blur.
        img.classList.toggle("svg", src.startsWith("data:image/svg+xml"));
        reset();
        overlay.hidden = false;
      },
    };
  }

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
      src?: unknown;
      alt?: unknown;
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
    } else if (
      d.a === "img" &&
      typeof d.src === "string" &&
      d.src.startsWith("data:image/")
    ) {
      // Untrusted source, but constrained to an inline image — safe to display.
      openLightbox(d.src, typeof d.alt === "string" ? d.alt : "");
    } else if (d.a === "pull" && getRemotes().length) {
      // Pull-to-refresh from the content — only meaningful with remote docsets
      // (a reload re-fetches them on bootstrap; the session is restored).
      status.textContent = s.refreshing;
      location.reload();
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
  if (updates.length) showVersionToast(updates, s);
  setMode("contents");
  // A hash deep link, if any (our own navigation also parks the current page here,
  // so it usually just names the session's active page on reload).
  const deepLink = pages.has(location.hash.slice(1))
    ? location.hash.slice(1)
    : "";
  const firstPageId = pages.keys().next().value ?? "";
  const validTab = (t: { id: string }): boolean =>
    t.id === SEARCH_ID ||
    // A persisted Manage tab from a prior unlocked session must not survive into
    // a locked (bundled) build — the lock hides docset management entirely.
    (t.id === MANAGE_ID && config.externalSources) ||
    pages.has(t.id);
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
    // Cold start (no session, no deep link): the publisher's chosen home, or the
    // Search page by default (search-first). An invalid page id falls back too.
    const home = config.home ?? "search";
    if (home === "search") openSearchPage("");
    else if (pages.has(home)) openPage(home);
    else openPage(firstPageId);
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
