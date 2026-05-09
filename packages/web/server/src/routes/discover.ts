/**
 * POST /api/discover
 *
 * Auto-crawl helper for the Crawler page. Given a base URL (and
 * optionally login credentials), BFS-walks same-origin `<a href>`s up
 * to `maxDepth` / `maxPages` and returns the discovered paths so the
 * operator can pick which ones to capture.
 *
 * Same gating as /api/capture: SHOTCRAFT_LIVE_DEMO=1 + optional
 * SHOTCRAFT_LIVE_DEMO_TOKEN. The `auth` field still requires the token
 * gate (forces deployers to gate credential-handling endpoints).
 *
 * Body:
 *   { url, maxDepth?, maxPages?, auth? }
 *
 * Response:
 *   { routes: [{ path, title, depth }, ...] }
 */

import { Router } from "express";
import {
  discoverRoutes,
  type DiscoverTechniques,
  type RenderDemoAuth,
} from "../render-demo-engine.js";

export const discoverRouter: Router = Router();

const LIVE_DEMO_ENABLED = process.env.SHOTCRAFT_LIVE_DEMO === "1";
const LIVE_DEMO_TOKEN = process.env.SHOTCRAFT_LIVE_DEMO_TOKEN ?? "";

discoverRouter.post("/", (req, res) => {
  if (!LIVE_DEMO_ENABLED) {
    res.status(403).json({
      error: "Discover endpoint disabled in this deployment. Set SHOTCRAFT_LIVE_DEMO=1 to enable.",
    });
    return;
  }

  if (LIVE_DEMO_TOKEN.length > 0) {
    const authHeader = req.header("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/.exec(authHeader);
    if (!match || match[1] !== LIVE_DEMO_TOKEN) {
      res.status(401).json({
        error:
          "Discover requires a token. Send `Authorization: Bearer <token>` matching SHOTCRAFT_LIVE_DEMO_TOKEN.",
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

  const techniques =
    body.techniques && typeof body.techniques === "object"
      ? (body.techniques as DiscoverTechniques)
      : undefined;

  void discoverRoutes({
    url: typeof body.url === "string" ? body.url : "",
    ...(typeof body.maxDepth === "number" ? { maxDepth: body.maxDepth } : {}),
    ...(typeof body.maxPages === "number" ? { maxPages: body.maxPages } : {}),
    ...(techniques ? { techniques } : {}),
    ...(auth ? { auth } : {}),
  })
    .then((result) => {
      if (!result.ok) {
        res.status(result.status).json({
          error: result.error,
          ...(result.errorScreenshot ? { errorScreenshot: result.errorScreenshot } : {}),
        });
        return;
      }
      res.set("Cache-Control", "no-store");
      res.json({ routes: result.value });
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `discover crashed: ${message}` });
    });
});
