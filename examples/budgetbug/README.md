# Shotcraft — BudgetBug example

The canonical Shotcraft demo. Drives BudgetBug's running dev server through
all 7 first-party templates to produce a full marketing screenshot set in one
command.

## What this produces

Six screens × seven templates × dark + light = ~78 PNGs covering App Store
(iPhone + iPad), Play Store (phone + tablet), GitHub README hero, Open
Graph / Twitter cards, and desktop browser-chrome heroes.

```
screenshots/
├── app-store-iphone/        # 1284 × 2778
├── app-store-ipad/          # 2064 × 2752
├── play-store-phone/        # 1080 × 1920
├── play-store-tablet/       # 1920 × 1200
├── readme-hero/             # 1280 × 640
└── social-og-card/          # 1200 × 630 (dark only)
```

## Running it

1. **Start BudgetBug** — in a separate terminal, `pnpm dev` from the
   `~/projects/personal/budgetbug` repo. The default `target` points at
   `http://localhost:5173`. To use staging or production instead, set
   `BUDGETBUG_BASE_URL` in your environment.

2. **Provide the demo credentials**:

   ```bash
   cp .env.example .env
   # edit .env and fill in BUDGETBUG_DEMO_PASSWORD
   ```

3. **Run Shotcraft**:

   ```bash
   pnpm screenshots             # capture + render end-to-end
   pnpm screenshots:capture     # raws only
   pnpm screenshots:render      # composites only (re-renders existing raws)
   pnpm doctor                  # sanity-check the config + reach the target
   ```

   PNGs land under `./screenshots/`.

## Subsetting

Capturing through 6 templates is overkill for most iterations. Comment out
templates in `shotcraft.config.ts` while you tune copy or styling:

```ts
templates: [
  "@shotcraft/template-app-store-iphone",
  // "@shotcraft/template-app-store-ipad",
  // …commented templates skip both capture and render…
];
```

Or render just one template against existing raws:

```bash
pnpm shotcraft render app-store-iphone
```

## Troubleshooting

- `Login failed (401)` — your `BUDGETBUG_DEMO_PASSWORD` is wrong, or
  BudgetBug's auth has changed. Verify by hitting `/api/auth/login` with
  curl.
- `target … not reachable` (`shotcraft doctor`) — BudgetBug's dev server
  isn't running, or the URL is wrong. Start it with `pnpm dev` in BudgetBug.
- Screenshots look stale — chart animations haven't settled. Bump the
  per-screen `waitMs` in `shotcraft.config.ts`.
- An onboarding overlay covers screens — the `dismissOnboarding` step in
  `setup` writes a localStorage key. If BudgetBug rotates the key
  (`budgetbug-onboarding-completed`) the dismiss won't take. Update the
  constant in this config.

## Files

- `shotcraft.config.ts` — the demo config itself; copy it as a starting
  point for your own app.
- `.env.example` — template for the env vars the setup hook needs.
- `screenshots/` — output directory (gitignored).

## License

MIT.
