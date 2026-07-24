# Shotcraft — Claude Code Project Memory

> See `~/.claude/CLAUDE.md` for cross-project rules (design principles, code quality, TDD workflow, commit + ship discipline). This file covers Shotcraft-specific context only.

## Quick Reference (read every session)

- **What this is**: open-source npm tool that captures screenshots from a running web app (via Playwright) and composites them into App Store / Play Store / README hero / social card images. The wedge: "captures from your live app" — competing tools (screenshots.pro, Bannerbear, Placid) all require manually uploaded screenshots.
- **License**: MIT (operator: miopea)
- **Status**: v0.1 ready — all 8 phases of the v1 plan shipped through web release 1.0.17 (front-facing Apple templates, NDJSON-streamed Discover with live phase timeline, auto-detect form auth, 7 first-party templates including desktop-hero). Plan at `.claude/plans/shotcraft-v1.md`.
- **No `any` types** — TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- **No `ts-ignore`** — fix the type error
- **Commit format**: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`)
- **One package = one Changeset** — every package change should add a `.changeset/*.md` describing the bump
- **Don't push to `main` directly** until prereqs are done — operator needs to create the GitHub repo first

## Package Manager

`pnpm@11` is mandatory (declared in root `package.json` as `"packageManager"`). The workspace is **not** npm-compatible — `pnpm-workspace.yaml` (not `workspaces` field) declares the package list.

To use pnpm globally on the operator's machine: it's installed at `~/.npm-global/bin/pnpm` (PATH already exported in `~/.bash_aliases`). Spawned shells from npm scripts won't inherit that PATH; if `pnpm: not found` appears in a Bash tool call, prefix with `export PATH="$HOME/.npm-global/bin:$PATH"`.

## Project Structure

```
shotcraft/                                  (repo root)
├── packages/
│   ├── core/                               → npm: shotcraft (CLI + programmatic API)
│   │   ├── src/cli/index.ts                # subcommand dispatch
│   │   ├── src/config/                     # defineConfig, type defs
│   │   ├── src/capture/                    # Playwright orchestration (Phase 2)
│   │   ├── src/render/                     # template runner (Phase 3)
│   │   ├── src/template/types.ts           # ShotcraftTemplate contract
│   │   └── src/index.ts                    # public exports
│   ├── web/                                → npm: @shotcraft/web (hosted companion)
│   │   ├── server/src/                     # Express, mirrors BudgetBug pattern
│   │   └── client/src/                     # React + Vite
│   └── template-*/                         → 7 first-party templates (Phase 4 + desktop-hero)
├── examples/budgetbug/                     # reference config (Phase 5)
├── docs/                                   # Plain markdown docs (rendered on GitHub)
├── .changeset/                             # Changesets versioning
├── .github/workflows/                      # ci.yml, release.yml
├── pnpm-workspace.yaml
└── tsconfig.base.json                      # shared strict TS config
```

## Standard Commands

```bash
pnpm install            # workspace install (also runs allowed postinstalls)
pnpm typecheck          # all packages, fail on any TS error
pnpm lint               # ESLint flat config, zero warnings
pnpm format             # prettier --write
pnpm format:check       # CI uses this
pnpm build              # tsup for core, vite + tsc for web
pnpm test               # vitest run, all packages
pnpm changeset          # record a version-bump intent for the next release
```

## Tech Stack

| Layer                | Choice                                            |
| -------------------- | ------------------------------------------------- |
| Language             | TypeScript ^5.6 strict                            |
| Package mgr          | pnpm 11 (workspaces)                              |
| Bundler (core)       | tsup → ESM only                                   |
| Bundler (web client) | Vite 5                                            |
| Runtime (web server) | Express 5 + tsx (dev) / tsc (prod)                |
| Tests                | Vitest 2                                          |
| Lint                 | ESLint 9 flat config + typescript-eslint          |
| Format               | Prettier 3                                        |
| Versioning           | Changesets                                        |
| Capture engine       | Playwright (Chromium only for v1)                 |
| Docs site            | Plain markdown under `docs/` (rendered on GitHub) |

## v1 Phase Status

Tracked in `.claude/plans/shotcraft-v1.md`. Brief:

| Phase | Status  | Description                                                                                                                                                                                   |
| ----- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | ✅ Done | Repo skeleton — pnpm workspaces, tsconfig, eslint, prettier, vitest, changesets, GH workflows, MIT license, README                                                                            |
| 2     | ✅ Done | Capture engine in `packages/core/src/capture/`, generalized for arbitrary targets, `shotcraft capture` subcommand                                                                             |
| 3     | ✅ Done | Render engine + first template (`@shotcraft/template-app-store-iphone`) end-to-end                                                                                                            |
| 4     | ✅ Done | Templates 2-7: app-store-ipad, play-store-phone, play-store-tablet, readme-hero, social-og-card, desktop-hero                                                                                 |
| 5     | ✅ Done | `examples/budgetbug/shotcraft.config.ts` driving the real BudgetBug capture set end-to-end                                                                                                    |
| 6     | ✅ Done | Plain-markdown docs under `docs/` (rendered on GitHub) — Astro Starlight scrapped in favor of native rendering                                                                                |
| 7     | ✅ Done | npm publish plumbing — Changesets + GitHub Actions + provenance — awaiting operator-side `@shotcraft` scope registration                                                                      |
| 8     | ✅ Done | Hosted companion (`@shotcraft/web`) live at shotcraft.bfgsolutions.net — templates gallery, config builder, Crawler, NDJSON-streamed Discover with live phase timeline, auto-detect form auth |

## CLI Subcommand Surface

All implemented as `shotcraft <subcommand>` from `packages/core/src/cli/index.ts`.

| Command                 | Phase landed | Behaviour                                                                 |
| ----------------------- | ------------ | ------------------------------------------------------------------------- |
| `shotcraft` (no args)   | 3            | Reads config, runs capture + render end-to-end                            |
| `shotcraft init`        | 2            | Scaffolds `shotcraft.config.ts` with comments + sample setup function     |
| `shotcraft capture`     | 2            | Runs only the capture phase                                               |
| `shotcraft render [id]` | 3            | Runs only render; optionally for one template                             |
| `shotcraft dev`         | (TBD)        | Hot-reload preview for template authors                                   |
| `shotcraft web`         | 8            | Launches `@shotcraft/web` locally with `SHOTCRAFT_LIVE_DEMO=1`            |
| `shotcraft list`        | 4            | Prints discovered templates from package.json deps                        |
| `shotcraft doctor`      | 2            | Sanity-checks config (target reachable, login works, templates installed) |

## Template Package Contract

Every Shotcraft template package — first-party (`@shotcraft/template-*`) or community (`shotcraft-template-*`) — exports a default that satisfies `ShotcraftTemplate` from `shotcraft`:

```ts
import type { ShotcraftTemplate } from "shotcraft";

const template: ShotcraftTemplate = {
  id: "app-store-iphone", // unique, stable
  viewport: { width: 428, height: 926, dpr: 3 }, // CSS px the SPA sees during capture
  output: { width: 1284, height: 2778 }, // physical px of final composite
  themes: ["dark", "light"],
  wrapperHtmlPath: new URL("./wrapper.html", import.meta.url).pathname,
  isMobile: true,
};
export default template;
```

Discovery (Phase 4): the core engine scans the consumer project's `package.json` dependencies for any package matching `@shotcraft/template-*` or `shotcraft-template-*`, dynamically imports each, and registers the default export.

## Auth Model in User Configs

The `setup(page)` hook on the user's `shotcraft.config.ts` is the **only** auth abstraction. Users get full Playwright `Page` access — they can drive any login flow (OAuth, email+password, magic link, JWT, biometric) by writing their own setup steps. We do **not** ship declarative login primitives — every shipped user has different auth, and a setup function covers all of them with one interface.

## OSS Discipline

This is a public-facing project. Conventions matter more than they did in BudgetBug:

- **README is the marketing page.** Shotcraft's own README hero image is generated by Shotcraft (eat-own-dogfood). Do not let the README drift from the actual API surface.
- **Every breaking API change requires a Changeset entry.** No silent renames in `defineConfig` or the `ShotcraftTemplate` contract.
- **Templates and examples are public-eyes-on.** Demo data in `examples/budgetbug/` is the first real-world demo other devs see — keep it polished.
- **No internal-only references** in shipping code (no leftover BudgetBug-isms, no operator's machine paths).

## Operator-side Prerequisites Still Pending

These don't block local dev, but they block npm publish + Azure deploy of the hosted companion:

- Create `github.com/miopea/shotcraft` (operator's personal account) and `git push -u origin main`. Three commits are queued.
- Register the `@shotcraft` npm organization at npmjs.com (free; lets us publish `@shotcraft/template-*` and `@shotcraft/web`).
- Buy `shotcraft.dev` (the docs site URL + Azure App Service custom domain).

Note these in any task hand-off; flag the operator if a phase becomes blocked on one of them.

## Where BudgetBug Comes Back In

Once Shotcraft v0.1.0 publishes:

1. `examples/budgetbug/shotcraft.config.ts` is the canonical first demo (Phase 5).
2. The BudgetBug repo migrates: removes `client/scripts/captureAppStoreScreenshots.ts`, `client/scripts/renderAppStoreScreenshots.ts`, `client/scripts/appStoreScreenList.ts`, `client/scripts/screenshot-templates/`, `server/src/routes/screenshotRaw.ts`. Adds `shotcraft.config.ts` + `pnpm add -D shotcraft @shotcraft/template-app-store-iphone @shotcraft/template-app-store-ipad`.
3. BudgetBug becomes the first real-world consumer of Shotcraft — credibility builder for the OSS launch.

Until then, BudgetBug's existing scripts stay in place and continue producing iPhone + iPad captures that fed the screenshots.pro work earlier this session.

## Secret Management

This repository uses the `miopea-secrets` Azure Key Vault as the authoritative source for secrets declared in `config/secrets.manifest.json`. Secret values never belong in Git. Local `.env` files are disposable, gitignored caches generated from the vault.

### Agent startup

Before work that requires credentials, run:

```bash
node scripts/secrets.mjs check
```

If required values are missing or stale, use the existing Azure session or authenticate, then pull and verify:

```bash
az login
node scripts/secrets.mjs pull
node scripts/secrets.mjs check
```

Do not run `az login` when the existing Azure session is valid.

`SECRET_REQUIRED` means run `node scripts/secrets.mjs check` before asking the user for a key or claiming credentials are unavailable.

### Agent safety rules

- Never commit `.env` files, private keys, service-account JSON, tokens, or decrypted secret exports.
- Never display secret values in command output, logs, messages, documentation, commits, or test fixtures.
- Never use broad environment-dump commands to inspect populated secret files or the complete process environment.
- Presence checks report only variable names and status.
- Use only secrets declared by this repository manifest; never add unrelated credentials just in case.
- `scripts/secrets.mjs` is read-only with respect to Key Vault.
- Do not create, update, disable, restore, purge, or delete a vault secret unless the user explicitly requests that external action.
- Pulling local secrets does not authorize changes to production, GitHub, Cloudflare, Apple, Google, or another provider.
- A successful local pull does not mean production was updated or deployed.

### Manifest changes

When the application begins using a new secret:

1. Search for the existing environment-variable convention.
2. Create or identify an appropriately scoped Key Vault secret.
3. Add only its vault-to-environment mapping to `config/secrets.manifest.json`.
4. Confirm the target environment file is gitignored.
5. Run:

   ```bash
   node --test scripts/secrets.node-test.mjs
   node scripts/secrets.mjs pull
   node scripts/secrets.mjs check
   ```

6. Inspect the staged diff and confirm it contains no secret value.

Manifest entries contain names and validation rules only, never values.

### Secret rotation

Only when explicitly authorized:

1. Update or generate the credential at its authoritative provider.
2. Store the replacement as a new version in `miopea-secrets`.
3. Pull and validate it locally.
4. Update production through the application deployment process.
5. Verify the real integration end to end.
6. Revoke the previous provider credential only after verification.

Changing Key Vault does not automatically refresh existing `.env` files or production configuration.

### Recovery

If a local `.env` is missing or damaged, remove only that exact gitignored file and regenerate it with `node scripts/secrets.mjs pull`. Never reconstruct values from documentation, shell history, commits, or another repository.

### Repository secret scope

This repository currently declares no Key Vault secrets. A successful check reporting zero required secrets is expected. Do not add credentials unless this application actually needs them.
