/**
 * POST /api/render-demo
 *
 * Live-demo endpoint — runs Playwright server-side against a user-supplied
 * URL and returns a composited PNG. Disabled by default; opt in by setting
 * `SHOTCRAFT_LIVE_DEMO=1`. Optional shared-secret gate via
 * `SHOTCRAFT_LIVE_DEMO_TOKEN` (callers send `Authorization: Bearer <token>`).
 *
 * Body: { url, caption, subtitle?, templateId, theme? }
 * Returns: image/png (raw bytes) on success, JSON error otherwise.
 *
 * Hard limits live in `render-demo-engine.ts`: 1 render at a time,
 * 60s total per request, and an SSRF-blocking URL allowlist.
 */

import { Router } from "express";
import { runRenderDemo } from "../render-demo-engine.js";

export const renderDemoRouter: Router = Router();

const LIVE_DEMO_ENABLED = process.env.SHOTCRAFT_LIVE_DEMO === "1";
const LIVE_DEMO_TOKEN = process.env.SHOTCRAFT_LIVE_DEMO_TOKEN ?? "";

renderDemoRouter.post("/", (req, res) => {
  if (!LIVE_DEMO_ENABLED) {
    res.status(403).json({
      error:
        "live demo is disabled in this deployment. Set SHOTCRAFT_LIVE_DEMO=1 in the App Service environment to enable.",
      docsUrl: "https://github.com/miopea/shotcraft/tree/main/docs",
    });
    return;
  }

  if (LIVE_DEMO_TOKEN.length > 0) {
    const auth = req.header("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/.exec(auth);
    if (!match || match[1] !== LIVE_DEMO_TOKEN) {
      res.status(401).json({
        error:
          "live demo requires a token. Send `Authorization: Bearer <token>` matching the SHOTCRAFT_LIVE_DEMO_TOKEN env var.",
      });
      return;
    }
  }

  const body = req.body as Record<string, unknown> | undefined;
  if (!body) {
    res.status(400).json({ error: "Missing JSON body." });
    return;
  }

  // Hand off to the engine; it does its own validation + queueing.
  void runRenderDemo({
    url: typeof body.url === "string" ? body.url : "",
    caption: typeof body.caption === "string" ? body.caption : "",
    ...(typeof body.subtitle === "string" ? { subtitle: body.subtitle } : {}),
    templateId: typeof body.templateId === "string" ? body.templateId : "",
    ...(body.theme === "dark" || body.theme === "light" ? { theme: body.theme } : {}),
  })
    .then((result) => {
      if (!result.ok) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.set("Content-Type", "image/png");
      res.set("Cache-Control", "no-store");
      res.set("X-Shotcraft-Template", result.template.id);
      res.set("X-Shotcraft-Theme", result.theme);
      res.send(result.png);
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `render-demo crashed: ${message}` });
    });
});
