/** Bindings + config shapes shared across the worker's modules. */

export interface Env {
  DOCSETS: R2Bucket;
  /** Static-assets binding (the built viewer). Absent in unit tests. */
  ASSETS?: Fetcher;
}

/** One published edition of a docset, as recorded in its `latest.json`.
 *
 *  The display metadata is stored **per edition**: a book can be retitled — or
 *  moved to another collection — between releases, and the viewer's version
 *  switcher must name each edition as it was published. Editions written before
 *  this became part of the format carry none, and the manifest omits them (see
 *  `selectEditions`); they stay downloadable under `/d/<id>/<version>/…`. */
export interface PublishedVersion {
  version: string;
  /** `.khb` filename under `docsets/<id>/<version>/`. */
  file: string;
  title: string;
  language: string;
  collection: string;
  /** Stable content identity used by the viewer's HTTP/offline cache. Older
   *  pointers may omit it; new publishes use the R2 object's ETag. */
  hash?: string;
  /** Sidecar `.khba` filenames under the same prefix. */
  attachments: string[];
  publishedAt: string;
  /** The `repository` OIDC claim of the publisher, for audit. */
  repository: string;
}

/**
 * `docsets/<id>/latest.json` — the docset's single mutable object: the current
 * edition plus its display metadata (from `khb inspect`, supplied at finalize),
 * with prior editions folded into `versions` (newest first). Everything else
 * under `docsets/<id>/` is immutable, so this one atomic write IS the publish.
 */
export interface LatestPointer extends PublishedVersion {
  /** Pointer format. Version 2 records display metadata on every edition; a
   *  pointer without it was written by an older engine. */
  schema: 2;
  id: string;
  versions: PublishedVersion[];
}

/** What one repository may publish in a registry instance. */
export interface Publisher {
  repository: string;
  /** Exact ref to require (e.g. `refs/heads/main`); null/absent = any ref. */
  ref?: string | null;
  /** GitHub environment to require; null/absent = any. */
  environment?: string | null;
  /** Docset ids this repository may write. The isolation boundary. */
  docsets: string[];
  /** Allow `?force=1` republish of an existing version. Default false. */
  force?: boolean;
}

export interface PermissionsConfig {
  publishers: Publisher[];
}

/** How much of a docset's published history the manifest offers readers.
 *
 *  - `latest` (default) — only the current edition, as before this knob existed;
 *  - `all` — every edition still recorded in the pointer;
 *  - `minor` — the newest patch of each minor series (`1.4.2` hides `1.4.1`),
 *    the archive convention the publishing docs recommend.
 *
 *  `keep` then caps the offer to the N newest editions. The current edition is
 *  always listed, whatever the rule says. */
export interface VersionsRule {
  mode?: "latest" | "all" | "minor";
  keep?: number;
}

/** Site-wide version policy, with optional per-docset overrides. */
export interface VersionsPolicy extends VersionsRule {
  docsets?: Record<string, VersionsRule>;
}

/** Central presentation config for the generated viewer manifest. */
export interface SiteConfig {
  /** Manifest entry order by docset id; unlisted ids append in listing order. */
  order?: string[];
  /** Which older editions the manifest offers. Absent ⇒ current edition only. */
  versions?: VersionsPolicy;
  /** The `folders` tree, emitted verbatim into docsets.json (viewer schema). */
  folders?: unknown[];
  /** Served as `config.json` (mirrors the CLI's pack profile output). */
  config?: {
    externalSources?: boolean;
    pwa?: boolean;
    home?: string;
    /** Default the viewer's per-device offline-prefetch toggle to on. */
    prefetch?: boolean;
    /** Hide and hard-disable the offline-prefetch feature. */
    prefetchLocked?: boolean;
  };
}

/**
 * khb-registry.yml — the complete, versioned configuration of one registry
 * instance. It is validated by the package CLI before Wrangler sees it.
 */
export interface RegistryConfig {
  schema: 1;
  site: SiteConfig;
  publishers: Publisher[];
}

/** The subset of GitHub Actions OIDC claims the registry authorizes on. */
export interface ActionsClaims {
  repository: string;
  ref?: string;
  environment?: string;
  sub?: string;
}
