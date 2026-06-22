# Getting started

Install Shotcraft, point it at your running app, and produce a full
marketing screenshot set in five minutes.

This walks you through producing your first composites against a running
dev server. End-to-end you should be looking at App Store-ready PNGs in
about five minutes.

## Prerequisites

- Node 20+ and pnpm 9 or 11 (npm and yarn work too — the workflow below
  uses pnpm)
- A web app that can be reached over HTTP — typically a local dev server
  (`http://localhost:5173`) or a deployed staging URL with stable demo
  data
- Whatever credentials your app needs to render the screens you care about

## Install

```bash
pnpm add -D shotcraft \
  @shotcraft/template-app-store-iphone \
  @shotcraft/template-readme-hero
```

The `shotcraft` package is the CLI + programmatic API. Each
`@shotcraft/template-*` package is one composite layout. Add only the
templates you'll actually use.

The first time you install, Playwright will download a Chromium build
under `~/.cache/ms-playwright/`. If that step is blocked by your network,
run `pnpm exec playwright install chromium` after the install completes.

## Scaffold a config

```bash
pnpm shotcraft init
```

This writes `shotcraft.config.ts` next to your `package.json`. Open it —
the scaffold has comments pointing at the spots you need to edit.

```ts
import { defineConfig } from "shotcraft";

export default defineConfig({
  target: "http://localhost:5173",
  setup: async (page) => {
    // Log in, dismiss tutorials, prefill localStorage — anything that has
    // to happen before capture. Full Playwright `Page` access.
  },
  screens: [
    {
      route: "/",
      name: "01-home",
      caption: "Welcome to your app",
    },
  ],
  templates: ["@shotcraft/template-app-store-iphone", "@shotcraft/template-readme-hero"],
  outputDir: "./screenshots",
});
```

## Wire up your auth

The `setup` hook runs once after Playwright launches. The fastest way is
one of the [auth helpers](./config.md#auth-helpers); for the common case
of a JSON auth endpoint:

```ts
import { defineConfig, apiLogin } from "shotcraft";

export default defineConfig({
  target: "http://localhost:5173",
  setup: apiLogin({
    url: "/api/auth/login",
    body: {
      email: process.env.DEMO_EMAIL,
      password: process.env.DEMO_PASSWORD,
    },
  }),
  /* ... */
});
```

Helpers cover form-based logins (`formLogin`), pre-existing session
tokens (`injectSession`), and composition (`chain`). For OAuth, magic
link, biometric, or anything weirder, write the function yourself —
full Playwright access covers everything you can script.

## Validate the config

```bash
pnpm shotcraft doctor
```

`doctor` checks that the config parses, the target is reachable, and the
templates you reference are installed. Fix anything it flags before
running the full pipeline.

## Run end-to-end

```bash
pnpm shotcraft           # capture + render
```

Subcommands you'll reach for:

```bash
pnpm shotcraft capture                          # raws only
pnpm shotcraft render                           # composites only (re-renders existing raws)
pnpm shotcraft render app-store-iphone          # filter to one template
```

PNGs land at `./screenshots/{template-id}/{name}-{theme}.png`. Raws are
under `./screenshots/raw/` — these are the per-template captures that
the render phase composes.

## Iterate

The render phase reuses existing raws. So once you've captured, you can
tune captions and styles without re-running the slow capture pass:

```bash
# tweak shotcraft.config.ts captions...
pnpm shotcraft render
```

When you change template options or add screens, re-run the full
pipeline.

## Troubleshooting

**`browserType.launch: Executable doesn't exist`** — Playwright's
Chromium isn't installed. Run `pnpm exec playwright install chromium`
once, then re-run.

**Login isn't applied / pages render logged-out** — your `setup(page)`
ran but the session didn't stick. Confirm the request actually
authenticates (watch with `--headed`), and that cookies/localStorage are
set on the same origin as `target`. The `apiLogin` / `formLogin` /
`injectSession` helpers in the [config reference](./config.md#auth-helpers)
cover the common shapes.

**Screenshots are blank or cut off** — the page hadn't finished
rendering when the shot was taken. Add a `waitForSelector` (preferred) or
a `waitMs` to the screen, so capture waits for the real content.

**Stale or half-updated outputs** — `render` reuses existing raws by
design. After changing screens, viewports, or auth, re-run the full
`pnpm shotcraft` (capture + render), not just `render`.

**An overlay/banner is in every shot** — dismiss it inside `setup(page)`
(e.g. set the localStorage flag your app checks, or click the close
button) before captures run.

**Headless looks different from my browser** — captures run headless
Chromium. Use `--headed` to watch a run, and pin fonts/animations the
same way you would for visual regression tests.

## Where to next

- [Config reference](./config.md) — every field on `defineConfig`,
  including the auth helpers
- [CLI reference](./cli.md) — every subcommand and flag
- [Template gallery](./templates.md) — visual previews of each
  first-party template
- [Build your own template](./contributing-templates.md) — the package
  contract and a 60-line starter
