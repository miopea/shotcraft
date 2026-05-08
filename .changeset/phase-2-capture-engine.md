---
"shotcraft": minor
---

Phase 2 — capture engine + CLI wiring.

The `shotcraft` package now ships:

- A working capture engine (`runCapture`) ported from BudgetBug's
  `captureAppStoreScreenshots.ts` and generalized for arbitrary targets.
  The two BudgetBug-specific concerns — login and theme switching — are
  now user-supplied hooks (`setup`, `applyTheme`); Playwright's
  `colorScheme` context option handles `prefers-color-scheme`-based
  themes out of the box.
- Live CLI subcommands: `shotcraft init` (scaffolds a starter
  `shotcraft.config.ts`), `shotcraft capture` (loads config + runs
  capture), and `shotcraft doctor` (sanity-checks config, target
  reachability, and discovers installed templates).
- Config loader (`loadConfig`, `findConfig`) supporting
  `shotcraft.config.{ts,mts,js,mjs}` — TypeScript files transpiled on
  the fly via jiti.
- `defaults.viewport` / `defaults.themes` config fields so capture works
  before first-party templates ship in Phase 4.
- 20 unit tests covering config validation, init scaffolding, capture
  spec derivation, and doctor's report shape (browser-driving tests
  deferred — they need a live target).

`shotcraft.run()` now delegates capture to `runCapture`. Render still
throws — it lands in Phase 3.
