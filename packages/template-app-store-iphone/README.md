# @shotcraft/template-app-store-iphone

Shotcraft template — **Apple App Store iPhone 6.5" tier**. Composes a captured
mobile screen into a 1284 × 2778 PNG ready for App Store Connect.

```
┌──────────────────────────────────────┐
│        96 px caption headline        │   ← marketing copy
│         optional 56 px subtitle      │
│                                      │
│            ┌────────────┐            │
│            │            │            │
│            │            │            │   ← captured app screen,
│            │            │            │     framed in an iPhone
│            │            │            │     chassis with a subtle
│            │            │            │     3D perspective tilt
│            │            │            │
│            └────────────┘            │
└──────────────────────────────────────┘
   1284 × 2778, brand gradient bg
```

## Visual spec

- **Output**: 1284 × 2778 (Apple's required iPhone 6.5" submission size)
- **Capture viewport**: 428 × 926 CSS @ dpr 3 (raw screenshot is already 1284 × 2778)
- **Background**: 135° brand gradient
  - dark: `slate-900 → emerald-950`
  - light: `slate-50 → emerald-100`
- **Caption**: 96 px / 600 weight / line-height 1.05 / letter-spacing -0.02em
- **Subtitle** (optional): 56 px / 400 weight / 0.75 opacity
- **Device frame**: 75 % canvas width, `perspective(2400px) rotateY(-9deg) rotateX(3deg)`
- **Drop shadow**: `30px 50px 60px rgba(0, 0, 0, 0.35)`

## Usage

```bash
pnpm add -D shotcraft @shotcraft/template-app-store-iphone
```

```ts
// shotcraft.config.ts
import { defineConfig } from "shotcraft";

export default defineConfig({
  target: "http://localhost:5173",
  setup: async (page) => {
    /* log in / dismiss tutorials */
  },
  screens: [
    { route: "/", name: "01-home", caption: "Welcome to your app" },
    {
      route: "/dashboard",
      name: "02-dashboard",
      caption: "See everything at a glance",
      subtitle: "All your data, one screen",
    },
  ],
  templates: ["@shotcraft/template-app-store-iphone"],
});
```

```bash
shotcraft           # capture + render end-to-end
shotcraft render app-store-iphone   # re-render only this template
```

Composites land in `./screenshots/app-store-iphone/{name}-{theme}.png`.

## Theme support

Both `dark` and `light`. Override via the object form of `templates`:

```ts
templates: [{ pkg: "@shotcraft/template-app-store-iphone", themes: ["dark"] }];
```

## Samples

`samples/` ships with PNGs produced by Shotcraft itself (eat-our-own-dogfood) so
the docs site gallery and READMEs can preview the look without rebuilding.
Re-generate via the package's snapshot test against the BudgetBug example
captures.

## Attribution

Device-frame silhouette derived from
[`marvelapp/devices.css`](https://github.com/marvelapp/devices.css)
(Apache-2.0). The frame SVG was simplified to chassis outline, screen aperture,
and dynamic island — no Apple branding.

## License

MIT.
