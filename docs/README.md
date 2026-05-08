# @shotcraft/docs

Astro Starlight site for Shotcraft. Deploys to https://shotcraft.dev.

## Develop

```bash
pnpm install                      # from the repo root, picks up this workspace
pnpm --filter @shotcraft/docs dev # serves on http://localhost:4321
```

The dev server doesn't need samples — it tolerates broken image links. To
preview the templates gallery with real composites:

```bash
pnpm --filter @shotcraft/docs copy-samples
```

This pulls every `packages/template-*/samples/*.png` into
`docs/public/samples/<template-id>/` so the gallery's `<img>` tags resolve.
The `build` script runs it automatically.

## Build

```bash
pnpm --filter @shotcraft/docs build       # static site → docs/dist/
pnpm --filter @shotcraft/docs preview     # serve the build locally
```

## Layout

```
docs/
├── astro.config.mjs            # Starlight integration + sidebar
├── src/
│   ├── content.config.ts        # docs collection definition
│   ├── content/docs/            # Markdown / MDX content
│   │   ├── index.mdx            # landing page
│   │   ├── getting-started.md
│   │   ├── config.md
│   │   ├── cli.md
│   │   ├── templates/
│   │   │   └── index.mdx        # gallery
│   │   └── contributing/
│   │       └── templates.md
│   ├── styles/custom.css        # brand tweaks layered onto Starlight
│   └── assets/logo.svg
├── public/
│   ├── favicon.svg
│   └── samples/                 # populated by scripts/copy-samples.mjs
└── scripts/copy-samples.mjs
```

## Content workflow

- Pages live under `src/content/docs/`. Front matter (`title`,
  `description`) drives the page header and SEO.
- The sidebar order is in `astro.config.mjs` — adding a new page also
  needs an entry there if you want it linked.
- Sample images come from each template package's `samples/` directory.
  Re-running a template's snapshot test regenerates them; the docs build
  copies them in.
