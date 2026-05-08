---
"shotcraft": patch
---

`@shotcraft/web`: live-demo gains optional target-app authentication.
The `/api/render-demo` body now accepts an `auth` field that runs
inside the capture context before the page navigation. Three flavors
mirror the CLI's `shotcraft/auth` helpers:

- `{ type: "api", url, body, ... }` — POST JSON to an auth endpoint
- `{ type: "form", url, emailField, passwordField, submitButton, email, password, ... }`
- `{ type: "session", cookies?, localStorage?, sessionStorage? }`

The `/demo` UI gains a "Target-app login" picker with per-mode
sub-forms.

`auth` is **refused** unless the deployment sets
`SHOTCRAFT_LIVE_DEMO_TOKEN` — a server submitting arbitrary
credentials to arbitrary URLs without an access gate is a
credential-stuffing tool, so the rule forces deployers to gate it
explicitly. Credentials are never logged.
