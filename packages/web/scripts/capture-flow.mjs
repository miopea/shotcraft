/**
 * Capture the Shotcraft end-to-end flow as (a) a recorded .webm video and
 * (b) a sequence of clean PNG frames + a labeled filmstrip montage — the
 * README-embeddable "sequence" form, produced without any system video
 * tooling. A true GIF/MP4 just needs a full ffmpeg run on flow.webm.
 *
 * Prereq: web server running with live endpoints (see capture-marketing.mjs).
 * Outputs (assets/producthunt/):
 *   flow.webm                 — recorded product-tour video
 *   flow-frames/step-N.png    — the four-step sequence
 *   flow-filmstrip.png        — single labeled montage of the four steps
 */

import { chromium } from "playwright";
import { mkdir, readdir, rename, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const PH = resolve(REPO_ROOT, "assets", "producthunt");
const FRAMES = resolve(PH, "flow-frames");
const TMP = resolve(REPO_ROOT, "assets", ".video-tmp");
const BASE = process.env.SHOTCRAFT_BASE_URL ?? "http://localhost:3002";
const log = (m) => process.stdout.write(`[flow] ${m}\n`);
const pause = (page, ms) => page.waitForTimeout(ms);

const STEPS = [
  { n: 1, label: "1 · Build the config", file: "step-1.png" },
  { n: 2, label: "2 · Point at your live app", file: "step-2.png" },
  { n: 3, label: "3 · Capture + render", file: "step-3.png" },
  { n: 4, label: "4 · Ship the composite", file: "step-4.png" },
];

async function main() {
  await mkdir(FRAMES, { recursive: true });
  await mkdir(TMP, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
    recordVideo: { dir: TMP, size: { width: 1280, height: 720 } },
  });
  const page = await ctx.newPage();
  const shot = (file) => page.screenshot({ path: resolve(FRAMES, file) });

  // Step 1 — config builder
  await page.goto(`${BASE}/builder`, { waitUntil: "networkidle" });
  await pause(page, 1600);
  await shot("step-1.png");

  // Step 2 — demo form pointed at a live app
  await page.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
  await page.waitForSelector("#demo-url", { timeout: 15000 });
  await page.fill("#demo-url", BASE);
  await page.selectOption("#demo-template", "desktop-hero").catch(() => {});
  await page.fill("#demo-caption", "Capture your live app");
  await pause(page, 1000);
  await shot("step-2.png");

  // Step 3 — rendering
  await page.click('form button[type="submit"]');
  log("render submitted…");
  await pause(page, 1200);
  await shot("step-3.png");

  // Step 4 — composite result
  await page.waitForSelector("img.demo-result", { timeout: 60000 }).catch((e) => log(`no result: ${e.message}`));
  await pause(page, 2000);
  await shot("step-4.png");

  await ctx.close(); // flush video
  await browser.close();

  // Stable-name the webm
  const vids = (await readdir(TMP)).filter((f) => f.endsWith(".webm"));
  if (vids.length) {
    await rename(resolve(TMP, vids[0]), resolve(PH, "flow.webm"));
    log("flow.webm");
  }

  // Build the labeled filmstrip from the four step frames
  await buildFilmstrip();
  log("done");
}

async function buildFilmstrip() {
  const panels = await Promise.all(
    STEPS.map(async (s) => {
      const data = await readFile(resolve(FRAMES, s.file));
      const uri = `data:image/png;base64,${data.toString("base64")}`;
      return `<figure><img src="${uri}"/><figcaption>${s.label}</figcaption></figure>`;
    }),
  );
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;box-sizing:border-box}
    body{width:1600px;background:radial-gradient(120% 120% at 50% 0%,#0b3b2e 0%,#020617 60%);
      font-family:Inter,system-ui,sans-serif;color:#e2e8f0;padding:40px}
    h1{font-size:34px;font-weight:800;letter-spacing:-.02em;margin-bottom:6px}
    h1 span{color:#34d399}
    p.sub{color:#94a3b8;font-size:18px;margin-bottom:28px}
    .row{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
    figure{background:rgba(15,23,42,.55);border:1px solid rgba(148,163,184,.15);border-radius:14px;
      padding:10px;box-shadow:0 18px 44px rgba(0,0,0,.4)}
    figure img{width:100%;border-radius:8px;display:block}
    figcaption{margin-top:10px;font-size:15px;font-weight:600;color:#cbd5e1;text-align:center}
  </style></head><body>
    <h1>From your live app to <span>shippable images</span></h1>
    <p class="sub">No manual screenshots — Shotcraft drives your running app and composites every store image.</p>
    <div class="row">${panels.join("")}</div>
  </body></html>`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const el = await page.$("body");
  await el.screenshot({ path: resolve(PH, "flow-filmstrip.png") });
  await browser.close();
  log("flow-filmstrip.png");
}

main().catch((err) => {
  process.stderr.write(`${err?.stack ?? err}\n`);
  process.exit(1);
});
