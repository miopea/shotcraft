<p align="center">
  <img src="https://raw.githubusercontent.com/miopea/shotcraft/main/assets/logo/shotcraft-icon-240.png" alt="Shotcraft" width="120" height="120" />
</p>

# shotcraft

> Capture your live app and ship App Store-ready screenshots, README hero images, and social cards in one command.

[![npm](https://img.shields.io/npm/v/shotcraft?color=blue)](https://www.npmjs.com/package/shotcraft)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/miopea/shotcraft/blob/main/LICENSE)

Most screenshot tools make you take the screenshots first, then upload
them. **Shotcraft does both halves**: it logs into your running web app
via Playwright, captures every screen at every viewport you need, and
composites the raws through device-frame templates into shippable images
for the App Store, Play Store, your README, and social cards.

This is the core package — the `shotcraft` CLI plus a programmatic API.
Device-frame templates ship as separate `@shotcraft/template-*` packages;
install only the ones you need.

## Install

```bash
pnpm add -D shotcraft \
  @shotcraft/template-app-store-iphone \
  @shotcraft/template-readme-hero
```

## Quickstart

```bash
pnpm shotcraft init       # scaffold shotcraft.config.ts
pnpm shotcraft doctor     # sanity-check the config
pnpm shotcraft            # capture + render end-to-end
```

PNGs land in `screenshots/{template-id}/{name}-{theme}.png`, ready to
upload to App Store Connect, drop into your README, or post on social.

## CLI

| Command                 | What it does                                              |
| ----------------------- | --------------------------------------------------------- |
| `shotcraft`             | Capture + render end-to-end (reads `shotcraft.config.ts`) |
| `shotcraft init`        | Scaffold a `shotcraft.config.ts` (`--force` to overwrite) |
| `shotcraft capture`     | Run only the capture phase (raw screenshots)              |
| `shotcraft render [id]` | Run only render; optionally for one template id           |
| `shotcraft doctor`      | Verify config, target reachability, and login             |
| `shotcraft web`         | Launch the local web companion (gallery, builder, demo)   |

Global flags: `-c/--config <path>`, `-f/--force`, `--headed`,
`-v/--version`, `-h/--help`. Full reference:
[`docs/cli.md`](https://github.com/miopea/shotcraft/blob/main/docs/cli.md).

## Programmatic API

The CLI is the primary surface, but every phase is callable so you can
compose Shotcraft into your own scripts:

```ts
import { defineConfig, run } from "shotcraft";

await run(
  defineConfig({
    target: "http://localhost:5173",
    setup: async (page) => {
      await page.goto("http://localhost:5173/login");
      // full Playwright Page access — script any auth flow
    },
    screens: [
      { route: "/", name: "01-home", caption: "See everything at a glance" },
      { route: "/insights", name: "02-insights", caption: "Personalized guidance" },
    ],
    templates: ["@shotcraft/template-app-store-iphone"],
  }),
);
```

Exports include `defineConfig`, `run`, `runCapture`, `runRender`,
`loadTemplates`, and the auth helpers `apiLogin` / `formLogin` /
`injectSession` / `chain`, plus all config and template types.

## Auth

The `setup(page)` hook is the only auth abstraction — you get full
Playwright `Page` access, so OAuth, email + password, magic link, JWT, or
anything you can script all work through one interface. The `apiLogin`,
`formLogin`, `injectSession`, and `chain` helpers cover the common cases.
See the
[config reference](https://github.com/miopea/shotcraft/blob/main/docs/config.md#auth-helpers).

## Docs

Plain markdown, rendered on GitHub:

- [Getting started](https://github.com/miopea/shotcraft/blob/main/docs/getting-started.md)
- [Config reference](https://github.com/miopea/shotcraft/blob/main/docs/config.md)
- [CLI reference](https://github.com/miopea/shotcraft/blob/main/docs/cli.md)
- [Templates gallery](https://github.com/miopea/shotcraft/blob/main/docs/templates.md)
- [Build your own template](https://github.com/miopea/shotcraft/blob/main/docs/contributing-templates.md)

Try the gallery + config builder without installing anything at
[shotcraft.bfgsolutions.net](https://shotcraft.bfgsolutions.net).

## License

[MIT](https://github.com/miopea/shotcraft/blob/main/LICENSE) — miopea.
