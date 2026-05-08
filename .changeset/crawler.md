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
