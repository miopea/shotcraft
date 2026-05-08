---
title: Config reference
description: Every field on `defineConfig`, including the setup and applyTheme hooks.
---

`shotcraft.config.ts` exports a default `defineConfig({...})` call. Below
is every field, with types and defaults.

```ts
import { defineConfig } from "shotcraft";

export default defineConfig({
  /* fields below */
});
```

## `target`

```ts
target: string;
```

Required. URL of the app to capture — typically a dev server
(`http://localhost:5173`) or a staging deployment. Production also
works if your demo data is stable there.

The capture engine navigates to this origin before calling your `setup`
hook so localStorage / cookie writes land on the right origin.

## `setup`

```ts
setup?: (page: Page) => Promise<void>;
```

Optional. Runs once per (viewport × theme) capture group, after the
browser launches and before any screen is captured. The page is a real
Playwright `Page` — you have access to everything Playwright ships.

Use it for whatever has to happen before capture: log in, set
localStorage, dismiss tutorials, click "Start tour".

For the common login patterns Shotcraft ships [auth helpers](#auth-helpers)
that return ready-to-use `setup` functions. For anything weirder, write
the function yourself — full Playwright access covers OAuth, magic link,
JWT, biometrics, anything you can script:

```ts
setup: async (page) => {
  await page.goto("http://localhost:5173/login", {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate(async () => {
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        email: "demo@example.com",
        password: "...",
      }),
    });
  });
};
```

## Auth helpers

Importable from `shotcraft` (or `shotcraft/auth` for the subpath):

```ts
import { apiLogin, formLogin, injectSession, chain } from "shotcraft";
```

Each helper returns a `setup`-compatible function. Mix and match with
`chain(...)` to compose multiple steps; mix with hand-written
`async (page) => {...}` functions when you need raw Playwright control.

### `apiLogin(opts)`

POSTs to a JSON auth endpoint from inside the page so any `Set-Cookie`
in the response lands on the browser context. The most common pattern.

```ts
import { apiLogin, defineConfig } from "shotcraft";

export default defineConfig({
  target: "http://localhost:5173",
  setup: apiLogin({
    url: "/api/auth/login",
    body: {
      email: process.env.DEMO_EMAIL,
      password: process.env.DEMO_PASSWORD,
    },
    // Optional knobs:
    // method: "POST",                  // defaults to POST
    // headers: { "X-Api-Key": "..." }, // merged onto Content-Type: application/json
    // expectStatus: 200,               // throws on mismatch; pass a fn for ranges
    // credentialsInclude: true,        // cookies follow back, default true
  }),
  screens: [
    /* ... */
  ],
});
```

Throws a descriptive error if the response status doesn't match
`expectStatus` (default 200). Pass `expectStatus: (s) => s >= 200 && s < 300`
for a range.

### `formLogin(opts)`

Drives an HTML form. Fills email + password, clicks submit, waits for
either `waitForUrl`, `waitForSelector`, or `networkidle` (default).

```ts
setup: formLogin({
  url: "/login",
  emailField: "input[name=email]",
  passwordField: "input[name=password]",
  submitButton: "button[type=submit]",
  email: process.env.DEMO_EMAIL!,
  password: process.env.DEMO_PASSWORD!,
  // One of (optional):
  waitForUrl: /\/dashboard$/, // RegExp or absolute URL
  // waitForSelector: "[data-testid=greeting]",
  // timeoutMs: 15_000,            // per-step timeout
});
```

### `injectSession(opts)`

Pre-loads cookies, `localStorage`, and `sessionStorage` without
round-tripping a real login. Use when you already hold a session token
(CI-baked secret, signed dev token).

```ts
setup: injectSession({
  cookies: [
    {
      name: "auth_token",
      value: process.env.DEMO_AUTH_TOKEN!,
      domain: "localhost",
      // path?, httpOnly?, secure?, sameSite?, expires?
    },
  ],
  localStorage: {
    "onboarding-completed": "true",
    "tour-dismissed": "1",
  },
  // sessionStorage: { ... },
  // origin: "https://other-domain.example",  // when storage targets a different host
});
```

### `chain(...fns)`

Compose multiple `setup` functions in order. Helpers and hand-written
functions mix freely.

```ts
setup: chain(
  apiLogin({ url: "/api/auth/login", body: { email, password } }),
  injectSession({ localStorage: { "tour-dismissed": "1" } }),
  async (page) => {
    // Final hand-rolled step — close the welcome modal that pops once
    // the cookie sets.
    await page.click("button[aria-label='Close welcome dialog']").catch(() => {});
  },
);
```

### Storing credentials

Helpers reach for `process.env.*` so credentials never live in your
versioned config. The recommended pattern:

```bash
# .env (gitignored)
DEMO_EMAIL=demo@example.com
DEMO_PASSWORD=...
```

Load it however your runtime prefers — your existing `dotenv` setup
works, Node 20.6+'s built-in `--env-file` works, or paste the
five-line loader from
[`examples/budgetbug/shotcraft.config.ts`](https://github.com/miopea/shotcraft/blob/main/examples/budgetbug/shotcraft.config.ts).

If a credential is missing the helper throws a descriptive error mid-
capture; many configs prefer a top-level guard so `shotcraft doctor`
catches it earlier:

```ts
const PASSWORD = process.env.DEMO_PASSWORD;
if (!PASSWORD) {
  throw new Error("DEMO_PASSWORD not set — copy `.env.example` → `.env`.");
}
```

## `applyTheme`

```ts
applyTheme?: (page: Page, theme: "dark" | "light") => Promise<void>;
```

Optional imperative theme hook. If your app respects the CSS
`prefers-color-scheme` media query (most modern frameworks do), leave
this unset — Shotcraft already configures Playwright's `colorScheme`
context option per theme group.

Provide this only when your app needs a programmatic toggle: setting a
`localStorage` key, calling a global, clicking a UI affordance.

```ts
applyTheme: async (page, theme) => {
  await page.evaluate(
    ({ key, theme }) => {
      localStorage.setItem(key, theme);
      const root = document.documentElement;
      if (theme === "dark") root.classList.add("dark");
      else root.classList.remove("dark");
    },
    { key: "my-app-theme", theme },
  );
};
```

## `screens`

```ts
screens: ReadonlyArray<{
  route: string; // path on the target, e.g. "/dashboard"
  name: string; // unique stable identifier — appears in filenames
  caption: string; // headline shown over the device frame
  subtitle?: string; // optional sub-caption
  waitForSelector?: string; // CSS selector to wait for before capture
  waitMs?: number; // extra ms to wait (default 1500)
}>;
```

Required. The screens to capture. Each entry produces one capture per
template viewport per theme.

`name` must be unique — the capture writes
`{name}-{template-id}-{theme}.png`, and render reads the same.

```ts
screens: [
  {
    route: "/",
    name: "01-dashboard",
    caption: "Know your budget at a glance",
    waitMs: 1500,
  },
  {
    route: "/cashflow",
    name: "02-cashflow",
    caption: "Track income and expenses",
    waitForSelector: "[data-testid='cashflow-chart-loaded']",
  },
];
```

## `templates`

```ts
templates?: ReadonlyArray<string | {
  pkg: string;
  themes?: ReadonlyArray<"dark" | "light">;
  options?: Record<string, unknown>;
}>;
```

Optional. The templates to render captures through. Each is either a
package name (Shotcraft uses the template's defaults) or an object with
overrides.

```ts
templates: [
  // String form — use defaults from the template package.
  "@shotcraft/template-app-store-iphone",

  // Object form — override the template's themes.
  {
    pkg: "@shotcraft/template-readme-hero",
    themes: ["dark"], // skip the light variant
  },
];
```

Without templates, `shotcraft capture` falls back to a default desktop
viewport profile (configurable via `defaults`). `shotcraft render`
no-ops with a warning.

## `defaults`

```ts
defaults?: {
  viewport?: { width: number; height: number; dpr: number };
  themes?: ReadonlyArray<"dark" | "light">;
  isMobile?: boolean;
  userAgent?: string;
};
```

Optional. Capture-only fallback profile used when no templates are
configured. Default: `{ width: 1280, height: 800, dpr: 2 }`, themes
`["dark"]`, `isMobile: false`.

## `outputDir`

```ts
outputDir?: string;
```

Optional. Output directory root. Each template writes to
`${outputDir}/${template.id}/`. Default: `./screenshots`.

Relative paths resolve against the directory containing
`shotcraft.config.ts`, not against `process.cwd()`.

## `rawSubdir`

```ts
rawSubdir?: string;
```

Optional. Subdirectory under `outputDir` where raw captures land.
Default: `raw`.

## `locale`

```ts
locale?: string;
```

Optional. Locale Playwright reports to the page (e.g. for
`Intl.DateTimeFormat`). Default: `en-US`.

## `timezoneId`

```ts
timezoneId?: string;
```

Optional. IANA timezone Playwright reports. Default: `America/New_York`.
Set this to keep dates / times deterministic across captures.

## Programmatic API

If the CLI is too coarse, every phase is exposed as a function:

```ts
import { defineConfig, loadTemplates, runCapture, runRender } from "shotcraft";

const config = defineConfig({
  /* ... */
});
const templates = await loadTemplates(config.templates ?? []);
const capture = await runCapture(config, { templates });
const render = await runRender(config, { templates });
```

`run(config, options)` is the end-to-end version that calls capture +
render in sequence.
