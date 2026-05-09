/**
 * POST /api/capture
 *
 * Capture-only endpoint — used by the Crawler page to grab one screen
 * at a time without composing through any template. Returns the raw
 * PNG; the browser then sends it back via /api/render to composite.
 *
 * Same gating as /api/render-demo: SHOTCRAFT_LIVE_DEMO=1 + optional
 * SHOTCRAFT_LIVE_DEMO_TOKEN. The `auth` field requires the token gate
 * (forces deployers to gate credential-handling endpoints).
 *
 * Body:
 *   { url, viewport: { width, height, dpr }, isMobile?, theme?, waitMs?, auth? }
 *
 * Returns image/png on success or JSON { error } on failure.
 */

import { Router } from "express";
import { captureScreen, type RenderDemoAuth, type ScreenAction } from "../render-demo-engine.js";

export const captureRouter: Router = Router();

const LIVE_DEMO_ENABLED = process.env.SHOTCRAFT_LIVE_DEMO === "1";
const LIVE_DEMO_TOKEN = process.env.SHOTCRAFT_LIVE_DEMO_TOKEN ?? "";

captureRouter.post("/", (req, res) => {
  if (!LIVE_DEMO_ENABLED) {
    res.status(403).json({
      error: "Capture endpoint disabled in this deployment. Set SHOTCRAFT_LIVE_DEMO=1 to enable.",
    });
    return;
  }

  if (LIVE_DEMO_TOKEN.length > 0) {
    const authHeader = req.header("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/.exec(authHeader);
    if (!match || match[1] !== LIVE_DEMO_TOKEN) {
      res.status(401).json({
        error:
          "Capture requires a token. Send `Authorization: Bearer <token>` matching SHOTCRAFT_LIVE_DEMO_TOKEN.",
      });
      return;
    }
  }

  const body = req.body as Record<string, unknown> | undefined;
  if (!body) {
    res.status(400).json({ error: "Missing JSON body." });
    return;
  }

  const auth = body.auth as RenderDemoAuth | undefined;
  if (auth && LIVE_DEMO_TOKEN.length === 0) {
    res.status(400).json({
      error:
        "`auth` requires SHOTCRAFT_LIVE_DEMO_TOKEN to be set. Refusing credential submission through an ungated endpoint.",
    });
    return;
  }

  const viewport = body.viewport as
    | { width?: unknown; height?: unknown; dpr?: unknown }
    | undefined;

  const actions = Array.isArray(body.actions)
    ? (body.actions as ReadonlyArray<ScreenAction>)
    : undefined;
  const setupActions = Array.isArray(body.setupActions)
    ? (body.setupActions as ReadonlyArray<ScreenAction>)
    : undefined;

  void captureScreen({
    url: typeof body.url === "string" ? body.url : "",
    viewport: {
      width: typeof viewport?.width === "number" ? viewport.width : 0,
      height: typeof viewport?.height === "number" ? viewport.height : 0,
      dpr: typeof viewport?.dpr === "number" ? viewport.dpr : 0,
    },
    ...(typeof body.isMobile === "boolean" ? { isMobile: body.isMobile } : {}),
    ...(body.theme === "dark" || body.theme === "light" ? { theme: body.theme } : {}),
    ...(typeof body.waitMs === "number" ? { waitMs: body.waitMs } : {}),
    ...(auth ? { auth } : {}),
    ...(actions ? { actions } : {}),
    ...(setupActions ? { setupActions } : {}),
  })
    .then((result) => {
      if (!result.ok) {
        res.status(result.status).json({
          error: result.error,
          ...(result.errorScreenshot ? { errorScreenshot: result.errorScreenshot } : {}),
        });
        return;
      }
      res.set("Content-Type", "image/png");
      res.set("Cache-Control", "no-store");
      res.send(result.value);
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `capture crashed: ${message}` });
    });
});
