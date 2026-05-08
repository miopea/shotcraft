---
"@shotcraft/template-app-store-iphone": patch
"@shotcraft/template-app-store-ipad": patch
"@shotcraft/template-play-store-phone": patch
"@shotcraft/template-play-store-tablet": patch
"@shotcraft/template-readme-hero": patch
"@shotcraft/template-social-og-card": patch
---

Add a `default` condition to each template package's `exports` map.

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
