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
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import express from "express";
import { templatesRouter } from "./routes/templates.js";
import { renderDemoRouter } from "./routes/render-demo.js";
import { captureRouter } from "./routes/capture.js";
import { renderRouter } from "./routes/render.js";
import { discoverRouter } from "./routes/discover.js";
import { localConfigRouter, LOCAL_CONFIG_PATH } from "./routes/local-config.js";

/**
 * Set up fontconfig so Chromium can find Inter + alias `system-ui`
 * etc. to it. Crucially: writes to USER-writable fontconfig paths
 * (`~/.config/fontconfig/fonts.conf`), NOT /usr/share/fonts. Azure
 * App Service runs Node as a non-root app user, so /usr/share/fonts
 * writes fail with EACCES. The user's fontconfig is read by every
 * fontconfig client (including Chromium child processes) since they
 * inherit `$HOME` from the Node process.
 *
 * Approach:
 *   1. Bundled Inter .otf/.ttf live in `server/fonts/` (deployed).
 *      We don't COPY them — fontconfig's `<dir>` directive lets it
 *      read fonts from any path.
 *   2. Write `~/.config/fontconfig/fonts.conf` that registers the
 *      server/fonts/ dir as a font source AND defines the alias
 *      mappings (system-ui → Inter, ui-sans-serif → Inter, etc.).
 *   3. Run fc-cache on the bundled dir if available.
 *
 * No-op on non-Linux + when bundled fonts aren't present.
 */
function installFontsBestEffort(): void {
  if (process.platform !== "linux") {
    process.stdout.write(`[shotcraft-web] font install skipped: platform=${process.platform}\n`);
    return;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const fontsSrc = join(here, "..", "fonts");
  if (!existsSync(fontsSrc)) {
    process.stdout.write(`[shotcraft-web] font install skipped: ${fontsSrc} not present\n`);
    return;
  }
  process.stdout.write(`[shotcraft-web] font install: source dir ${fontsSrc}\n`);
  const home = process.env.HOME || "/root";
  const fcDir = join(home, ".config", "fontconfig");
  const fcConf = join(fcDir, "fonts.conf");
  const fcXml = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <!-- Register the deploy bundle's font dir so fontconfig finds Inter. -->
  <dir>${fontsSrc}</dir>
  <!-- Map Tailwind's font-sans stack to Inter on Linux, where these
       abstract families have no built-in alias. -->
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
    mkdirSync(fcDir, { recursive: true });
    writeFileSync(fcConf, fcXml);
    process.stdout.write(`[shotcraft-web] font install: wrote ${fcConf}\n`);
  } catch (err) {
    process.stdout.write(
      `[shotcraft-web] font install: write ${fcConf} failed (${err instanceof Error ? err.message : String(err)})\n`,
    );
    return;
  }
  // Refresh user-level font cache so fontconfig picks up the new
  // dir + aliases. fc-cache writes to ~/.cache/fontconfig/ which is
  // user-writable.
  try {
    execSync("fc-cache -f", { stdio: "pipe" });
    process.stdout.write(`[shotcraft-web] font install: fc-cache refreshed\n`);
  } catch (err) {
    // fc-cache might not be on PATH on this image. Fontconfig will
    // still scan fonts at chromium-start time, just slower per launch.
    process.stdout.write(
      `[shotcraft-web] font install: fc-cache unavailable (${err instanceof Error ? err.message.slice(0, 80) : "err"})\n`,
    );
  }
  // Verify by running fc-match if available.
  try {
    const result = execSync("fc-match system-ui", { encoding: "utf8" }).trim();
    process.stdout.write(`[shotcraft-web] font install: fc-match system-ui → ${result}\n`);
  } catch {
    /* fc-match not available; ignore */
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
