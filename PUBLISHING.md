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

## Deploying the docs site

The docs site is a static Astro Starlight build:

```bash
pnpm --filter @shotcraft/docs build
# Output: docs/dist/
```

### Cloudflare Pages (recommended)

```bash
# In the Cloudflare dashboard:
# 1. Pages → Create a project → Connect to Git
# 2. Pick miopea/shotcraft, branch `main`
# 3. Build settings:
#    - Framework preset: Astro
#    - Build command: pnpm install && pnpm --filter @shotcraft/docs build
#    - Build output directory: docs/dist
#    - Root directory: (leave blank)
#    - Environment variables:
#        NODE_VERSION=20
#        NPM_FLAGS=--version    # disables Cloudflare's npm install
# 4. Custom domain: shotcraft.dev (CNAME flattening handles the apex)
```

### Netlify (alternative)

```toml
# netlify.toml at the repo root
[build]
  command = "pnpm install && pnpm --filter @shotcraft/docs build"
  publish = "docs/dist"

[build.environment]
  NODE_VERSION = "20"
```

## Hosted companion (`@shotcraft/web`)

The hosted companion is currently scaffolded in
[`packages/web/`](./packages/web). Phase 8 builds out the templates
gallery, config builder, and live-demo UI on top of that scaffold.
Deployment to Azure App Service is planned but not yet wired.

## Status

| Prerequisite                  | Status             |
| ----------------------------- | ------------------ |
| `@shotcraft` npm scope        | 🟡 Operator action |
| `miopea/shotcraft` GitHub | 🟡 Operator action |
| `NPM_TOKEN` GitHub secret     | 🟡 Operator action |
| `shotcraft.dev` domain        | 🟡 Operator action |
| `release.yml` workflow        | ✅ Wired           |
| `ci.yml` workflow             | ✅ Wired           |
| Changesets configured         | ✅ Wired           |
| `publishConfig` on packages   | ✅ Wired           |
| Cloudflare Pages / Netlify    | 🟡 Operator action |
