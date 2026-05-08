---
"@shotcraft/template-app-store-iphone": minor
---

First publishable release — the App Store iPhone 6.5" template.

Composes a captured 428×926 (dpr 3) mobile screen into a 1284×2778 PNG
ready for App Store Connect's iPhone 6.5" tier.

Visual spec:

- Brand gradient background (slate-900 → emerald-950 dark, slate-50 →
  emerald-100 light)
- 96 px / 600 weight caption with -0.02em letter-spacing and 1.05
  line-height, 80 % canvas width, ~9 % from top
- Optional 56 px / 400 weight subtitle, 0.75 opacity
- iPhone Pro Max-shaped chassis at 75 % canvas width with subtle 3D
  perspective (`rotateY(-9deg) rotateX(3deg)`, 2400 px perspective parent)
- Drop shadow `30px 50px 60px rgba(0, 0, 0, 0.35)`
- Captured screen clipped to the chassis screen aperture with rounded
  corners, `image-rendering: optimizeQuality` to soften aliasing under
  perspective

Ships with `samples/dashboard-{dark,light}.png` rendered against the
BudgetBug example app — drives the package README preview and the
forthcoming docs gallery.

Device-frame silhouette derived from
[`marvelapp/devices.css`](https://github.com/marvelapp/devices.css)
(Apache-2.0); simplified to chassis outline + screen aperture + dynamic
island, no Apple branding.
