# Crawler

Hosted authoring tool for screenshot sets. Crawl a target app (with
auth if needed), see all the captures in one view, edit captions, then
render through whichever templates you want — without leaving the
browser. The CLI does the same end-to-end pipeline, just on your
machine; the Crawler is the same engine made interactive.

## Open it

`https://your-deployment.example.com/crawler`

The bfg-solutions deployment lives at
[shotcraft.bfgsolutions.net/crawler](https://shotcraft.bfgsolutions.net/crawler).

## Workflow

The Crawler page has three steps stacked vertically. Each section is
self-contained — fill in, click through, scroll down.

### 1. Target

- **Base URL** — the `target` you'd put in `shotcraft.config.ts`. Each
  screen's route gets joined onto this.
- **Bearer token** — your `SHOTCRAFT_LIVE_DEMO_TOKEN`. Same gate the
  Live demo uses.
- **Capture viewport (template)** — pick the smallest mobile-class
  template you'll render through. The Crawler captures every screen at
  this template's viewport. Render-time templates (step 3) get the
  same raw, scaled to whatever output dims they need.
- **Theme** — `dark` or `light`. This is the `colorScheme` Playwright
  reports during capture.
- **Target-app login (optional)** — same picker as the Live demo:
  - **none** — public app, no auth
  - **api** — JSON POST to `/api/auth/login`
  - **form** — fills an HTML form and clicks submit
  - **session** — pre-injected cookies / localStorage

### 2. Screens

A card per screen you want to capture. Two ways to populate the list:

#### Auto-discover

Click **🔍 Discover routes**. The server crawls the target same-origin
(BFS, depth 2, max 25 pages, 60s deadline) — running your configured
login first if you set one. Discovered paths come back as a checklist
with each page's `<title>`. Tick the ones you want and click **Add as
screens** — they merge into the screens list (skipping any already
present).

This finds anything reachable via `<a href>` link-following. It does
**not** find:

- Routes only reached via button clicks / state changes (use a screen
  with `actions`)
- Modal / drawer states (not URLs at all — use `actions`)
- Dynamic-id routes like `/budgets/[id]/edit` where you need a
  specific record

For those, fall back to manually adding screens.

#### Manual

Click **+ Add screen**, then edit inline:

| Column   | Purpose                                             |
| -------- | --------------------------------------------------- |
| Route    | Joined onto base URL → captured page                |
| Name     | File-name stem (e.g. `01-dashboard`)                |
| Caption  | Headline shown over the device frame at render time |
| Subtitle | Optional second line                                |
| Status   | `queued`, `running`, `done`, `error`                |
| Actions  | `Retake` (re-capture this row), `✕` (remove)        |

Click **Capture all** to run captures sequentially. Each capture
queues server-side (1 at a time, 60s deadline). When a row finishes
its raw appears below the row inline.

You can edit captions/subtitles freely **before or after** capturing —
they only matter at render time.

#### Actions before screenshot

Each screen card has an **Actions before screenshot** section that lets
you drive the page before the screenshot fires. Useful for:

- Clicking into a modal: `click("button[aria-label=Open menu]")`
- Filling a search input: `fill("input[name=q]", "groceries")` →
  `press("input[name=q]", "Enter")`
- Dismissing a tooltip: `click(".tour-close")`
- Scrolling into a feature: `scroll(".pricing-table")`

Supported action types — these run server-side via Playwright in the
order you list them, between `goto()` and the screenshot:

| Type              | Fields              | Notes                                                          |
| ----------------- | ------------------- | -------------------------------------------------------------- |
| `click`           | `selector`          | Click an element.                                              |
| `fill`            | `selector`, `value` | Fill an input.                                                 |
| `press`           | `selector`, `key`   | Send a keypress (`Enter`, `Tab`, `Escape`, etc.).              |
| `wait`            | `ms`                | Pause (max 30s).                                               |
| `waitForSelector` | `selector`          | Wait for an element to appear.                                 |
| `waitForUrl`      | `url`               | Wait for navigation to match a URL pattern.                    |
| `scroll`          | `selector` or `y`   | Scroll an element into view, or scroll the page to `y` pixels. |

Capped at 20 actions per screen. Each action has a 10-second default
timeout (overridable via `timeoutMs` on supported actions). The whole
capture (auth + actions + screenshot) still has the 60s deadline.

### 3. Render

Pick the templates you want to render through. A single capture goes
through every (template × theme) combo, so the math is:

```
output PNGs = captured screens × selected templates × themes-per-template
```

Click **Render**. The browser sends the previously-captured raw back
to `/api/render` once per (raw, template, theme) — server-side this
re-launches Chromium per render (~3s overhead per output, since
Chromium isn't pooled across requests).

Composites stack into a grid below. Each card has a **Download PNG**
link.

## State lives in the browser

There's no server-side session. Captures and composites are blob URLs
in the active tab. Closing the tab loses the work. That's intentional —
no GDPR concerns, no cleanup cron, no resume-where-you-left-off
across machines.

## API

The Crawler is a UI on top of three endpoints:

```
POST /api/capture
  Body: { url, viewport: { width, height, dpr }, isMobile?, theme?, waitMs?, auth? }
  Returns: image/png (the raw)

POST /api/render
  Content-Type: application/json
  Body: { rawBase64, templateId, caption, subtitle?, theme? }
  Returns: image/png (the composite)

  — or —

  Content-Type: multipart/form-data
  Parts: raw (file), meta (JSON {templateId, caption, ...})

POST /api/render-demo
  One-shot full pipeline. Body: { url, caption, ..., auth? }.
  Used by the /demo page (single screen) — kept for OSS visitors who
  just want "paste a URL → see a render."

POST /api/discover
  Body: { url, maxDepth?, maxPages?, auth? }
  BFS link-crawl from the start URL. Same-origin only. Defaults:
  depth 2, max 25 pages. Hard caps: depth 4, max 60 pages.
  Returns: { routes: [{ path, title, depth }, ...] }
```

All three live behind the same `SHOTCRAFT_LIVE_DEMO=1` flag plus the
optional `SHOTCRAFT_LIVE_DEMO_TOKEN` Bearer gate (required when
`auth` is supplied).

## When to use the Crawler vs the CLI

| Scenario                                      | Tool                                                |
| --------------------------------------------- | --------------------------------------------------- |
| Building a release set, iterating on captions | Crawler — faster feedback loop                      |
| Reproducible build (CI, fastlane)             | CLI — pinned config in your repo                    |
| Many screens, fragile auth                    | CLI — your `setup(page)` can be arbitrarily complex |
| One-off marketing PNG                         | Crawler                                             |

The CLI ships its work as a versioned `shotcraft.config.ts`. The
Crawler is for the iterative authoring loop _before_ you commit the
config.
