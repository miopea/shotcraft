# CLI reference

Every Shotcraft subcommand and flag.

The `shotcraft` binary is the primary surface. Every subcommand below
loads `shotcraft.config.ts` from the current working directory unless
`--config` overrides it.

## `shotcraft`

```bash
shotcraft
```

End-to-end: capture every screen at each template's viewport, then
render every (template × screen × theme) combination through the
template's `wrapper.html`.

Equivalent to `shotcraft capture && shotcraft render`, but with the
templates loaded once and shared between phases (faster).

## `shotcraft init`

```bash
shotcraft init [--force]
```

Scaffolds a starter `shotcraft.config.ts` in the current directory.
Refuses to overwrite an existing file unless `--force` (`-f`) is set.

## `shotcraft capture`

```bash
shotcraft capture
```

Runs only the capture phase. Produces raw screenshots under
`{outputDir}/{rawSubdir}/{name}-{template.id}-{theme}.png`.

Useful when the slow part of your pipeline is capture (Playwright +
chart animations) and you want to iterate on copy without re-capturing.

## `shotcraft render [template-id]`

```bash
shotcraft render
shotcraft render app-store-iphone   # filter to one template
```

Renders existing raw captures into final composites. Skips
combinations whose raw is missing — log emits a warning, the run
continues. The optional positional argument filters to a single
template id.

Useful for tuning captions, gradients, or template options without
re-running capture.

## `shotcraft doctor`

```bash
shotcraft doctor
```

Sanity-checks the setup before you run the full pipeline:

- Locates `shotcraft.config.ts` in the current directory (or wherever
  `--config` points)
- Validates the config schema
- Loads each configured template (failures surface as warnings, not
  blockers)
- Reports the real capture-spec count
- Probes the `target` URL with a 5-second timeout
- Discovers installed `@shotcraft/template-*` and
  `shotcraft-template-*` packages from `package.json`

Exits non-zero on any blocker problem (config missing or invalid,
target unreachable). Exits zero with warnings if templates aren't
installed yet.

## `shotcraft web`

```bash
shotcraft web
```

Boots the `@shotcraft/web` hosted companion locally with the
live-demo endpoint enabled. Resolves `@shotcraft/web` from the
consumer project, falls back to the workspace bundle, and emits a
clear error pointing at the workspace dev command if neither is
reachable.

## Global flags

| Flag                           | Effect                                                               |
| ------------------------------ | -------------------------------------------------------------------- |
| `-c <path>`, `--config <path>` | Override the config file location (default: search the current dir). |
| `-f`, `--force`                | (init only) Overwrite an existing `shotcraft.config.ts`.             |
| `--headed`                     | Run Chromium with a visible head — useful for debugging.             |
| `-v`, `--version`              | Print the installed Shotcraft version.                               |
| `-h`, `--help`                 | Print top-level help.                                                |

## Programmatic equivalents

If the CLI is too coarse — for example, you want to run capture against
a list of URLs that's computed at runtime — every subcommand has a
programmatic equivalent. See
[Config reference → Programmatic API](./config.md#programmatic-api).
