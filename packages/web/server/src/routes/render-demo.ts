/**
 * POST /api/render-demo
 *
 * The "try Shotcraft on your own URL" demo endpoint. Only enabled when
 * SHOTCRAFT_LIVE_DEMO=1 is set in the environment — i.e. local dev via
 * `shotcraft web`. Production deployments leave this disabled to avoid
 * the Chromium-on-Azure complexity, abuse risk, and per-render compute.
 *
 * Body: { url: string, captions: string[], templateId: string }
 * Returns: { renders: [{ pngBase64: string, filename: string }, ...] }
 *
 * v0 stub — implementation lands in Phase 8.
 */

import { Router } from "express";

export const renderDemoRouter: Router = Router();

const LIVE_DEMO_ENABLED = process.env.SHOTCRAFT_LIVE_DEMO === "1";

renderDemoRouter.post("/", (_req, res) => {
  if (!LIVE_DEMO_ENABLED) {
    res.status(403).json({
      error:
        "live demo is disabled in this deployment. Run `pnpm shotcraft web` locally to enable it.",
      docsUrl: "https://shotcraft.dev/docs/local-demo",
    });
    return;
  }
  res.status(501).json({
    error: "v0 stub — render-demo endpoint lands in Phase 8 of the v1 plan.",
  });
});
