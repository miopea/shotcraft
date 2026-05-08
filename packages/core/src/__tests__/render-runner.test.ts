import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runRender } from "../render/runner.js";
import type { LoadedTemplate } from "../template/load.js";
import type { ShotcraftConfig } from "../config/types.js";

// 1x1 transparent PNG — small enough to embed, valid enough for Chromium
// to load via <img src=...>. The render runner only cares that the file
// is readable; the wrapper scales it to fit.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==";

const FIXTURE_WRAPPER_HTML = `<!doctype html>
<html><head><meta charset="utf-8"></head>
<body data-theme="dark">
  <h1 id="caption" style="font: 24px sans-serif; margin: 0; padding: 12px; color: #f1f5f9;"></h1>
  <img id="screen" style="display:block; width:100%; height:80%; object-fit:cover;" alt="" />
  <script>
    const params = new URLSearchParams(location.search);
    document.body.dataset.theme = params.get("theme") || "dark";
    document.getElementById("caption").textContent = params.get("caption") || "";
    document.body.style.background = document.body.dataset.theme === "dark" ? "#0f172a" : "#f8fafc";
    const img = document.getElementById("screen");
    const finish = (state) => { document.body.dataset.rendered = state; };
    img.addEventListener("load", () => finish("true"));
    img.addEventListener("error", () => finish("error"));
    img.src = params.get("imageUrl") || "";
  </script>
</body></html>`;

function makeFixtureTemplate(wrapperPath: string): LoadedTemplate {
  return {
    template: {
      id: "fixture",
      viewport: { width: 100, height: 200, dpr: 1 },
      output: { width: 200, height: 400 },
      themes: ["dark", "light"],
      wrapperHtmlPath: wrapperPath,
      isMobile: false,
    },
    themes: ["dark", "light"],
    options: {},
    source: "fixture",
  };
}

const baseConfig: ShotcraftConfig = {
  target: "http://localhost:0",
  screens: [{ route: "/", name: "home", caption: "Hi", waitMs: 0 }],
};

const NOOP_LOG = () => {};

describe("runRender (integration)", () => {
  let dir: string;
  let wrapperPath: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "shotcraft-render-"));
    wrapperPath = join(dir, "wrapper.html");
    await writeFile(wrapperPath, FIXTURE_WRAPPER_HTML);
  }, 30_000);

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes composites at the template's output dimensions", async () => {
    const rawDir = join(dir, "screenshots", "raw");
    await mkdir(rawDir, { recursive: true });
    const rawPath = join(rawDir, "home-fixture-dark.png");
    await writeFile(rawPath, Buffer.from(TINY_PNG_BASE64, "base64"));

    const result = await runRender(baseConfig, {
      cwd: dir,
      outputDir: join(dir, "screenshots"),
      rawSubdir: "raw",
      templates: [makeFixtureTemplate(wrapperPath)],
      templateFilter: "fixture",
      onLog: NOOP_LOG,
    });

    expect(result.written).toBe(1);
    expect(result.skipped).toBe(1); // light raw missing — skipped
    const outPath = join(dir, "screenshots", "fixture", "home-dark.png");
    expect(existsSync(outPath)).toBe(true);

    // PNG IHDR sits at byte offset 16 (8-byte signature + 4 length + 4 type).
    // Width = bytes 16..19, height = bytes 20..23 (big-endian).
    const buf = readFileSync(outPath);
    expect(buf.readUInt32BE(16)).toBe(200);
    expect(buf.readUInt32BE(20)).toBe(400);
  }, 60_000);

  it("throws when templateFilter doesn't match any loaded template", async () => {
    await expect(
      runRender(baseConfig, {
        cwd: dir,
        outputDir: join(dir, "screenshots"),
        templates: [makeFixtureTemplate(wrapperPath)],
        templateFilter: "does-not-exist",
        onLog: NOOP_LOG,
      }),
    ).rejects.toThrow(/no template matches/i);
  }, 30_000);

  it("no-ops cleanly when there are no templates configured", async () => {
    const result = await runRender(baseConfig, {
      cwd: dir,
      outputDir: join(dir, "screenshots-empty"),
      onLog: NOOP_LOG,
    });
    expect(result.written).toBe(0);
    expect(result.outcomes).toHaveLength(0);
  });
});
