---
title: Getting started
description: Install Shotcraft, point it at your running app, and produce a full marketing screenshot set in five minutes.
---

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

The `setup` hook runs once after Playwright launches. It's the only auth
abstraction Shotcraft ships — drop in whatever flow your app uses. A
common pattern is to hit your auth API directly rather than driving the
login form (faster, more reliable):

```ts
setup: async (page) => {
  await page.goto("http://localhost:5173/login", {
    waitUntil: "domcontentloaded",
  });
  const result = await page.evaluate(async () => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: "demo@example.com",
        password: "demo-password",
      }),
    });
    return { ok: res.ok, status: res.status };
  });
  if (!result.ok) throw new Error(`Login failed (${result.status})`);
};
```

OAuth, magic link, biometric, JWT — anything you can drive with Playwright
works here. There's no built-in primitive for any of them on purpose.

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

## Where to next

- [Config reference](/config/) — every field on `defineConfig`
- [CLI reference](/cli/) — every subcommand and flag
- [Template gallery](/templates/) — visual previews of each first-party
  template against a real app
- [Build your own template](/contributing/templates/) — the package
  contract and a 60-line starter
