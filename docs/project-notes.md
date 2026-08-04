# shotcraft — project notes

> Moved out of `CLAUDE.md` on 2026-08-04 so it is read when relevant
> rather than loaded into every session. Content is unchanged.
> Protocol: `claude-team-config/docs/specs/prompt-ablation.md`.

Most of this describes code that can simply be read. It is kept because
deleting it would lose the parts that cannot — deployment targets,
access paths, and decisions whose reasoning is not in the source.

---

## Project Structure

```
shotcraft/                                  (repo root)
├── packages/
│   ├── core/                               → npm: shotcraft (CLI + programmatic API)
│   │   ├── src/cli/index.ts                # subcommand dispatch
│   │   ├── src/config/                     # defineConfig, type defs
│   │   ├── src/capture/                    # Playwright orchestration (Phase 2)
│   │   ├── src/render/                     # template runner (Phase 3)
│   │   ├── src/template/types.ts           # ShotcraftTemplate contract
│   │   └── src/index.ts                    # public exports
│   ├── web/                                → npm: @shotcraft/web (hosted companion)
│   │   ├── server/src/                     # Express, mirrors BudgetBug pattern
│   │   └── client/src/                     # React + Vite
│   └── template-*/                         → 7 first-party templates (Phase 4 + desktop-hero)
├── examples/budgetbug/                     # reference config (Phase 5)
├── docs/                                   # Plain markdown docs (rendered on GitHub)
├── .changeset/                             # Changesets versioning
├── .github/workflows/                      # ci.yml, release.yml
├── pnpm-workspace.yaml
└── tsconfig.base.json                      # shared strict TS config
```

## Tech Stack

| Layer                | Choice                                            |
| -------------------- | ------------------------------------------------- |
| Language             | TypeScript ^5.6 strict                            |
| Package mgr          | pnpm 11 (workspaces)                              |
| Bundler (core)       | tsup → ESM only                                   |
| Bundler (web client) | Vite 5                                            |
| Runtime (web server) | Express 5 + tsx (dev) / tsc (prod)                |
| Tests                | Vitest 2                                          |
| Lint                 | ESLint 9 flat config + typescript-eslint          |
| Format               | Prettier 3                                        |
| Versioning           | Changesets                                        |
| Capture engine       | Playwright (Chromium only for v1)                 |
| Docs site            | Plain markdown under `docs/` (rendered on GitHub) |

