# @shotcraft/template-social-og-card

Shotcraft template — **Open Graph / Twitter card**. Composes a captured mobile
screen into a 1200 × 630 PNG that reads well as a thumbnail in social feeds
(Twitter, Slack, Discord, LinkedIn, Notion).

## Visual spec

- **Output**: 1200 × 630 (the OG standard)
- **Themes**: `dark` only. OG cards are consumed against feeds where dark
  holds attention better than light.
- **Background**: brand gradient with a subtle radial accent in the
  bottom-right, brand-aligned with the App Store dark template so OG
  cards link into the same visual story
- **Caption**: 64 px / 700 weight / -0.022em (left-aligned, vertically
  centered, fills ~65 % of canvas)
- **Subtitle** (optional): 28 px / 400 weight / 0.78 opacity, max-width 620 px
- **Device peek**: small iPhone-shaped frame anchored to the bottom-right,
  tilted _toward_ the caption (`rotateY(14deg) rotateX(-2deg)`) so the
  composition flows from copy into product
- **Drop shadow**: `-12px 24px 50px rgba(0, 0, 0, 0.55)` — pushes the device
  away from the caption while reinforcing the corner anchor

## Usage

```bash
pnpm add -D shotcraft @shotcraft/template-social-og-card
```

```ts
templates: ["@shotcraft/template-social-og-card"];
```

Composites land in `./screenshots/social-og-card/{name}-dark.png`.

```html
<meta property="og:image" content="https://your.app/screenshots/social-og-card/hero-dark.png" />
<meta name="twitter:image" content="https://your.app/screenshots/social-og-card/hero-dark.png" />
<meta name="twitter:card" content="summary_large_image" />
```

## Samples

`samples/card-dark.png` ships with the package.

## Attribution

Device-frame silhouette derived from
[`marvelapp/devices.css`](https://github.com/marvelapp/devices.css)
(Apache-2.0).

## License

MIT.
