---
"shotcraft": minor
---

Phase 3 — render engine + end-to-end pipeline.

`shotcraft` now ships:

- **`runRender`** — Playwright-driven composer that for each (template ×
  theme × screen) opens the template's `wrapper.html`, injects URL params
  (`caption`, `subtitle`, `imageUrl`, `theme`), waits for
  `body[data-rendered="true"]` + `document.fonts.ready`, then screenshots
  at the template's `output` dimensions. Missing raws are skipped with a
  warning rather than failing the whole run.
- **`loadTemplates(refs, { cwd })`** — resolves `TemplateRef[]` to
  `LoadedTemplate[]`. Walks `node_modules` from the consumer project,
  validates the `ShotcraftTemplate` shape, applies user-supplied theme +
  options overrides. Absolute paths bypass npm resolution (test escape
  hatch).
- **`buildCompositeSpecs` / `buildWrapperUrl`** — pure helpers exposed
  alongside the runner so authors can compose the render pipeline
  programmatically. Output paths land at
  `${outputDir}/${template.id}/{name}-{theme}.png`.
- **`shotcraft render [template-id]`** — CLI subcommand replaces the v0
  stub. Optional positional template-id filter for re-rendering one
  template at a time.
- **`shotcraft` (no args)** — now genuinely end-to-end: capture phase
  uses each template's viewport (raws written as
  `{name}-{template.id}-{theme}.png`), then render composes. Without
  templates, capture runs solo and render no-ops with a friendly message.
- **Capture runner** now loads templates from config (or accepts
  pre-loaded ones via `options.templates`) and derives capture specs per
  template viewport instead of falling straight to defaults.

New subpath exports: `shotcraft/render`, `shotcraft/template`,
`shotcraft/capture`. Public API surface from `shotcraft` itself adds
`runRender`, `loadTemplates`, `buildWrapperUrl`, `buildCompositeSpecs`,
`viewportFromTemplate`, and the matching types.

Tests: 12 new vitest cases (template loader, render-spec helpers, full
runRender integration with a fixture wrapper + tiny PNG raw). Total core
test count: 32 passing.
