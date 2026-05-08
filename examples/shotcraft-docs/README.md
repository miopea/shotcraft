# Shotcraft eat-our-own-dogfood demo

Renders the marketing assets that ship at the top of the Shotcraft GitHub
repo — the README hero and the Open Graph / Twitter card — by driving
the [@shotcraft/docs](../../docs) site through Shotcraft itself.

This is the canonical proof-of-concept for the Shotcraft pitch: if the
tool can produce its own marketing screenshots, you can trust it with
yours.

## Run

```bash
# 1. Serve the docs site in one terminal
pnpm --filter @shotcraft/docs dev

# 2. From this directory, in another terminal
pnpm screenshots
```

Output lands at:

- `./screenshots/readme-hero/01-landing-{dark,light}.png` — embed at the
  top of the root README via `<picture>` + prefers-color-scheme
- `./screenshots/social-og-card/01-landing-dark.png` — embed via
  `<meta property="og:image">`

## Curating to the repo

Polished outputs are copied to `assets/readme/` at the repo root by hand
once they look good. Re-run this example whenever the docs site visual
changes.

## Why this exists

The OSS pitch — "captures from your live app" — only lands if Shotcraft
actually does that for itself. Walking the talk in the README is a
stronger signal than any tagline.
