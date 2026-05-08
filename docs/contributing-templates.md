# Build your own template

Publish a Shotcraft template package — the package contract and a
60-line starter.

Shotcraft templates are regular npm packages. The contract is small: a
default export describing where the wrapper lives and what dimensions it
produces. The render engine handles everything else.

## Package shape

```
shotcraft-template-yours/
├── package.json
├── src/
│   └── index.ts          # exports default ShotcraftTemplate
├── wrapper.html          # the marketing layer (loaded by Playwright)
├── wrapper.css
├── frames/
│   └── device.svg        # optional — chassis silhouette
├── samples/              # populated by the snapshot test
└── README.md
```

Naming convention:

- **First-party**: `@shotcraft/template-{id}` (reserved for the
  Shotcraft maintainers' published packages)
- **Community**: `shotcraft-template-{id}` or `@your-scope/shotcraft-template-{id}`

Both are auto-discovered by `shotcraft doctor`.

## The default export

```ts
// src/index.ts
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { ShotcraftTemplate } from "shotcraft";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..");

const template: ShotcraftTemplate = {
  id: "your-template", // unique, stable
  displayName: "Your Template", // optional — for CLI
  viewport: { width: 428, height: 926, dpr: 2 }, // CSS px the SPA sees
  output: { width: 1280, height: 720 }, // physical px of final PNG
  themes: ["dark", "light"],
  wrapperHtmlPath: resolve(PACKAGE_ROOT, "wrapper.html"),
  isMobile: true, // optional, default false
  defaultOptions: {
    // optional, exposed via opt.* URL params
    accent: "#34d399",
  },
};

export default template;
```

`wrapperHtmlPath` is resolved from `import.meta.url` so it works whether
the template is consumed from `node_modules` or from a workspace
symlink.

## The wrapper

`wrapper.html` is what Playwright navigates to. Shotcraft passes URL
params (`caption`, `subtitle`, `theme`, `imageUrl`, plus any `opt.*` from
`defaultOptions`). The wrapper's `<script>` reads them, populates the
DOM, and signals readiness.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="wrapper.css" />
  </head>
  <body data-theme="dark">
    <h1 id="caption" class="caption"></h1>
    <p id="subtitle" class="subtitle"></p>
    <img id="screen" class="screen" alt="" />
    <script>
      (function () {
        const params = new URLSearchParams(location.search);
        document.body.dataset.theme = params.get("theme") === "light" ? "light" : "dark";
        document.getElementById("caption").textContent = params.get("caption") ?? "";
        const subtitle = params.get("subtitle");
        const subtitleEl = document.getElementById("subtitle");
        if (subtitle) subtitleEl.textContent = subtitle;
        else subtitleEl.remove();

        const img = document.getElementById("screen");
        const finish = (state) => {
          // The render engine waits for this attribute before screenshotting.
          document.body.dataset.rendered = state;
        };
        img.addEventListener("load", () => finish("true"));
        img.addEventListener("error", () => finish("error"));
        img.src = params.get("imageUrl") ?? "";
      })();
    </script>
  </body>
</html>
```

The render engine:

1. Opens this file at the template's `output` dimensions
2. Waits for `document.body.dataset.rendered === "true"`
3. Awaits `document.fonts.ready`
4. Screenshots at exactly `output.width × output.height`

## URL parameters

All passed in the wrapper's URL by the render engine:

| Param       | Type      | Source                                              |
| ----------- | --------- | --------------------------------------------------- |
| `caption`   | string    | `screen.caption` from `shotcraft.config.ts`         |
| `subtitle`  | string    | `screen.subtitle` (optional)                        |
| `theme`     | enum      | `"dark"` or `"light"`                               |
| `imageUrl`  | URL       | `file://...` to the captured raw PNG                |
| `opt.<key>` | primitive | `template.defaultOptions[key]` (string/number/bool) |

The `opt.*` prefix avoids collisions with the standard params.

## Layering the device frame

The Shotcraft first-party templates use a layering trick:

- The captured screen `<img>` is positioned with `z-index: 1`
- The frame SVG sits on top with `z-index: 2`, and uses an SVG `<mask>`
  with `fill-rule: evenodd` to punch a transparent screen aperture in
  the chassis bezel

That way the captured screen shows through cleanly while the bezel
overlays its edges, hiding any object-fit cropping at the corners.

See [`packages/template-app-store-iphone/wrapper.css`](../packages/template-app-store-iphone/wrapper.css)
for a working reference.

## The exports map

Templates need a `default` condition in their `package.json` `exports`
map so Shotcraft's CJS-anchored resolver finds them:

```json
{
  "name": "shotcraft-template-yours",
  "type": "module",
  "main": "./dist/index.js",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist", "wrapper.html", "wrapper.css", "frames", "samples"],
  "peerDependencies": {
    "shotcraft": "^0.1.0"
  }
}
```

The `default` condition matters: without it, Shotcraft's loader (which
uses `createRequire` to anchor resolution at the consumer's project)
fails with `No "exports" main defined` for ESM-only packages.

## Snapshot test

A snapshot test that drives Playwright against a synthetic raw is the
easiest way to confirm your template renders at the right dimensions
and looks polished. See
[`packages/template-app-store-iphone/test/render.test.ts`](../packages/template-app-store-iphone/test/render.test.ts)
for a working pattern. Commit the produced PNGs to `samples/` so the
gallery can show them.

## Publishing

```bash
npm publish --access public
```

Once published, users can install your template alongside Shotcraft and
list it in their config:

```ts
templates: ["shotcraft-template-yours"];
```

If your template is broadly useful, send a PR adding it to the
[community gallery](https://github.com/miopea/shotcraft#community-templates) — we're happy to link.
