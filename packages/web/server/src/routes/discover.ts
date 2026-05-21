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
  runWithPhaseEmitter,
  type DiscoverTechniques,
  type PhaseEvent,
  type RenderDemoAuth,
  type ScreenAction,
} from "../render-demo-engine.js";

export const discoverRouter: Router = Router();

const LIVE_DEMO_ENABLED = process.env.SHOTCRAFT_LIVE_DEMO === "1";
const LIVE_DEMO_TOKEN = process.env.SHOTCRAFT_LIVE_DEMO_TOKEN ?? "";

/**
 * Streams NDJSON (newline-delimited JSON). Each line is either:
 *   {"phase":"auth.form.start","t_ms":12,"data":{...}}   — live phase
 *   {"done":true,"result":{routes,summary}}              — success
 *   {"done":true,"error":"...","errorScreenshot":"..."}  — failure
 *
 * The client uses fetch + Response.body.getReader() to render phases
 * as they arrive — making "Crawling… (60s budget)" actually
 * troubleshoot-able (auth steps, technique starts/stops, content-wait
 * race results are all visible live).
 */
discoverRouter.post("/", (req, res) => {
  // Validation errors fall back to plain JSON since the client hasn't
  // started reading the stream yet.
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

  const setupActions = Array.isArray(body.setupActions)
    ? (body.setupActions as ReadonlyArray<ScreenAction>)
    : undefined;

  // Switch to streaming mode. Once the first chunk goes out we can't
  // change status codes, so route-level errors above must finish
  // synchronously before this point.
  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  // Defeat reverse-proxy buffering (Azure App Service + nginx-style
  // proxies will hold chunks otherwise). Combined with explicit
  // res.flushHeaders() so headers land before the engine starts work.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const writeLine = (obj: unknown): void => {
    try {
      res.write(JSON.stringify(obj) + "\n");
    } catch {
      /* socket may have closed; nothing to do */
    }
  };
  const emit = (event: PhaseEvent): void => writeLine(event);

  void runWithPhaseEmitter(emit, async () => {
    try {
      const result = await discoverRoutes({
        url: typeof body.url === "string" ? body.url : "",
        ...(typeof body.maxDepth === "number" ? { maxDepth: body.maxDepth } : {}),
        ...(typeof body.maxPages === "number" ? { maxPages: body.maxPages } : {}),
        ...(techniques ? { techniques } : {}),
        ...(auth ? { auth } : {}),
        ...(setupActions ? { setupActions } : {}),
      });
      if (!result.ok) {
        writeLine({
          done: true,
          error: result.error,
          status: result.status,
          ...(result.errorScreenshot ? { errorScreenshot: result.errorScreenshot } : {}),
        });
      } else {
        writeLine({
          done: true,
          result: { routes: result.value.routes, summary: result.value.summary },
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      writeLine({ done: true, error: `discover crashed: ${message}`, status: 500 });
    } finally {
      res.end();
    }
  });
});
