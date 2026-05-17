# @shotcraft/template-app-store-ipad

## 1.1.0

### Minor Changes

- Apple App Store templates are now front-facing (head-on) instead of
  3D-pivoted. Apple's App Store gallery convention is a straight device;
  the previous `rotateY`/`rotateX` perspective tilt also raised the
  frame's top corner into the caption, causing caption/frame collisions.
  A flat frame has a predictable bounding box. Template IDs, viewports,
  and output dimensions (iPhone 1284×2778, iPad 2064×2752) are unchanged
  — only the composite's device presentation differs.

## 1.0.0

### Minor Changes

- 9f81aa8: First release — Apple App Store iPad 13" template.

  Composes a 1032×1376 (dpr 2) capture into a 2064×2752 PNG matching Apple's
  required iPad 13" tier. Vertical layout — caption block at top, iPad Pro
  chassis below at 65 % canvas width with a subtle 3D perspective. Same brand
  gradient palette as the iPhone template so the App Store listing reads
  cohesively across tiers.

  Ships `samples/dashboard-{dark,light}.png` rendered against the BudgetBug
  example app.

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
