# Shotcraft

> Capture your live app and ship App Store-ready screenshots, README hero images, and social cards in one command.

[![npm](https://img.shields.io/npm/v/shotcraft?color=blue)](https://www.npmjs.com/package/shotcraft)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Most screenshot tools require you to take screenshots first, then upload them. **Shotcraft does both halves**: it logs into your running web app via Playwright, captures every screen at every viewport you need, and composites them through device-frame templates into shippable images for the App Store, Play Store, your README, and social cards.

```bash
# 1. Add Shotcraft + the templates you need
pnpm add -D shotcraft @shotcraft/template-app-store-iphone @shotcraft/template-readme-hero

# 2. Scaffold a config
pnpm shotcraft init

# 3. Run it
pnpm shotcraft
```

That's it. PNGs land in `screenshots/` ready to upload to App Store Connect, drop into your README, or post on Twitter.

## What sets it apart

- **Captures from your live app** — no manual screenshot uploads. Point it at your dev server or production URL.
- **Multi-output, one config** — App Store iPhone + iPad, Play Store phone + tablet, README hero, OG card, all from the same source captures.
- **Templates as code** — your visual brand lives in HTML/CSS files, version-controlled, diff-able in PRs. No vendor lock-in, no SaaS subscription.
- **Authentic auth** — pass a `setup(page)` function with full Playwright access. Handles OAuth, email+password, magic link, JWT, anything you can script.
- **Marketplace-ready** — first-party templates ship as `@shotcraft/*` packages; community templates publish under `shotcraft-template-*`.

## Status

🚧 **v0** — under active development. v0.1.0 will publish to npm once core capture + render + the six first-party templates land.

See [the v1 plan](./.claude/plans/shotcraft-v1.md) for the full roadmap.

## License

[MIT](./LICENSE) — miopea.
