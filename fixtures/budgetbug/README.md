# BudgetBug capture fixtures

Raw screenshots of BudgetBug's **demo account** (sample data, not a real
user), used as input to every first-party template's render test in
`packages/template-*/test/render.test.ts`.

They're committed so those tests run anywhere, CI included. The tests used to
read these from a local BudgetBug checkout, and wherever that was missing they
skipped silently. Because they're committed, a missing or unreadable fixture
now fails the render test: the template never reports `rendered="true"`.

| File                                       | Size (px)   | Used by                                                                                   |
| ------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------- |
| `01-dashboard-iphone-6.5-{dark,light}.png` | 1284 × 2778 | app-store-iphone, play-store-phone, readme-hero, desktop-hero, social-og-card (dark only) |
| `01-dashboard-ipad-13-{dark,light}.png`    | 2064 × 2752 | app-store-ipad, play-store-tablet                                                         |

Copied on 2026-09-23 from BudgetBug's fastlane capture output
(`fastlane/metadata/en-US/screenshots/raw/`). To refresh them, copy newer
captures over these files. The render tests write their output to each
template's `samples/`, which ships in the npm package and the web gallery, so
review the regenerated samples before committing them.
