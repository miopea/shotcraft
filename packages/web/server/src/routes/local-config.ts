/**
 * Local-mode config endpoint — used by `shotcraft web` (the CLI launches
 * the server with `SHOTCRAFT_WEB_LOCAL_MODE=1` and points
 * `SHOTCRAFT_LOCAL_CONFIG_PATH` at `./shotcraft.config.json` in cwd).
 *
 * Lets the Crawler page edit the on-disk JSON config in place: a fresh
 * fetch on mount, debounced PUTs on change. The TS-format config remains
 * the canonical CLI input for users with custom `setup()` functions; this
 * endpoint deals with the JSON-friendly subset only.
 *
 * Mounted only when `SHOTCRAFT_WEB_LOCAL_MODE=1`. The hosted production
 * deployment never sees these routes — no chance of leaking the host's
 * filesystem.
 *
 * GET  /api/local/config — returns { config } (or { config: null } if
 *                          file doesn't exist yet).
 * PUT  /api/local/config — body: { config: <object> }, writes to file.
 */

import { Router } from "express";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

export const LOCAL_CONFIG_PATH = (() => {
  const raw = process.env.SHOTCRAFT_LOCAL_CONFIG_PATH;
  if (!raw) return resolve(process.cwd(), "shotcraft.config.json");
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
})();

const MAX_CONFIG_BYTES = 1_000_000; // 1 MB cap on what we'll write back

export const localConfigRouter: Router = Router();

localConfigRouter.get("/", (_req, res) => {
  void (async () => {
    try {
      const buf = await readFile(LOCAL_CONFIG_PATH, "utf8");
      const parsed: unknown = JSON.parse(buf);
      res.json({ config: parsed, path: LOCAL_CONFIG_PATH });
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") {
        res.json({ config: null, path: LOCAL_CONFIG_PATH });
        return;
      }
      res.status(500).json({
        error: `Failed to read ${LOCAL_CONFIG_PATH}: ${e.message}`,
      });
    }
  })();
});

localConfigRouter.put("/", (req, res) => {
  void (async () => {
    const body = req.body as { config?: unknown } | undefined;
    if (!body || typeof body !== "object" || !("config" in body)) {
      res.status(400).json({ error: "Body must be { config: <object> }." });
      return;
    }
    const config = body.config;
    if (!config || typeof config !== "object") {
      res.status(400).json({ error: "config must be a non-null object." });
      return;
    }
    const serialized = JSON.stringify(config, null, 2);
    if (serialized.length > MAX_CONFIG_BYTES) {
      res.status(413).json({ error: `config exceeds ${MAX_CONFIG_BYTES} bytes.` });
      return;
    }
    try {
      // Best-effort: ensure containing dir exists. If the user pointed
      // at a non-existent path tree we create it.
      const dir = dirname(LOCAL_CONFIG_PATH);
      await mkdir(dir, { recursive: true });
      // mtime guard: caller can pass `{ ifMatchMtime: <ms> }` to refuse
      // the write when the file changed externally.
      const guard = (req.body as { ifMatchMtime?: unknown }).ifMatchMtime;
      if (typeof guard === "number" && guard > 0) {
        try {
          const s = await stat(LOCAL_CONFIG_PATH);
          if (Math.floor(s.mtimeMs) !== Math.floor(guard)) {
            res.status(409).json({
              error: "Config file changed on disk. Reload before saving.",
              currentMtime: Math.floor(s.mtimeMs),
            });
            return;
          }
        } catch {
          // If stat fails (e.g. file missing), allow the write — caller
          // is creating from scratch.
        }
      }
      await writeFile(LOCAL_CONFIG_PATH, `${serialized}\n`, "utf8");
      const s = await stat(LOCAL_CONFIG_PATH);
      res.json({ ok: true, path: LOCAL_CONFIG_PATH, mtime: Math.floor(s.mtimeMs) });
    } catch (err) {
      const e = err as Error;
      res.status(500).json({ error: `Write failed: ${e.message}` });
    }
  })();
});
