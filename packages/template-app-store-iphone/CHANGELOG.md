# @shotcraft/template-app-store-iphone

## 1.0.0

### Minor Changes

- d4e2c13: First publishable release — the App Store iPhone 6.5" template.

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

### Patch Changes

- 3daf775: Add a `default` condition to each template package's `exports` map.

  Without `default`, `createRequire().resolve()` (CJS) reports
  `No "exports" main defined` because there's no condition matching a CJS
  caller. Shotcraft's runtime template loader uses `createRequire()` to
  anchor resolution at the consumer project's `package.json` — that's the
  only mechanism that finds templates installed alongside the consumer's
  shotcraft (a workspace pnpm install puts templates in
  `consumer/node_modules/@shotcraft/...`, not in shotcraft's own
  node_modules).

  `default` matches any caller and resolves to the same ESM file
  `import` does, so ESM imports continue working unchanged. This was a
  day-zero issue for any real consumer; surfaced when wiring up the first
  example (`examples/budgetbug/`).

- 81a9cad: Add `publishConfig: { access: "public", provenance: true }` to every
  publishable package.

  `access: public` is required for the scoped `@shotcraft/*` packages —
  without it, npm defaults to `restricted` and the first publish fails.
  `provenance: true` opts each package into npm's OIDC-signed provenance
  attestations; the `release.yml` workflow already grants the matching
  `id-token: write` permission so attestations succeed without further
  configuration.

- Updated dependencies [2f58ea8]
- Updated dependencies [cb34f9f]
- Updated dependencies [3fed245]
- Updated dependencies [8a78192]
- Updated dependencies [0c01b35]
- Updated dependencies [d4e2c13]
- Updated dependencies [3daf775]
- Updated dependencies [81a9cad]
- Updated dependencies [527a76c]
- Updated dependencies [2d4d6ea]
  - shotcraft@0.1.0
