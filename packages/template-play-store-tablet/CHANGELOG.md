# @shotcraft/template-play-store-tablet

## 1.0.1

### Patch Changes

- 8e674a5: Point each template package `homepage` at the GitHub repo (the unbought `shotcraft.dev` domain was removed).
- Updated dependencies [8e674a5]
  - shotcraft@0.1.1

## 1.0.0

### Minor Changes

- 9f81aa8: First release — Google Play 7" tablet template.

  Composes a 600×960 (dpr 2) capture into a 1920×1200 landscape PNG.
  Asymmetric two-pane layout — caption + subtitle left-aligned in the left
  ~36 %, generic Android tablet frame in the right ~64 % tilted toward the
  viewer (`rotateY(-12deg)`). Material-coded gradient matches the
  play-store-phone palette so the Play listing reads cohesively across
  form factors.

  Ships `samples/dashboard-{dark,light}.png`.

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
