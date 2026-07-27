---
title: Deploy to Cloudflare
keywords: [deploy, Cloudflare, Worker, R2, template, workers.dev]
categories: [registry, deployment]
related: [index, configuration, updates, troubleshooting]
---

# Deploy to Cloudflare

The supported installation path is the public
[`KDHelpBook/cf-registry-template`](https://github.com/KDHelpBook/cf-registry-template).
It contains a thin Worker entrypoint, an exactly pinned registry package,
Wrangler configuration, CI, and one instance configuration file.

## One-click deployment

1. Open the template and click **Deploy to Cloudflare**.
2. Choose the GitHub organization or account that will own the instance
   repository.
3. Connect the repository to your Cloudflare account.
4. Keep `main` as the production branch.
5. Leave non-production branch deployments and preview URLs disabled.
6. Wait for Cloudflare to deploy the Worker and provision its `DOCSETS` R2
   bucket.
7. Open the generated `*.workers.dev` address.

A new registry is intentionally empty. It opens the **Manage docsets** page;
**File → Open docset**, **Open from URL**, and **Help → About** remain available
before the first automated publication.

## Configure the instance

Edit `khb-registry.yml` in the generated repository and run:

```sh
npm ci
npm run validate
npm run build
```

Commit the configuration and merge it to `main`. Cloudflare deploys production
from `main`; pull requests only validate, typecheck, and build the instance, so
unreviewed code never receives access to the production R2 bucket.

## Local development

```sh
npm ci
npm run check
npm run dev
```

Wrangler uses a local R2 database under `.wrangler`. Generated runtime JSON and
viewer assets live under `.khb-registry`; both directories are disposable and
must not be edited by hand.

Use `npm run deploy` for a deliberate manual production deployment. Normal
instance updates should be merged to `main` and deployed by the connected
Cloudflare build.
