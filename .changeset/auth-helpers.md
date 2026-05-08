---
"shotcraft": minor
---

Add declarative auth helpers — `formLogin`, `apiLogin`,
`injectSession`, and `chain` — that return ready-to-use `setup`
functions for the common login patterns. The hand-written
`setup: async (page) => { ... }` escape hatch stays as-is for OAuth /
magic-link / biometric flows.

```ts
import { apiLogin, defineConfig, injectSession, chain } from "shotcraft";

export default defineConfig({
  target: "http://localhost:5173",
  setup: chain(
    apiLogin({
      url: "/api/auth/login",
      body: {
        email: process.env.DEMO_EMAIL,
        password: process.env.DEMO_PASSWORD,
      },
    }),
    injectSession({
      localStorage: { "onboarding-completed": "true" },
    }),
  ),
  /* ... */
});
```

- `apiLogin(opts)` — POSTs JSON to an auth endpoint from inside the
  page so `Set-Cookie` lands on the browser context. Throws on
  non-2xx by default; pass `expectStatus` for a custom predicate.
- `formLogin(opts)` — drives an HTML form (fill email + password +
  submit). Waits for `waitForUrl`, `waitForSelector`, or `networkidle`.
- `injectSession(opts)` — pre-loads cookies, localStorage, and
  sessionStorage. Use when a session token is already in hand.
- `chain(...fns)` — composes multiple `setup`-compatible functions
  in order. Helpers and hand-written async functions mix freely.

Available from the bare `shotcraft` import or from the new
`shotcraft/auth` subpath. The `examples/budgetbug` config now uses
`chain(apiLogin, injectSession)` instead of the hand-written
`page.evaluate(fetch(...))` block as the canonical reference.

`shotcraft init` updates the scaffolded config's comments to point at
the helpers as the recommended path.
