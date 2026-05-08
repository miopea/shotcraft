# Publishing Shotcraft

Operator-side prerequisites to ship the v0.1 release to npm and to
deploy the docs site to shotcraft.dev. Most of these are one-time
setup; once they're done, releases happen via Changesets PRs that the
maintainer merges.

## One-time setup

### 1. Register the `@shotcraft` npm scope

The first-party templates (`@shotcraft/template-*`) and the hosted
companion (`@shotcraft/web`) all publish under the `@shotcraft` scope.
Without it, `pnpm changeset publish` will fail on the first
`@shotcraft/template-*` package.

```bash
# At https://www.npmjs.com/org/create — pick the free "Open Source" tier.
# The org name has to be `shotcraft`.
```

The bare `shotcraft` package (the CLI + programmatic API) doesn't need
the scope — it publishes to the registry root.

### 2. Create the GitHub repo

```bash
gh repo create miopea/shotcraft --public \
  --description "Capture your live app and ship App Store-ready screenshots, README hero images, and social cards in one command." \
  --homepage "https://shotcraft.dev"
git push -u origin main
```

The repo has commits queued for v0.1; the first push lands all of them.

### 3. Wire up the npm token

Generate a granular automation token at npmjs.com (Account → Access
Tokens → Generate New Token → Granular):

- **Name**: `shotcraft-ci`
- **Expiration**: 90 days (rotate on a calendar reminder)
- **Permissions** → Packages and scopes:
  - `shotcraft` — Read and write
  - `@shotcraft/*` — Read and write
- **Allowed organization**: leave blank for personal account
- **Allowed IP ranges**: leave blank or restrict to GitHub Actions IPs

Then add it to the repo as a secret:

```bash
gh secret set NPM_TOKEN
# paste the token when prompted
```

The `release.yml` workflow already references `secrets.NPM_TOKEN`.

### 4. Buy `shotcraft.dev`

Registers anywhere — Cloudflare and Porkbun are both fine. Add the
following DNS records once you've picked a host:

- **A**: `@` → host's IPv4
- **CNAME**: `www` → `@`

Then point Cloudflare Pages / Netlify / Azure Static Web Apps at
`docs/` with build command `pnpm --filter @shotcraft/docs build` and
output dir `docs/dist`.

### 5. Confirm the lockfile reflects the workspace

After cloning fresh and running `pnpm install`, `git status` should be
clean. CI uses `--frozen-lockfile`; a drifted lockfile fails the build.

## Releasing

The release workflow is fully automated once the prerequisites are in
place.

### Adding a Changeset

Every PR that bumps a package version needs a Changeset entry. Run:

```bash
pnpm changeset
```

The interactive prompt asks which packages changed and at what level
(major / minor / patch). It writes a Markdown file under `.changeset/`
that you commit alongside your code change.

```markdown
---
"shotcraft": minor
"@shotcraft/template-app-store-iphone": patch
---

Brief explanation of what changed and why.
```

### How a release ships

1. **PR merges to `main`** carrying queued Changeset files.
2. **`release.yml` runs** on every push to `main`. The
   `changesets/action@v1` step:
   - If unreleased Changesets exist: opens (or updates) a PR titled
     "release: version packages" that bumps versions, deletes the
     consumed `.changeset/*.md` files, and updates each package's
     `CHANGELOG.md`.
   - Otherwise, runs `pnpm release` (which invokes
     `changeset publish`) — actually publishing the bumped versions
     to npm, creating GitHub Releases, and tagging the commit.
3. **Maintainer reviews** the "release: version packages" PR. Merging
   it triggers another `release.yml` run, which finds no unreleased
   Changesets and proceeds to publish.

### Dry-run a publish locally

```bash
pnpm changeset version          # apply pending bumps locally (don't commit)
pnpm changeset publish --dry-run
```

The dry-run prints which packages would publish, at which versions,
without actually pushing to npm. Use this before merging a release PR
when the changes are non-trivial.

> **Tip**: if `--dry-run` reports zero packages to publish, it usually
> means `pnpm changeset version` was a no-op (no consumed Changesets) —
> check that `.changeset/*.md` files exist before bumping.

### First-release version numbers

Verified on the Phase 7 v0.1 launch — running `pnpm changeset version`
against the queued v0.1 changesets produces:

| Package                                 | Bump                | Version |
| --------------------------------------- | ------------------- | ------- |
| `shotcraft`                             | minor (× 2) + patch | 0.1.0   |
| `@shotcraft/template-app-store-iphone`  | minor + patch       | 1.0.0   |
| `@shotcraft/template-app-store-ipad`    | minor + patch       | 1.0.0   |
| `@shotcraft/template-play-store-phone`  | minor + patch       | 1.0.0   |
| `@shotcraft/template-play-store-tablet` | minor + patch       | 1.0.0   |
| `@shotcraft/template-readme-hero`       | minor + patch       | 1.0.0   |
| `@shotcraft/template-social-og-card`    | minor + patch       | 1.0.0   |

The templates land at 1.0.0 because Changesets treats packages
previously at `0.0.0` as "unreleased" and bumps them past 0.x on the
first publish. That's an appropriate signal: the template _contract_
is stable (everything in
[`packages/core/src/template/types.ts`](./packages/core/src/template/types.ts)
ships v1), even while the surrounding `shotcraft` API is still v0.1.

If you want a template to come out at `0.1.0` instead, set its
`package.json` `version` to `0.0.1` before running
`changeset version` — Changesets treats any non-zero start as a
standard semver bump.

### Provenance

The `release.yml` workflow has `id-token: write` permission, which is
the OIDC trust signal `npm publish --provenance` needs. To opt
packages into provenance, add to each package's `package.json`:

```json
{
  "publishConfig": {
    "provenance": true,
    "access": "public"
  }
}
```

`access: public` is also required for `@shotcraft/*` scoped packages —
without it, npm defaults to `restricted` (private) for scoped
packages, and the publish fails.

All seven publishable packages (`shotcraft` + the six
`@shotcraft/template-*`) ship `publishConfig: { access: "public", provenance: true }`.

## Azure deployment (current)

Both Azure surfaces are live in the operator's `bfg-solutions` resource
group (eastus2). Free temporary URLs work today; `shotcraft.dev`
custom domains land when the apex is purchased.

| Resource             | Type                        | URL                                                    |
| -------------------- | --------------------------- | ------------------------------------------------------ |
| `bfg-solutions-plan` | App Service Plan (B1 Linux) | — (hosts shotcraft-web)                                |
| `shotcraft-web`      | App Service Linux           | https://shotcraft-web.azurewebsites.net                |
| `shotcraft-docs`     | Static Web App              | https://ambitious-sand-0f2523b0f.7.azurestaticapps.net |

`SHOTCRAFT_LIVE_DEMO` is **off** in production — the live-demo
endpoint returns 403 with a "run locally" pointer. App Service B1's
1.75 GB RAM doesn't comfortably host headless Chromium; if live-demo
ever needs to run in the cloud, migrate to Azure Container Apps with
a Playwright-bearing Dockerfile.

### How they were created

```bash
# App Service Plan + Web App
az appservice plan create \
  -g bfg-solutions -n bfg-solutions-plan \
  --is-linux --sku B1 --location eastus2

az webapp create \
  -g bfg-solutions -n shotcraft-web \
  -p bfg-solutions-plan --runtime "NODE:22-lts"

az webapp config set \
  -g bfg-solutions -n shotcraft-web \
  --startup-file "node server/dist/index.js"

az webapp config appsettings set \
  -g bfg-solutions -n shotcraft-web \
  --settings NODE_ENV=production \
             WEBSITE_NODE_DEFAULT_VERSION=22 \
             SCM_DO_BUILD_DURING_DEPLOYMENT=false

# Static Web App (free tier)
az staticwebapp create \
  -g bfg-solutions -n shotcraft-docs \
  --location eastus2 --sku Free
```

### Manual deploy (one-off)

```bash
# Docs → SWA
pnpm --filter @shotcraft/docs build
SWA_TOKEN=$(az staticwebapp secrets list \
  -g bfg-solutions -n shotcraft-docs \
  --query properties.apiKey -o tsv)
npx --yes @azure/static-web-apps-cli deploy docs/dist \
  --deployment-token "$SWA_TOKEN" --env production --no-use-keychain

# @shotcraft/web → App Service.
# App Service can't consume our pnpm workspace directly, so stage a
# self-contained bundle (server/dist + dist/client + minimal
# package.json + npm-installed node_modules), zip it, and push.
pnpm --filter @shotcraft/web build
DEPLOY=/tmp/shotcraft-web-deploy
rm -rf "$DEPLOY" && mkdir -p "$DEPLOY/server" "$DEPLOY/dist"
cp -r packages/web/server/dist  "$DEPLOY/server/dist"
cp -r packages/web/dist/client  "$DEPLOY/dist/client"
cat > "$DEPLOY/package.json" <<'EOF'
{
  "name": "shotcraft-web-deploy",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "server/dist/index.js",
  "scripts": { "start": "node server/dist/index.js" },
  "dependencies": { "express": "^5.0.0" },
  "engines": { "node": ">=20" }
}
EOF
(cd "$DEPLOY" && npm install --omit=dev --silent)
(cd "$DEPLOY" && zip -rq /tmp/shotcraft-web.zip .)
az webapp deploy \
  -g bfg-solutions -n shotcraft-web \
  --src-path /tmp/shotcraft-web.zip --type zip
```

### Automated deploy (GitHub Actions)

[`.github/workflows/deploy-azure.yml`](./.github/workflows/deploy-azure.yml)
runs both deploys on push to `main`. Two repo secrets are required:

```bash
# SWA deployment token
gh secret set AZURE_STATIC_WEB_APPS_API_TOKEN --body "$(
  az staticwebapp secrets list \
    -g bfg-solutions -n shotcraft-docs \
    --query properties.apiKey -o tsv
)"

# App Service publish profile (XML)
gh secret set AZURE_WEBAPP_PUBLISH_PROFILE --body "$(
  az webapp deployment list-publishing-profiles \
    -g bfg-solutions -n shotcraft-web --xml
)"
```

The workflow is currently dormant (no GitHub repo yet); it activates as
soon as `miopea/shotcraft` lands.

### Custom domain (Cloudflare-managed)

`bfgsolutions.net` DNS lives at Cloudflare. To put the docs site at
`shotcraft.bfgsolutions.net`:

1. **In Cloudflare**, add a `CNAME` record:
   - Name: `shotcraft`
   - Target: `ambitious-sand-0f2523b0f.7.azurestaticapps.net`
   - Proxy status: **DNS only** (Azure handles SSL).
2. **Then run**:
   ```bash
   az staticwebapp hostname set \
     -g bfg-solutions -n shotcraft-docs \
     --hostname shotcraft.bfgsolutions.net \
     --validation-method cname-delegation
   ```
3. SSL provisions automatically; takes ~5 minutes.

When `shotcraft.dev` is purchased, repeat the same flow against the new
apex (use `--validation-method dns-txt-token` for the apex via Azure DNS,
or keep CF and use `cname-delegation` for `www.shotcraft.dev`).

### Cloudflare Pages (alternative for docs)

If you ever decouple from Azure for the docs site, Cloudflare Pages
works fine — it has tighter Astro tooling. Keep this as a fallback,
not a primary plan, while the BFG/Azure setup is already paid for.

```bash
# In the Cloudflare dashboard:
# 1. Pages → Create a project → Connect to Git
# 2. Pick miopea/shotcraft, branch `main`
# 3. Build settings:
#    - Framework preset: Astro
#    - Build command: pnpm install && pnpm --filter @shotcraft/docs build
#    - Build output directory: docs/dist
#    - Environment variables:
#        NODE_VERSION=20
```

## Status

| Prerequisite                          | Status               |
| ------------------------------------- | -------------------- |
| `@shotcraft` npm scope                | 🟡 Operator action   |
| `miopea/shotcraft` GitHub repo    | 🟡 Operator action   |
| `NPM_TOKEN` GitHub secret             | 🟡 Operator action   |
| `shotcraft.dev` domain                | 🟡 Operator action   |
| `release.yml` workflow                | ✅ Wired             |
| `ci.yml` workflow                     | ✅ Wired             |
| `deploy-azure.yml` workflow           | ✅ Wired             |
| Changesets configured                 | ✅ Wired             |
| `publishConfig` on packages           | ✅ Wired             |
| `bfg-solutions-plan` App Service Plan | ✅ Provisioned       |
| `shotcraft-web` App Service           | ✅ Live + deployed   |
| `shotcraft-docs` Static Web App       | ✅ Live + deployed   |
| `shotcraft.bfgsolutions.net` CNAME    | 🟡 Cloudflare action |
| `AZURE_*` GitHub secrets              | 🟡 Operator action   |
