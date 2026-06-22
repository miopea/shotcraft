# Shotcraft eat-our-own-dogfood demo

Renders the marketing assets that ship at the top of the Shotcraft GitHub
repo — the README hero and the Open Graph / Twitter card — by driving
the live [Shotcraft companion site](https://shotcraft.bfgsolutions.net)
(`@shotcraft/web`) through Shotcraft itself.

This is the canonical proof-of-concept for the Shotcraft pitch: if the
tool can produce its own marketing screenshots, you can trust it with
yours.

## Run

```bash
# Capture the live companion site (no local server needed):
pnpm screenshots

# …or capture a local build first:
pnpm --filter @shotcraft/web dev    # http://localhost:5174
SHOTCRAFT_DOCS_URL=http://localhost:5174 pnpm screenshots
```

Output lands at:

- `./screenshots/readme-hero/01-landing-dark.png` — embed at the top of
  the root README
- `./screenshots/social-og-card/01-landing-dark.png` — embed via
  `<meta property="og:image">`

The companion ships a single (dark) theme, so this example captures dark
only.

## Curating to the repo

Polished outputs are copied to `assets/readme/` at the repo root by hand
once they look good. Re-run this example whenever the companion site
visual changes.

## Why this exists

The OSS pitch — "captures from your live app" — only lands if Shotcraft
actually does that for itself. Walking the talk in the README is a
stronger signal than any tagline.
