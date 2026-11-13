# @shotcraft/template-desktop-hero

## 1.1.5

### Patch Changes

- Republished with npm provenance attestations. No code changes.
- Updated dependencies
  - shotcraft@0.1.4

## 1.1.4

### Patch Changes

- 48f0444: The peer dependency on `shotcraft` is now a caret range (`^0.1.x`) instead of one exact version. Earlier releases pinned it exactly, so the next `shotcraft` patch could not be installed beside them (npm `ERESOLVE`) until every template was republished. From this release on, a `shotcraft` patch installs beside the templates you already have.
- Updated dependencies [ffdba03]
  - shotcraft@0.1.3

## 1.1.3

### Patch Changes

- Regenerate the shipped `samples/` PNGs from the current BudgetBug demo-account capture (the committed test fixtures in `fixtures/budgetbug/`). Output dimensions are unchanged; only the app screenshot inside each composite is newer.

## 1.1.2

### Patch Changes

- Add the Shotcraft logo to each template's package README (npm landing page).

## 1.1.1

### Patch Changes

- 8e674a5: Point each template package `homepage` at the GitHub repo (the unbought `shotcraft.dev` domain was removed).
- Updated dependencies [8e674a5]
  - shotcraft@0.1.1

## 1.1.0

### Minor Changes

- New first-party template: Desktop hero (1920×1080 landscape). Captures
  the target app at a real desktop viewport (1440×900 @ dpr 2,
  `isMobile: false` — gets the desktop layout, not the mobile breakpoint)
  and composites it inside a minimal browser-chrome window. Good for
  README heroes, landing-page screenshots, blog posts, and OG images.
  Dark + light themes. Pure-CSS chrome — no SVG frame.
