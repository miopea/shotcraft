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

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { templatesRouter } from "./routes/templates.js";
import { renderDemoRouter } from "./routes/render-demo.js";
import { captureRouter } from "./routes/capture.js";
import { renderRouter } from "./routes/render.js";
import { discoverRouter } from "./routes/discover.js";

const app = express();
const PORT = Number(process.env.PORT ?? 3002);
const LIVE_DEMO_ENABLED = process.env.SHOTCRAFT_LIVE_DEMO === "1";

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    liveDemoEnabled: LIVE_DEMO_ENABLED,
    version: "0.0.0",
  });
});

app.use("/api/templates", templatesRouter);
app.use("/api/render-demo", renderDemoRouter);
app.use("/api/capture", captureRouter);
app.use("/api/render", renderRouter);
app.use("/api/discover", discoverRouter);

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
