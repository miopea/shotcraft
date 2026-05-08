---
"shotcraft": patch
"@shotcraft/template-app-store-iphone": patch
"@shotcraft/template-app-store-ipad": patch
"@shotcraft/template-play-store-phone": patch
"@shotcraft/template-play-store-tablet": patch
"@shotcraft/template-readme-hero": patch
"@shotcraft/template-social-og-card": patch
---

Add `publishConfig: { access: "public", provenance: true }` to every
publishable package.

`access: public` is required for the scoped `@shotcraft/*` packages —
without it, npm defaults to `restricted` and the first publish fails.
`provenance: true` opts each package into npm's OIDC-signed provenance
attestations; the `release.yml` workflow already grants the matching
`id-token: write` permission so attestations succeed without further
configuration.
