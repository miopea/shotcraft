---
"shotcraft": minor
---

`shotcraft web` is live — boots the `@shotcraft/web` hosted companion
locally with `SHOTCRAFT_LIVE_DEMO=1` so the live-demo endpoint is
enabled. Resolution prefers the consumer project's `@shotcraft/web`
install, falls back to the workspace bundle, and emits a clear error
pointing at the workspace dev command if neither is reachable.

Replaces the v0 not-implemented stub for the `web` subcommand.
