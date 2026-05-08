---
"shotcraft": patch
---

`@shotcraft/web`: live-demo (`POST /api/render-demo` + `/demo` page)
ships as a real implementation, replacing the v0 501 stub. Off by
default; opt in with `SHOTCRAFT_LIVE_DEMO=1` and an optional
`SHOTCRAFT_LIVE_DEMO_TOKEN` shared-secret. SSRF-safe URL allowlist
(blocks localhost / RFC1918 / 169.254.x), 1 render at a time, 60s
deadline.

The CLI surface (`shotcraft web`) is unchanged — same flag flips the
local instance into live-demo mode. This release just makes the
hosted endpoint actually do something.

See [docs/live-demo.md](https://github.com/miopea/shotcraft/blob/main/docs/live-demo.md)
for the env vars + deploy recipe.
