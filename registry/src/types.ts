/** Bindings + config shapes shared across the worker's modules. */

export interface Env {
  DOCSETS: R2Bucket;
  REGISTRY_AUDIENCE: string;
  /** Static-assets binding (the built viewer). Absent in unit tests. */
  ASSETS?: Fetcher;
}

/** One published edition of a docset, as recorded in its `latest.json`. */
export interface PublishedVersion {
  version: string;
  /** `.khb` filename under `docsets/<id>/<version>/`. */
  file: string;
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
  id: string;
  title: string;
  language: string;
  collection: string;
  versions: PublishedVersion[];
}

/** An entry of config/permissions.json: what one repository may publish. */
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
  schema: number;
  /** Documentation copy of the OIDC audience (the binding `REGISTRY_AUDIENCE`
   *  is what the worker actually enforces). */
  audience: string;
  publishers: Publisher[];
}

/** config/site.json — central presentation config for the generated manifest. */
export interface SiteConfig {
  /** Manifest entry order by docset id; unlisted ids append in listing order. */
  order?: string[];
  /** The `folders` tree, emitted verbatim into docsets.json (viewer schema). */
  folders?: unknown[];
  /** Served as `config.json` (mirrors the CLI's pack profile output). */
  config?: { externalSources?: boolean; pwa?: boolean; home?: string };
}

/** The subset of GitHub Actions OIDC claims the registry authorizes on. */
export interface ActionsClaims {
  repository: string;
  ref?: string;
  environment?: string;
  sub?: string;
}
