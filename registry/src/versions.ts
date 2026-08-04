/**
 * Which published editions a docset offers readers.
 *
 * R2 keeps every edition for ever (the keys are immutable), but a manifest that
 * listed all of them would grow without bound and bury the current release in a
 * switcher of near-identical patches. So `site.versions` picks: nothing (the
 * default), everything, or the newest patch of each minor series — optionally
 * capped to the N newest.
 */

import type {
  LatestPointer,
  PublishedVersion,
  VersionsPolicy,
  VersionsRule,
} from "./types";

/**
 * Order two dotted versions numerically where possible (`1.10.0 > 1.2.0`),
 * falling back to string comparison for non-numeric segments. Missing trailing
 * segments count as 0 (`1.2 == 1.2.0`). Returns -1 / 0 / 1.
 *
 * Mirrors `compareVersions` in viewer-ts/src/data/versions.ts (and
 * `compare_versions` in compiler/cli/src/version.rs) — the viewer decides which
 * listed edition is "latest", so the three must order identically. Keep them in
 * sync; their test cases are deliberately the same.
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

/** The `<major>.<minor>` series a version belongs to; a version that isn't
 *  dotted-numeric is its own series (nothing else can supersede it). */
export function minorSeries(version: string): string {
  const parts = version.split(".");
  const numeric = parts.every((p) => p !== "" && Number.isFinite(Number(p)));
  if (!numeric) return version;
  return `${Number(parts[0])}.${Number(parts[1] ?? 0)}`;
}

/** The rule in force for one docset: its override merged over the site rule. */
export function ruleFor(
  policy: VersionsPolicy | undefined,
  docsetId: string,
): VersionsRule {
  const site: VersionsRule = { mode: policy?.mode, keep: policy?.keep };
  const override = policy?.docsets?.[docsetId];
  return override ? { ...site, ...override } : site;
}

/**
 * The **older** editions a pointer offers, newest first. The current edition is
 * the manifest entry itself, so it never appears here.
 *
 * Editions that carry no display metadata of their own were published by an
 * engine older than pointer schema 2. They are not offered — the switcher can't
 * honestly name them — but nothing deletes them: they stay reachable at
 * `/d/<id>/<version>/<file>`.
 */
export function selectEditions(
  pointer: LatestPointer,
  rule: VersionsRule,
): PublishedVersion[] {
  const mode = rule.mode ?? "latest";
  if (mode === "latest") return [];
  const complete = pointer.versions.filter(
    (v) => v.title && v.language && v.collection && v.version !== pointer.version,
  );
  const ordered = [...complete].sort((a, b) =>
    compareVersions(b.version, a.version),
  );
  const picked =
    mode === "minor" ? newestPerSeries(ordered, pointer.version) : ordered;
  const keep = rule.keep;
  return keep !== undefined && keep >= 0 ? picked.slice(0, keep) : picked;
}

/** One edition per minor series, keeping the newest — and dropping the series the
 *  current edition already represents (`1.4.2` current hides `1.4.1`). */
function newestPerSeries(
  ordered: PublishedVersion[],
  currentVersion: string,
): PublishedVersion[] {
  const seen = new Set([minorSeries(currentVersion)]);
  const out: PublishedVersion[] = [];
  for (const edition of ordered) {
    const series = minorSeries(edition.version);
    if (seen.has(series)) continue;
    seen.add(series);
    out.push(edition);
  }
  return out;
}
