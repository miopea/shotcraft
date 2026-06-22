# shotcraft

## 0.1.2

### Patch Changes

- Add the Shotcraft logo to the top of the package README (npm landing page).

## 0.1.1

### Patch Changes

- 8e674a5: Mark the planned `dev` and `list` subcommands as "(coming soon)" in `shotcraft --help` so first-run users aren't misled, add a package README (npm landing page), and point the package `homepage` at the GitHub repo.

## 0.1.0

### Minor Changes

- 2f58ea8: Add declarative auth helpers — `formLogin`, `apiLogin`,
  `injectSession`, and `chain` — that return ready-to-use `setup`
  functions for the common login patterns. The hand-written
  `setup: async (page) => { ... }` escape hatch stays as-is for OAuth /
  magic-link / biometric flows.

  ```ts
  import { apiLogin, defineConfig, injectSession, chain } from "shotcraft";

  export default defineConfig({
    target: "http://localhost:5173",
    setup: chain(
      apiLogin({
        url: "/api/auth/login",
        body: {
          email: process.env.DEMO_EMAIL,
          password: process.env.DEMO_PASSWORD,
        },
      }),
      injectSession({
        localStorage: { "onboarding-completed": "true" },
      }),
    ),
    /* ... */
  });
  ```

  - `apiLogin(opts)` — POSTs JSON to an auth endpoint from inside the
    page so `Set-Cookie` lands on the browser context. Throws on
    non-2xx by default; pass `expectStatus` for a custom predicate.
  - `formLogin(opts)` — drives an HTML form (fill email + password +
    submit). Waits for `waitForUrl`, `waitForSelector`, or `networkidle`.
  - `injectSession(opts)` — pre-loads cookies, localStorage, and
    sessionStorage. Use when a session token is already in hand.
  - `chain(...fns)` — composes multiple `setup`-compatible functions
    in order. Helpers and hand-written async functions mix freely.

  Available from the bare `shotcraft` import or from the new
  `shotcraft/auth` subpath. The `examples/budgetbug` config now uses
  `chain(apiLogin, injectSession)` instead of the hand-written
  `page.evaluate(fetch(...))` block as the canonical reference.

  `shotcraft init` updates the scaffolded config's comments to point at
  the helpers as the recommended path.

- cb34f9f: `@shotcraft/web`: new **Crawler** page (`/crawler`) — hosted authoring
  tool for multi-screen screenshot sets. Define your screens (route +
  caption + subtitle), capture them in batch (with target-app login if
  your app needs one), tweak captions inline, then render through any
  combination of templates × themes. Output PNGs accumulate as a
  downloadable grid.

  The render pipeline got split into two opt-in endpoints:
  - `POST /api/capture` — capture-only. Body: `{ url, viewport, isMobile?, theme?, auth?, waitMs? }`. Returns `image/png` (the raw).
  - `POST /api/render` — compose-only. JSON body
    `{ rawBase64, templateId, caption, subtitle?, theme? }` or
    multipart with `raw` file + `meta` JSON. Returns `image/png`.
  - `POST /api/render-demo` (unchanged) — one-shot full pipeline,
    kept for the OSS-facing `/demo` page.

  All three live behind the same `SHOTCRAFT_LIVE_DEMO=1` flag. The
  `auth` field still requires `SHOTCRAFT_LIVE_DEMO_TOKEN` to be set.
  Captures and composites stay in the browser as Blob URLs — no
  server-side session, no cleanup cron.

  Each screen card supports **per-screen actions** that run server-side
  between `goto()` and the screenshot — `click`, `fill`, `press`,
  `wait`, `waitForSelector`, `waitForUrl`, and `scroll`. Cap of 20
  actions per screen, 30s max wait. Lets you drive into modals, fill
  search inputs, dismiss tooltips, etc. before the camera fires.

  The Crawler also has a new **🔍 Discover routes** button that
  auto-crawls the target same-origin (BFS, depth 2, max 25 pages, 60s
  deadline) — including login if you've configured one — and returns
  a checklist of discovered paths with their `<title>` text. Tick
  which ones you want and they merge into the screens list. Powered
  by a new `POST /api/discover` endpoint with the same gating as
  `/api/capture`.

  The Crawler now **persists settings in this browser** — token,
  target URL, target-app auth (including credentials), screen list
  with actions, capture template/theme, and selected render
  templates. Reload, close-and-reopen, or come back tomorrow and it's
  all there. A "Forget saved settings" link in the page header clears
  everything. Captures and renders still live in the tab only — those
  move to IndexedDB in a later release.

  **Discovery v2** lands three new toggleable techniques alongside
  the existing link crawl:
  - **Sitemap.xml** — fetches `/sitemap.xml` through the page's
    post-auth context, parses `<loc>` entries. Cheap and authoritative
    when present.
  - **Common routes** — probes a list of standard SaaS paths
    (`/dashboard`, `/settings`, `/billing`, `/about`, …). Includes an
    SPA-shell filter: if more than half the 200 responses share an
    identical body length, that length is the catch-all shell and
    those bogus matches are dropped. Real multi-page sites keep all
    their distinct hits.
  - **Nav-click** — clicks buttons inside `<nav>` / header / sidebar
    containers (and `[role=navigation]`, `.navbar`, etc.) and watches
    for URL changes. Catches React-Router routes that render as
    `<button>` + onClick instead of `<a href>`. Capped at 12 buttons
    per session, reloads between clicks to reset DOM state, skips any
    text matching destructive keywords (sign out, delete, …).

  Each technique has its own checkbox in Step 1; results in the
  picker get a colored source badge (link/sitemap/common/nav).

  **Form-login resilience** — the engine now tries common alternative
  selectors when the user's chosen email/password/submit selector
  times out. Default selector chain:
  `input[type=email]` → `input[name=email]` → `input[name=username]` →
  `input[autocomplete=username]` etc. Same for password
  (`input[type=password]` first) and submit (`button[type=submit]`,
  `input[type=submit]`, `form button`). Failure messages name every
  selector tried so the user knows what to fix. No more "Timeout
  15000ms exceeded waiting for input[name=email]" against apps that
  use any other shape.

  **`shotcraft web` local mode** — `pnpm shotcraft web` (or `npx
shotcraft web` after install) boots the same hosted-companion UI on
  `localhost:3002` against your project. The Crawler reads + writes
  `./shotcraft.config.json` in cwd via two new endpoints
  (`GET/PUT /api/local/config`); changes auto-save on every edit so
  your config file IS the saved state. Local mode also enables
  localhost / RFC1918 capture targets (`http://localhost:5173` works)
  and skips the bearer-token gate (it's your own machine). The
  hosted deployment never mounts these endpoints — local-mode is
  gated by an env var the CLI sets and the App Service doesn't.

  In the Crawler header, when local mode is active, a green badge
  shows the bound config path so you know edits go to disk and not
  just the browser.

  **Capture matrix + IndexedDB durability** — the Crawler's Step 1
  gains a (template × theme) checkbox grid replacing the previous
  single-template/single-theme picker. Every screen captures once
  per checked cell; output count = `screens × cells`. Matrix cells
  that don't apply to a template (e.g. `social-og-card`'s light
  column) are auto-disabled. Per-screen card headers gain a row of
  status dots — one per cell — so you see exactly which captures
  are queued / running / done / errored.

  Captured raws + rendered composites now persist in IndexedDB
  (`shotcraft.crawler.v1`, two object stores keyed by
  `${screenId}::${templateId}::${theme}`). Reload, close-and-reopen,
  or come back tomorrow and your captures + composites are still
  there — no need to re-capture. Removing a screen prefix-deletes
  its IDB entries; "Forget saved settings" wipes both stores along
  with localStorage. No third-party IDB lib — small in-house wrapper
  under `packages/web/client/src/persistence/idb.ts`.

- 0c01b35: Phase 2 — capture engine + CLI wiring.

  The `shotcraft` package now ships:
  - A working capture engine (`runCapture`) ported from BudgetBug's
    `captureAppStoreScreenshots.ts` and generalized for arbitrary targets.
    The two BudgetBug-specific concerns — login and theme switching — are
    now user-supplied hooks (`setup`, `applyTheme`); Playwright's
    `colorScheme` context option handles `prefers-color-scheme`-based
    themes out of the box.
  - Live CLI subcommands: `shotcraft init` (scaffolds a starter
    `shotcraft.config.ts`), `shotcraft capture` (loads config + runs
    capture), and `shotcraft doctor` (sanity-checks config, target
    reachability, and discovers installed templates).
  - Config loader (`loadConfig`, `findConfig`) supporting
    `shotcraft.config.{ts,mts,js,mjs}` — TypeScript files transpiled on
    the fly via jiti.
  - `defaults.viewport` / `defaults.themes` config fields so capture works
    before first-party templates ship in Phase 4.
  - 20 unit tests covering config validation, init scaffolding, capture
    spec derivation, and doctor's report shape (browser-driving tests
    deferred — they need a live target).

  `shotcraft.run()` now delegates capture to `runCapture`. Render still
  throws — it lands in Phase 3.

- d4e2c13: Phase 3 — render engine + end-to-end pipeline.

  `shotcraft` now ships:
  - **`runRender`** — Playwright-driven composer that for each (template ×
    theme × screen) opens the template's `wrapper.html`, injects URL params
    (`caption`, `subtitle`, `imageUrl`, `theme`), waits for
    `body[data-rendered="true"]` + `document.fonts.ready`, then screenshots
    at the template's `output` dimensions. Missing raws are skipped with a
    warning rather than failing the whole run.
  - **`loadTemplates(refs, { cwd })`** — resolves `TemplateRef[]` to
    `LoadedTemplate[]`. Walks `node_modules` from the consumer project,
    validates the `ShotcraftTemplate` shape, applies user-supplied theme +
    options overrides. Absolute paths bypass npm resolution (test escape
    hatch).
  - **`buildCompositeSpecs` / `buildWrapperUrl`** — pure helpers exposed
    alongside the runner so authors can compose the render pipeline
    programmatically. Output paths land at
    `${outputDir}/${template.id}/{name}-{theme}.png`.
  - **`shotcraft render [template-id]`** — CLI subcommand replaces the v0
    stub. Optional positional template-id filter for re-rendering one
    template at a time.
  - **`shotcraft` (no args)** — now genuinely end-to-end: capture phase
    uses each template's viewport (raws written as
    `{name}-{template.id}-{theme}.png`), then render composes. Without
    templates, capture runs solo and render no-ops with a friendly message.
  - **Capture runner** now loads templates from config (or accepts
    pre-loaded ones via `options.templates`) and derives capture specs per
    template viewport instead of falling straight to defaults.

  New subpath exports: `shotcraft/render`, `shotcraft/template`,
  `shotcraft/capture`. Public API surface from `shotcraft` itself adds
  `runRender`, `loadTemplates`, `buildWrapperUrl`, `buildCompositeSpecs`,
  `viewportFromTemplate`, and the matching types.

  Tests: 12 new vitest cases (template loader, render-spec helpers, full
  runRender integration with a fixture wrapper + tiny PNG raw). Total core
  test count: 32 passing.

- 527a76c: `shotcraft web` is live — boots the `@shotcraft/web` hosted companion
  locally with `SHOTCRAFT_LIVE_DEMO=1` so the live-demo endpoint is
  enabled. Resolution prefers the consumer project's `@shotcraft/web`
  install, falls back to the workspace bundle, and emits a clear error
  pointing at the workspace dev command if neither is reachable.

  Replaces the v0 not-implemented stub for the `web` subcommand.

### Patch Changes

- 3fed245: CLI's `--help` text and `shotcraft init` scaffold now point at the
  GitHub-rendered docs (`https://github.com/miopea/shotcraft/tree/main/docs`)
  instead of the unbought `shotcraft.dev`. No behavioural change; just
  a doc-link refresh as the project switches from a dedicated docs site
  to plain markdown rendered on GitHub.
- 8a78192: `@shotcraft/web`: live-demo (`POST /api/render-demo` + `/demo` page)
  ships as a real implementation, replacing the v0 501 stub. Off by
  default; opt in with `SHOTCRAFT_LIVE_DEMO=1` and an optional
  `SHOTCRAFT_LIVE_DEMO_TOKEN` shared-secret. SSRF-safe URL allowlist
  (blocks localhost / RFC1918 / 169.254.x), 1 render at a time, 60s
  deadline.

  The CLI surface (`shotcraft web`) is unchanged — same flag flips the
  local instance into live-demo mode. This release just makes the
  hosted endpoint actually do something.

  See [docs/live-demo.md](https://github.com/miopea/shotcraft/blob/main/docs/live-demo.md)
  for the env vars + deploy recipe.

- 3daf775: `shotcraft doctor` now loads configured templates and reports the real
  capture-spec count.

  Before: the doctor's spec line called `deriveCaptureSpecs` without
  templates, so a config with 6 templates × 6 screens × 2 themes (66
  captures) reported as `6 captures (1 theme)` — confusing and wrong.
  Now templates are loaded (failures surface as warnings, not blockers),
  and the spec count reflects what `shotcraft` would actually run.

- 81a9cad: Add `publishConfig: { access: "public", provenance: true }` to every
  publishable package.

  `access: public` is required for the scoped `@shotcraft/*` packages —
  without it, npm defaults to `restricted` and the first publish fails.
  `provenance: true` opts each package into npm's OIDC-signed provenance
  attestations; the `release.yml` workflow already grants the matching
  `id-token: write` permission so attestations succeed without further
  configuration.

- 2d4d6ea: `@shotcraft/web`: live-demo gains optional target-app authentication.
  The `/api/render-demo` body now accepts an `auth` field that runs
  inside the capture context before the page navigation. Three flavors
  mirror the CLI's `shotcraft/auth` helpers:
  - `{ type: "api", url, body, ... }` — POST JSON to an auth endpoint
  - `{ type: "form", url, emailField, passwordField, submitButton, email, password, ... }`
  - `{ type: "session", cookies?, localStorage?, sessionStorage? }`

  The `/demo` UI gains a "Target-app login" picker with per-mode
  sub-forms.

  `auth` is **refused** unless the deployment sets
  `SHOTCRAFT_LIVE_DEMO_TOKEN` — a server submitting arbitrary
  credentials to arbitrary URLs without an access gate is a
  credential-stuffing tool, so the rule forces deployers to gate it
  explicitly. Credentials are never logged.
