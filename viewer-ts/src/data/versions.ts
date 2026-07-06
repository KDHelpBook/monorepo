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
