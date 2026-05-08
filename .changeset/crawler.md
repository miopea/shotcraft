---
"shotcraft": minor
---

`@shotcraft/web`: new **Crawler** page (`/crawler`) — hosted authoring
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

**Discovery v2** lands two new toggleable techniques alongside the
existing link crawl:

- **Sitemap.xml** — fetches `/sitemap.xml` through the page's
  post-auth context, parses `<loc>` entries. Cheap and authoritative
  when present.
- **Common routes** — probes a list of standard SaaS paths
  (`/dashboard`, `/settings`, `/billing`, `/about`, …). Includes an
  SPA-shell filter: if more than half the 200 responses share an
  identical body length, that length is the catch-all shell and
  those bogus matches are dropped. Real multi-page sites keep all
  their distinct hits.

Each technique has its own checkbox in Step 1; results in the
picker get a colored source badge (link/sitemap/common). Nav-click
discovery is stubbed in the UI as "Coming in v0.2.x" — same
machinery as modal-state crawl, ships as a follow-up.
