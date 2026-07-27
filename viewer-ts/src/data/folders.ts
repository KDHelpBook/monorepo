/**
 * The manifest's optional `folders` tree: nested folders grouping product
 * families (`collection` ids) above the family level in the TOC.
 *
 * `Collection.tocTree` keeps emitting one `@collection:<id>` root per family;
 * `applyFolders` post-processes those roots, re-parenting each referenced
 * family under `@shelf:<folderId>` group nodes. Families the tree doesn't
 * mention — including uploaded and remote books, whose collections are never
 * in the shipped manifest — stay at the root, after the folders, in their
 * original order. DOM-free on purpose (unit-testable like manifest.ts).
 */

import type { TocNode } from "./docset";
import type { FolderNode, FolderRef } from "./manifest";

/** The synthetic pageId prefix of folder rows (cf. `@collection:`, `@folder:`). */
export const SHELF_PREFIX = "@shelf:";

const isRef = (c: FolderRef | FolderNode): c is FolderRef =>
  typeof (c as FolderRef).collection === "string";

/**
 * Lenient structural validation of `manifest.folders`. The manifest gets no
 * runtime validation elsewhere (it is a trusted build artifact), but a broken
 * `folders` value must not brick boot: on any violation — wrong shapes,
 * duplicate folder ids, a collection placed twice — warn and drop the field.
 */
export function sanitizeFolders(value: unknown): FolderNode[] {
  if (value === undefined) return [];
  const ids = new Set<string>();
  const refs = new Set<string>();
  const node = (v: unknown): v is FolderNode | FolderRef => {
    if (typeof v !== "object" || v === null) return false;
    const f = v as Partial<FolderNode & FolderRef>;
    if (typeof f.collection === "string") {
      if (refs.has(f.collection)) return false; // placed twice
      refs.add(f.collection);
      return true;
    }
    if (typeof f.id !== "string" || typeof f.title !== "string") return false;
    if (ids.has(f.id)) return false; // duplicate folder id
    ids.add(f.id);
    if (f.titles !== undefined) {
      if (typeof f.titles !== "object" || f.titles === null) return false;
      if (Object.values(f.titles).some((t) => typeof t !== "string"))
        return false;
    }
    if (f.children !== undefined) {
      if (!Array.isArray(f.children)) return false;
      if (!f.children.every(node)) return false;
    }
    return true;
  };
  if (Array.isArray(value) && value.every((v) => node(v) && !isRef(v))) {
    return value as FolderNode[];
  }
  console.warn("docsets.json: ignoring invalid `folders` field", value);
  return [];
}

/** Every collection id the tree references (drives `tocTree`'s forceFolders). */
export function folderCollections(folders: FolderNode[]): Set<string> {
  const out = new Set<string>();
  const walk = (f: FolderNode): void => {
    for (const c of f.children ?? []) {
      if (isRef(c)) out.add(c.collection);
      else walk(c);
    }
  };
  folders.forEach(walk);
  return out;
}

/** A folder's display title for the given UI language. */
export function folderTitle(f: FolderNode, uiLang: string): string {
  return f.titles?.[uiLang] ?? f.title;
}

/**
 * Re-parent family-level TOC roots (`@collection:<id>` group nodes) into the
 * folder tree. Refs to families that aren't loaded are dropped, and so are
 * folders left with no children; unconsumed roots stay at the root, after the
 * folders, in their original order.
 */
export function applyFolders(
  roots: TocNode[],
  folders: FolderNode[],
  uiLang: string,
): TocNode[] {
  if (!folders.length) return roots;
  const byCollection = new Map<string, TocNode>();
  for (const r of roots) {
    if (r.pageId.startsWith("@collection:")) {
      byCollection.set(r.pageId.slice("@collection:".length), r);
    }
  }
  const consumed = new Set<TocNode>();
  const build = (f: FolderNode): TocNode | null => {
    const children: TocNode[] = [];
    for (const c of f.children ?? []) {
      if (isRef(c)) {
        const root = byCollection.get(c.collection);
        if (root && !consumed.has(root)) {
          consumed.add(root);
          children.push(root);
        }
      } else {
        const sub = build(c);
        if (sub) children.push(sub);
      }
    }
    if (!children.length) return null;
    return {
      pageId: SHELF_PREFIX + f.id,
      title: folderTitle(f, uiLang),
      group: true,
      children,
    };
  };
  const shelves = folders
    .map(build)
    .filter((n): n is TocNode => n !== null);
  return [...shelves, ...roots.filter((r) => !consumed.has(r))];
}
