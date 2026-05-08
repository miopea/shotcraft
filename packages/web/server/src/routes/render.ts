/**
 * POST /api/render
 *
 * Composition-only endpoint — accepts a previously-captured raw PNG +
 * caption + template choice, returns the composite. No external URL
 * hits, so no SSRF surface; no credentials, so no auth-gate logic
 * (the demo gate token still applies).
 *
 * Content-type: multipart/form-data
 *   - `raw` — the raw PNG file (one part, max 10 MB)
 *   - `meta` — JSON string: { templateId, caption, subtitle?, theme? }
 *
 * Returns image/png on success or JSON { error } on failure.
 */

import { Router, type Request, type Response } from "express";
import { composeScreen } from "../render-demo-engine.js";

export const renderRouter: Router = Router();

const LIVE_DEMO_ENABLED = process.env.SHOTCRAFT_LIVE_DEMO === "1";
const LIVE_DEMO_TOKEN = process.env.SHOTCRAFT_LIVE_DEMO_TOKEN ?? "";
const MAX_RAW_BYTES = 10 * 1024 * 1024;

renderRouter.post("/", (req: Request, res: Response) => {
  if (!LIVE_DEMO_ENABLED) {
    res.status(403).json({
      error: "Render endpoint disabled in this deployment.",
    });
    return;
  }

  if (LIVE_DEMO_TOKEN.length > 0) {
    const authHeader = req.header("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/.exec(authHeader);
    if (!match || match[1] !== LIVE_DEMO_TOKEN) {
      res.status(401).json({
        error:
          "Render requires a token. Send `Authorization: Bearer <token>` matching SHOTCRAFT_LIVE_DEMO_TOKEN.",
      });
      return;
    }
  }

  // Accept either multipart (raw + meta) or JSON (raw as base64).
  const contentType = req.header("content-type") ?? "";

  if (contentType.includes("application/json")) {
    handleJson(req, res);
    return;
  }
  handleMultipart(req, res);
});

interface JsonRenderBody {
  rawBase64?: string;
  templateId?: string;
  caption?: string;
  subtitle?: string;
  theme?: string;
}

function handleJson(req: Request, res: Response): void {
  const body = req.body as JsonRenderBody | undefined;
  if (!body) {
    res.status(400).json({ error: "Missing JSON body." });
    return;
  }
  if (typeof body.rawBase64 !== "string" || body.rawBase64.length === 0) {
    res.status(400).json({ error: "`rawBase64` (base64-encoded PNG) is required." });
    return;
  }
  let raw: Buffer;
  try {
    raw = Buffer.from(body.rawBase64, "base64");
  } catch (err) {
    res.status(400).json({
      error: `Failed to decode rawBase64: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }
  if (raw.length === 0 || raw.length > MAX_RAW_BYTES) {
    res.status(400).json({ error: `Raw size out of bounds (1..${MAX_RAW_BYTES} bytes).` });
    return;
  }

  void composeScreen({
    raw,
    templateId: typeof body.templateId === "string" ? body.templateId : "",
    caption: typeof body.caption === "string" ? body.caption : "",
    ...(typeof body.subtitle === "string" ? { subtitle: body.subtitle } : {}),
    ...(body.theme === "dark" || body.theme === "light" ? { theme: body.theme } : {}),
  })
    .then((result) => respondWith(res, result))
    .catch((err: unknown) =>
      res.status(500).json({
        error: `render crashed: ${err instanceof Error ? err.message : String(err)}`,
      }),
    );
}

function handleMultipart(req: Request, res: Response): void {
  // Minimal multipart parser — we only accept exactly two fields:
  //   `raw` (file) and `meta` (text JSON). Express 5 doesn't ship
  //   multipart parsing out of the box and pulling `multer` just for
  //   this is overkill, so we walk the boundaries ourselves.
  const ct = req.header("content-type") ?? "";
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/.exec(ct);
  if (!boundaryMatch) {
    res.status(400).json({ error: "multipart request missing boundary." });
    return;
  }
  const boundary = `--${boundaryMatch[1] ?? boundaryMatch[2] ?? ""}`;

  const chunks: Buffer[] = [];
  let total = 0;
  req.on("data", (chunk: Buffer) => {
    total += chunk.length;
    if (total > MAX_RAW_BYTES + 64 * 1024) {
      req.destroy();
      res.status(413).json({ error: "Body too large." });
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    let raw: Buffer | null = null;
    let meta: { templateId?: string; caption?: string; subtitle?: string; theme?: string } = {};
    try {
      const body = Buffer.concat(chunks);
      const boundaryBuf = Buffer.from(boundary);
      let cursor = 0;
      while (cursor < body.length) {
        const partStart = body.indexOf(boundaryBuf, cursor);
        if (partStart === -1) break;
        const headerStart = partStart + boundaryBuf.length;
        if (body.slice(headerStart, headerStart + 2).toString() === "--") break;
        const headerEnd = body.indexOf("\r\n\r\n", headerStart);
        if (headerEnd === -1) break;
        const partHeader = body.slice(headerStart, headerEnd).toString();
        const partDataStart = headerEnd + 4;
        const nextBoundary = body.indexOf(boundaryBuf, partDataStart);
        if (nextBoundary === -1) break;
        const partData = body.slice(partDataStart, nextBoundary - 2); // strip trailing \r\n

        const nameMatch = /name="([^"]+)"/.exec(partHeader);
        const name = nameMatch?.[1];
        if (name === "raw") {
          raw = partData;
        } else if (name === "meta") {
          meta = JSON.parse(partData.toString("utf8")) as typeof meta;
        }
        cursor = nextBoundary;
      }
    } catch (err) {
      res.status(400).json({
        error: `Failed to parse multipart: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    if (!raw || raw.length === 0) {
      res.status(400).json({ error: "Missing `raw` file part." });
      return;
    }

    void composeScreen({
      raw,
      templateId: typeof meta.templateId === "string" ? meta.templateId : "",
      caption: typeof meta.caption === "string" ? meta.caption : "",
      ...(typeof meta.subtitle === "string" ? { subtitle: meta.subtitle } : {}),
      ...(meta.theme === "dark" || meta.theme === "light" ? { theme: meta.theme } : {}),
    })
      .then((result) => respondWith(res, result))
      .catch((err: unknown) =>
        res.status(500).json({
          error: `render crashed: ${err instanceof Error ? err.message : String(err)}`,
        }),
      );
  });
  req.on("error", (err) => {
    res.status(400).json({ error: `request stream error: ${err.message}` });
  });
}

function respondWith(
  res: Response,
  result: { ok: true; value: Buffer } | { ok: false; status: number; error: string },
): void {
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.set("Content-Type", "image/png");
  res.set("Cache-Control", "no-store");
  res.send(result.value);
}
