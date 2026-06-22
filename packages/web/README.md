# @shotcraft/web

> The Shotcraft hosted companion — templates gallery, interactive config builder, a guided crawler, and (when enabled) a live-demo renderer.

This is an internal workspace package (`"private": true` — not published
to npm). It powers the public companion site at
[shotcraft.bfgsolutions.net](https://shotcraft.bfgsolutions.net) and is
the same app you get from `shotcraft web`.

## What's inside

| Route        | What it shows                                                                |
| ------------ | ---------------------------------------------------------------------------- |
| `/`          | Landing page — pitch, feature grid, quickstart snippet                       |
| `/templates` | Gallery of the seven first-party templates with real sample composites       |
| `/builder`   | Interactive config builder — produces a copy-pasteable `shotcraft.config.ts` |
| `/crawler`   | Guided target → discover → capture → render flow with a live phase timeline  |
| `/demo`      | Single-screen live renderer (requires live endpoints — see below)            |

## Run it locally

The easiest path is the CLI, which boots the production server with live
endpoints enabled and opens the crawler:

```bash
shotcraft web        # http://localhost:3002/crawler
```

For contributing to the web app itself, run the dev servers with hot
reload:

```bash
pnpm --filter @shotcraft/web dev
# server → http://localhost:3002   client → http://localhost:5174 (proxies /api → 3002)
```

`pnpm dev` runs `scripts/copy-samples.mjs` first, copying each template's
`samples/*.png` into `client/public/samples/` so the gallery has images.

## Environment variables

The live-capture endpoints (`/api/capture`, `/api/render-demo`,
`/api/discover`) are **off by default** — the public deployment serves
only static pages. `shotcraft web` sets the flags below for you; set them
yourself when running the server directly.

| Variable                    | Purpose                                                        |
| --------------------------- | -------------------------------------------------------------- |
| `SHOTCRAFT_LIVE_DEMO`       | `1` enables the live capture/render/discover endpoints         |
| `SHOTCRAFT_ALLOW_LOCAL`     | `1` permits `localhost` + RFC1918 capture targets (SSRF guard) |
| `SHOTCRAFT_WEB_LOCAL_MODE`  | `1` mounts `/api/local/config` to read/write a local config    |
| `SHOTCRAFT_LIVE_DEMO_TOKEN` | optional Bearer token gating the live endpoints                |
| `PORT`                      | server port (default `3002`)                                   |

Live capture needs Playwright's Chromium; install it once with
`pnpm exec playwright install chromium`.

## Deploy

Built with `pnpm --filter @shotcraft/web build` (Vite client + tsc
server) and served by `node server/dist/index.js`. The production target
is Azure App Service — see
[`PUBLISHING.md`](https://github.com/miopea/shotcraft/blob/main/PUBLISHING.md)
for the deployment recipe and custom-domain setup.

## License

[MIT](https://github.com/miopea/shotcraft/blob/main/LICENSE) — miopea.
