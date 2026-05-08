# Shotcraft docs

The Shotcraft documentation lives as plain markdown in this directory
so it renders directly on GitHub — no separate site to deploy, no build
step, no second source of truth to keep in sync.

## Read in order

1. **[Getting started](./getting-started.md)** — install, scaffold a
   config, wire your auth, run end-to-end. ~5 minutes.
2. **[Config reference](./config.md)** — every field on `defineConfig`,
   plus the auth helpers (`apiLogin`, `formLogin`, `injectSession`,
   `chain`).
3. **[CLI reference](./cli.md)** — every subcommand and global flag.
4. **[Templates gallery](./templates.md)** — visual previews of all six
   first-party templates rendered against a real app.
5. **[Build your own template](./contributing-templates.md)** — the
   package contract and a 60-line starter.
6. **[Live demo](./live-demo.md)** — the hosted `/demo` endpoint that
   runs renders server-side, plus the env vars to enable it on your own
   deployment.

## Try it interactively

The hosted companion (`@shotcraft/web`) ships a templates gallery and
an interactive config builder you can use without installing anything:

> https://shotcraft-web.azurewebsites.net

It also runs locally — `pnpm shotcraft web` after you've added Shotcraft
to a project.

## Examples

- [`examples/budgetbug`](../examples/budgetbug) — the canonical
  real-world demo. Drives BudgetBug's running dev server through every
  first-party template.
- [`examples/shotcraft-docs`](../examples/shotcraft-docs) — the
  eat-our-own-dogfood example that rendered the README hero and OG card
  at the top of the project's repo.

## Contributing

Bug reports + feature requests on the
[GitHub issue tracker](https://github.com/miopea/shotcraft/issues).
PRs welcome — keep them focused, include a test, and add a
[Changeset](../.changeset/README.md) entry describing the bump.
