/**
 * Shotcraft web companion — Express entry point.
 *
 * Same architecture pattern as the budgetbug server (Express + React/Vite
 * frontend, deployed to Azure App Service B1).
 *
 * Two run modes:
 *
 *   1. PRODUCTION (deployed to Azure App Service):
 *      Serves the built React client + APIs for the templates gallery and
 *      config builder. The live-demo endpoint is DISABLED (returns 403 with
 *      "run locally to try it"). No Playwright server-side. No abuse vector.
 *
 *   2. LOCAL DEV / `shotcraft web`:
 *      Same APIs PLUS the live-demo endpoint enabled, which runs Playwright
 *      against a user-supplied URL using the local install. No rate limits,
 *      no auth — it's the operator's own machine.
 *
 * The toggle is `SHOTCRAFT_LIVE_DEMO=1`. Unset = production mode.
 */

import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import express from "express";
import { templatesRouter } from "./routes/templates.js";
import { renderDemoRouter } from "./routes/render-demo.js";
import { captureRouter } from "./routes/capture.js";
import { renderRouter } from "./routes/render.js";
import { discoverRouter } from "./routes/discover.js";
import { localConfigRouter, LOCAL_CONFIG_PATH } from "./routes/local-config.js";

/**
 * Install Inter + the fontconfig aliases at server startup. Was in
 * startup.sh, but Azure's appCommandLine wrapping made debugging the
 * shell script's behavior opaque (no [startup] echoes in docker.log).
 * Doing it from Node where we DO have stdout visibility.
 *
 * No-op when:
 *   - we're not on Linux (local Mac/Windows dev)
 *   - the bundled fonts aren't present (running outside the deploy)
 *   - we don't have write permission on /usr/share/fonts (non-root)
 *
 * On a fresh boot of the Azure container (which runs Node as root),
 * this populates the system font dir + fontconfig alias file so
 * Tailwind's `system-ui` resolves to Inter for headless captures.
 */
function installFontsBestEffort(): void {
  if (process.platform !== "linux") {
    process.stdout.write(`[shotcraft-web] font install skipped: platform=${process.platform}\n`);
    return;
  }
  // Server runs from server/dist/index.js. Bundle fonts live next to
  // it at server/fonts/.
  const here = dirname(fileURLToPath(import.meta.url));
  const fontsSrc = join(here, "..", "fonts");
  if (!existsSync(fontsSrc)) {
    process.stdout.write(`[shotcraft-web] font install skipped: ${fontsSrc} not present\n`);
    return;
  }
  const fontsDst = "/usr/share/fonts/truetype/inter";
  try {
    mkdirSync(fontsDst, { recursive: true });
    const files = readdirSync(fontsSrc).filter((f) => f.endsWith(".otf") || f.endsWith(".ttf"));
    for (const f of files) {
      copyFileSync(join(fontsSrc, f), join(fontsDst, f));
    }
    process.stdout.write(
      `[shotcraft-web] font install: copied ${files.length} files to ${fontsDst}\n`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`[shotcraft-web] font install: copy failed (${msg}) — skipping\n`);
    return;
  }
  // Write fontconfig aliases mapping abstract families (system-ui,
  // ui-sans-serif, etc.) to Inter. Tailwind's `font-sans` stack uses
  // these and Linux fontconfig has no built-in alias for them.
  const aliasesPath = "/etc/fonts/conf.d/99-shotcraft-aliases.conf";
  const aliasesXml = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <alias binding="strong"><family>system-ui</family><prefer><family>Inter</family></prefer></alias>
  <alias binding="strong"><family>ui-sans-serif</family><prefer><family>Inter</family></prefer></alias>
  <alias binding="strong"><family>-apple-system</family><prefer><family>Inter</family></prefer></alias>
  <alias binding="strong"><family>BlinkMacSystemFont</family><prefer><family>Inter</family></prefer></alias>
  <alias binding="strong"><family>SF Pro</family><prefer><family>Inter</family></prefer></alias>
  <alias binding="strong"><family>SF Pro Display</family><prefer><family>Inter</family></prefer></alias>
  <alias binding="strong"><family>SF Pro Text</family><prefer><family>Inter</family></prefer></alias>
  <alias binding="weak"><family>sans-serif</family><prefer><family>Inter</family></prefer></alias>
</fontconfig>
`;
  try {
    mkdirSync(dirname(aliasesPath), { recursive: true });
    writeFileSync(aliasesPath, aliasesXml);
    process.stdout.write(`[shotcraft-web] font install: wrote ${aliasesPath}\n`);
  } catch (err) {
    process.stdout.write(
      `[shotcraft-web] font install: alias write failed (${err instanceof Error ? err.message : String(err)})\n`,
    );
  }
  // Refresh font cache so Chromium picks up the new fonts + aliases.
  try {
    execSync("fc-cache -f", { stdio: "ignore" });
    process.stdout.write(`[shotcraft-web] font install: fc-cache refreshed\n`);
  } catch {
    // fc-cache may not be on PATH if fontconfig wasn't installed —
    // captures will still pick up the fonts on next boot when
    // Chromium re-scans.
    process.stdout.write(`[shotcraft-web] font install: fc-cache not available (best-effort)\n`);
  }
}

installFontsBestEffort();

const app = express();
const PORT = Number(process.env.PORT ?? 3002);
const LIVE_DEMO_ENABLED = process.env.SHOTCRAFT_LIVE_DEMO === "1";
const LOCAL_MODE = process.env.SHOTCRAFT_WEB_LOCAL_MODE === "1";

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    liveDemoEnabled: LIVE_DEMO_ENABLED,
    version: "0.0.0",
    ...(LOCAL_MODE ? { localMode: true, configPath: LOCAL_CONFIG_PATH } : {}),
  });
});

app.use("/api/templates", templatesRouter);
app.use("/api/render-demo", renderDemoRouter);
app.use("/api/capture", captureRouter);
app.use("/api/render", renderRouter);
app.use("/api/discover", discoverRouter);
// Local-config endpoints — mounted only when shotcraft web launched the
// server with a project root. Host deployments never expose these.
if (LOCAL_MODE) {
  app.use("/api/local/config", localConfigRouter);
}

// In production, serve the Vite-built client. In dev, the Vite dev server
// runs separately on its own port and proxies /api to here.
if (process.env.NODE_ENV === "production") {
  // Server bundle lives at `server/dist/index.js`; Vite emits the client to
  // `dist/client/` at the package root (see client/vite.config.ts). Two
  // hops up from `server/dist/` → package root → `dist/client/`.
  const here = fileURLToPath(new URL(".", import.meta.url));
  const clientDist = join(here, "../../dist/client");
  app.use(express.static(clientDist));
  // SPA fallback — every non-API GET serves index.html so React Router can
  // claim the path.
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(join(clientDist, "index.html"));
  });
}

// Bind to all interfaces (`0.0.0.0`) so the server is reachable on both
// `localhost` and any container/VM-internal IPs. The hosted production
// deployment fronts this with a reverse proxy; locally it lets the dev
// experience "just work" regardless of which interface the loopback
// resolves to.
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[shotcraft-web] listening on http://localhost:${PORT}` +
      (LIVE_DEMO_ENABLED ? " (live-demo ENABLED)" : ""),
  );
});
