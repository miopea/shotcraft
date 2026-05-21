# Live demo

The hosted companion ships an opt-in `/demo` page that runs Playwright
server-side against any public URL and returns a composited PNG. Same
engine the CLI uses locally — no install required.

The endpoint is **off by default** in production. Each deployment opts
in via env vars. The OSS pattern: anyone deploying their own copy of
`@shotcraft/web` decides whether to expose this.

## Try it

Live on the operator's deployment at:

> https://shotcraft.bfgsolutions.net/demo

Pick a template, paste a URL, click Render. ~5–15 seconds round-trip.

## Enable on your own deployment

Set these on the App Service (or whatever host runs `@shotcraft/web`):

```bash
# Required: turns the endpoint on
SHOTCRAFT_LIVE_DEMO=1

# Optional: shared-secret token. Visitors send Authorization: Bearer <token>.
# Leave unset and anyone hitting /api/render-demo can render.
SHOTCRAFT_LIVE_DEMO_TOKEN=<long-random-string>

# Required for App Service / Azure: where the deploy bundle pre-installed Chromium
PLAYWRIGHT_BROWSERS_PATH=/home/site/wwwroot/ms-playwright
```

For App Service Linux, the deploy also needs:

- A `startup.sh` that `apt-get install`s Chromium's system deps
  (`libglib2.0-0`, `libnss3`, `libpango-1.0-0`, etc.). The shipping
  `packages/web/server/startup.sh` does this.
- Startup command set to `bash startup.sh` (not `node server/dist/index.js`).
- `WEBSITES_CONTAINER_START_TIME_LIMIT=600` so the apt-install doesn't
  time out on cold start.

The deploy script
([`.github/workflows/deploy-azure.yml`](../.github/workflows/deploy-azure.yml))
bundles all of this automatically.

## API

```
POST /api/render-demo
Content-Type: application/json
Authorization: Bearer <token>   # only if SHOTCRAFT_LIVE_DEMO_TOKEN is set
```

Body:

```json
{
  "url": "https://example.com",
  "caption": "Hero text",
  "subtitle": "Optional second line",
  "templateId": "readme-hero",
  "theme": "dark",
  "auth": {
    /* optional — see "Target-app authentication" below */
  }
}
```

Returns the rendered PNG with `Content-Type: image/png` on success, or
JSON `{ error: string }` with a 4xx/5xx status. Response headers
`X-Shotcraft-Template` + `X-Shotcraft-Theme` echo what was rendered.

### Target-app authentication

If the URL you want to capture sits behind a login wall, send an
`auth` field with the credentials. Shotcraft logs in inside the
capture context before the page navigation. Three flavors:

```jsonc
// API login — POSTs JSON to your auth endpoint, follows the Set-Cookie
{
  "auth": {
    "type": "api",
    "url": "/api/auth/login",
    "body": { "email": "demo@example.com", "password": "..." },
    "method": "POST",                 // optional, defaults POST
    "headers": { "X-Tenant": "..." }, // optional, merged onto Content-Type
    "expectStatus": 200               // optional, throws on mismatch
  }
}

// Form login — fills a real HTML form
{
  "auth": {
    "type": "form",
    "url": "/login",
    "emailField": "input[name=email]",
    "passwordField": "input[name=password]",
    "submitButton": "button[type=submit]",
    "email": "demo@example.com",
    "password": "...",
    "waitForUrl": "**/dashboard"      // optional
  }
}

// Pre-existing session — no actual login round-trip
{
  "auth": {
    "type": "session",
    "cookies": [
      { "name": "sid", "value": "...", "domain": "your.app" }
    ],
    "localStorage": { "tour-dismissed": "1" }
  }
}
```

> **`SHOTCRAFT_LIVE_DEMO_TOKEN` is required when `auth` is supplied.** The
> server refuses authenticated renders without the gate. Reasoning: a
> server that submits arbitrary credentials to arbitrary URLs without an
> access gate is a credential-stuffing tool. Setting the token narrows
> usage to people who know it.

### Hard limits

- One render at a time per server. Concurrent requests queue.
- 60s total per request. After that Chromium is force-closed.
- URLs must be HTTP(S). Localhost / RFC1918 / link-local / metadata
  endpoints (`169.254.169.254`) are rejected to block SSRF against the
  host's internal network.
- Caption max 240 chars, subtitle max 480 chars, URL max 2048 chars.
- `auth` field requires `SHOTCRAFT_LIVE_DEMO_TOKEN` set on the server.
  Credentials are never logged.

### Templates

Pick from the seven first-party templates' ids:

- `app-store-iphone` — 1284×2778
- `app-store-ipad` — 2064×2752
- `play-store-phone` — 1080×1920
- `play-store-tablet` — 1920×1200
- `readme-hero` — 1280×640
- `social-og-card` — 1200×630 (dark only)
- `desktop-hero` — 1920×1080 (desktop viewport, browser chrome)

The deployer ships each template's `wrapper.html` + `wrapper.css` +
`frames/` under `templates/<id>/` in the zip — see the deploy stage
script.

## Why off by default

Running headless Chromium per request is heavy:

- ~150 MB Chromium binary in the deploy bundle
- ~300 MB RAM during a render (hard cap on App Service B1's 1.75 GB)
- 5–15s wall time per request — adversarial traffic can pin a single
  instance
- Renders any URL the host can reach — without the SSRF guard it's a
  vector for probing internal infra

The token gate gives a deployer a cheap "personal-use" mode. For broader
public use, swap App Service for Azure Container Apps (autoscale +
isolation per request) and tighten the URL allowlist.
