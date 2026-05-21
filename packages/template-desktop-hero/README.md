# @shotcraft/template-desktop-hero

Shotcraft template — **Desktop hero**. Composes a desktop-viewport screen
capture inside a minimal browser-chrome window, sized 1920 × 1080. Good
for README heroes, landing-page screenshots, blog posts, and OG images.

## Visual spec

- **Output**: 1920 × 1080 (16:9 landscape)
- **Capture viewport**: 1440 × 900 CSS px @ dpr 2 (`isMobile: false` — real desktop layout)
- **Themes**: `dark` + `light`
- **Frame**: minimal browser-chrome window (rounded corners, soft drop shadow,
  three traffic-light dots in the top bar). Pure CSS — no SVG frame to
  maintain.

## Install

```bash
pnpm add -D @shotcraft/template-desktop-hero
```

Then add to your `shotcraft.config.ts` template list and reference it from
your screen configs.

## License

MIT
