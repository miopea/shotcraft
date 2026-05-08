# @shotcraft/template-social-og-card

## 1.0.0

### Minor Changes

- 9f81aa8: First release — Open Graph / Twitter card template.

  Composes a 428×926 (dpr 2) capture into a 1200×630 landscape PNG sized to
  the OG standard. Single dark theme — OG cards consume against light feeds,
  dark holds attention. Caption-dominant: copy fills ~70 % of canvas
  left-aligned + vertically centered, with a small iPhone-shaped device
  peek anchored to the bottom-right (~30 % canvas width, tilted
  `rotateY(18deg) rotateX(-3deg)` toward the caption). Brand-aligned with
  the App Store dark palette + a radial accent in the bottom-right.

  Ships `samples/card-dark.png`.

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
