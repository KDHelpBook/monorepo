// Detect docsets whose version changed since we last saw them, so the viewer can
// announce it once. "Seen" versions are keyed by docset id and persisted between
// sessions (see uistate); re-fetched remotes and re-uploaded files flow through
// here. A docset first seen (no prior entry) is recorded silently — only a change
// from a known version is an "update". Docsets without a version are ignored.

export interface VersionedDocset {
  id: string;
  title: string;
  version: string;
}

export interface VersionUpdate {
  title: string;
  from: string;
  to: string;
}

export function detectUpdates(
  current: VersionedDocset[],
  seen: Record<string, string>,
): { updates: VersionUpdate[]; nextSeen: Record<string, string> } {
  const nextSeen = { ...seen };
  const updates: VersionUpdate[] = [];
  for (const d of current) {
    if (!d.version) continue;
    const was = nextSeen[d.id];
    if (was && was !== d.version) {
      updates.push({ title: d.title, from: was, to: d.version });
    }
    nextSeen[d.id] = d.version;
  }
  return { updates, nextSeen };
}

// --- version selection (V3: several versions of a product loaded at once) -----

export interface CollectionVersioned {
  collection: string;
  version: string;
}

/**
 * Order two dotted versions numerically where possible (`1.10.0 > 1.2.0`),
 * falling back to string comparison for non-numeric segments. Missing trailing
 * segments count as 0 (`1.2 == 1.2.0`). Returns -1 / 0 / 1.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const sa = pa[i] ?? "0";
    const sb = pb[i] ?? "0";
    const na = Number(sa);
    const nb = Number(sb);
    if (Number.isFinite(na) && Number.isFinite(nb)) {
      if (na !== nb) return na < nb ? -1 : 1;
    } else if (sa !== sb) {
      return sa < sb ? -1 : 1;
    }
  }
  return 0;
}

/** The highest of a set of versions (by `compareVersions`); "" if empty. */
export function latestVersion(versions: string[]): string {
  return versions.reduce(
    (best, v) => (compareVersions(v, best) > 0 ? v : best),
    versions[0] ?? "",
  );
}

/** Distinct versions available per collection, sorted latest-first. */
export function versionsByCollection<T extends CollectionVersioned>(
  variants: T[],
): Map<string, string[]> {
  const byCol = new Map<string, string[]>();
  for (const v of variants) {
    const vs =
      byCol.get(v.collection) ?? byCol.set(v.collection, []).get(v.collection)!;
    if (!vs.includes(v.version)) vs.push(v.version);
  }
  for (const vs of byCol.values()) vs.sort((a, b) => compareVersions(b, a));
  return byCol;
}

/** The version chosen for one collection: a valid override, else the latest. */
export function chooseCollectionVersion(
  versions: string[],
  override: string | undefined,
): string {
  if (override && versions.includes(override)) return override;
  return latestVersion(versions);
}

/**
 * Keep only the chosen version of each collection — the latest by default, or the
 * reader's per-collection override. Other versions of that product are dropped, so
 * the same book doesn't appear once per version in the merged TOC.
 */
export function pickVersions<T extends CollectionVersioned>(
  variants: T[],
  overrides: Record<string, string>,
): T[] {
  const byCol = versionsByCollection(variants);
  const chosen = new Map<string, string>();
  for (const [col, versions] of byCol) {
    chosen.set(col, chooseCollectionVersion(versions, overrides[col]));
  }
  return variants.filter((v) => v.version === chosen.get(v.collection));
}
