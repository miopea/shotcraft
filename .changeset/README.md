# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets). Each package change should add a markdown file here describing the change and the version bump it needs.

## Adding a changeset

```bash
pnpm changeset
```

Follow the prompts. The CLI writes a markdown file here. Commit it alongside your code change in the same PR.

## Releasing

A maintainer with publish access runs:

```bash
pnpm changeset version    # consumes pending changesets, bumps versions, updates CHANGELOGs
pnpm changeset publish    # publishes bumped packages to npm
```

CI also handles this on the `release` branch via `.github/workflows/release.yml`.
