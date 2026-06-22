/**
 * Capture marketing screenshots of the Shotcraft companion site for the
 * GitHub README and the ProductHunt listing.
 *
 * Prereq: the web server must be running with live endpoints enabled, e.g.
 *   SHOTCRAFT_LIVE_DEMO=1 SHOTCRAFT_ALLOW_LOCAL=1 NODE_ENV=production \
 *     PORT=3002 node server/dist/index.js
 *
 * Outputs (repo root):
 *   assets/screenshots/web-*.png      — UI shots for README/docs (dpr 2)
 *   assets/producthunt/gallery-*.png  — 1270×760 PH gallery images (dpr 2)
 *   assets/producthunt/output-*.png   — real composites the tool produces
 *   assets/producthunt/thumbnail.png  — 240×240 PH thumbnail
 */

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const SHOTS = resolve(REPO_ROOT, "assets", "screenshots");
const PH = resolve(REPO_ROOT, "assets", "producthunt");
const BASE = process.env.SHOTCRAFT_BASE_URL ?? "http://localhost:3002";

const log = (m) => process.stdout.write(`[capture] ${m}\n`);

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(500);
}

/** Navigate, wait, and screenshot the viewport (and optionally full page). */
async function capturePage(browser, { route, name, full = false, waitFor }) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 15000 }).catch(() => {});
  await settle(page);
  await page.screenshot({ path: resolve(SHOTS, `web-${name}.png`) });
  if (full) await page.screenshot({ path: resolve(SHOTS, `web-${name}-full.png`), fullPage: true });
  log(`web-${name}.png`);
  await ctx.close();
}

/** PH gallery image at 1270×760 (dpr 2 → crisp 2540×1520). */
async function capturePhGallery(browser, { route, name, waitFor, action }) {
  const ctx = await browser.newContext({ viewport: { width: 1270, height: 760 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 15000 }).catch(() => {});
  if (action) await action(page).catch((e) => log(`  (action skipped: ${e.message})`));
  await settle(page);
  await page.screenshot({ path: resolve(PH, `gallery-${name}.png`) });
  log(`gallery-${name}.png`);
  await ctx.close();
}

/** Call the live render-demo API to produce a real composite the tool makes. */
async function captureComposite({ templateId, caption, subtitle, theme = "dark", name }) {
  const res = await fetch(`${BASE}/api/render-demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: BASE, caption, subtitle, templateId, theme }),
  });
  if (!res.ok) {
    const txt = await res.text();
    log(`  render-demo ${templateId} FAILED ${res.status}: ${txt.slice(0, 160)}`);
    return false;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(resolve(PH, `output-${name}.png`), buf);
  log(`output-${name}.png (${(buf.length / 1024).toFixed(0)} KB)`);
  return true;
}

/** Grid montage of the committed template samples, screenshotted at 1270×760. */
async function captureMontage(browser) {
  const ids = [
    "app-store-iphone/dashboard-dark.png",
    "app-store-ipad/dashboard-dark.png",
    "play-store-phone/dashboard-dark.png",
    "readme-hero/hero-dark.png",
    "desktop-hero/hero-dark.png",
    "social-og-card/card-dark.png",
  ];
  const tiles = ids
    .map((p) => `<div class="tile"><img src="${BASE}/samples/${p}"/></div>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;box-sizing:border-box}
    body{width:1270px;height:760px;background:radial-gradient(120% 120% at 50% 0%,#0b3b2e 0%,#020617 60%);
      font-family:Inter,system-ui,sans-serif;color:#e2e8f0;padding:48px 56px;overflow:hidden}
    h1{font-size:38px;font-weight:800;letter-spacing:-.02em}
    h1 span{color:#34d399}
    p{margin-top:8px;color:#94a3b8;font-size:18px;margin-bottom:28px}
    .grid{display:flex;gap:22px;align-items:flex-end;justify-content:center;height:560px}
    .tile{background:rgba(15,23,42,.6);border:1px solid rgba(148,163,184,.15);border-radius:14px;
      padding:12px;box-shadow:0 24px 60px rgba(0,0,0,.45)}
    .tile img{max-height:520px;max-width:200px;border-radius:8px;display:block;object-fit:contain}
  </style></head><body>
    <h1>One config. <span>Every store image.</span></h1>
    <p>App Store · Play Store · README hero · OG card · desktop hero — all from your live app.</p>
    <div class="grid">${tiles}</div>
  </body></html>`;
  const ctx = await browser.newContext({ viewport: { width: 1270, height: 760 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: resolve(PH, `gallery-outputs.png`) });
  log("gallery-outputs.png");
  await ctx.close();
}

/** 240×240 branded thumbnail. */
async function captureThumbnail(browser) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;box-sizing:border-box}
    body{width:240px;height:240px;display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:14px;background:radial-gradient(120% 120% at 50% 0%,#10b981 0%,#064e3b 55%,#022c22 100%);
      font-family:Inter,system-ui,sans-serif}
    .mark{width:96px;height:72px;border-radius:14px;border:4px solid rgba(255,255,255,.95);position:relative;
      box-shadow:0 10px 30px rgba(0,0,0,.35)}
    .mark::before{content:"";position:absolute;top:-12px;left:50%;transform:translateX(-50%);
      width:30px;height:14px;border-radius:6px 6px 0 0;border:4px solid rgba(255,255,255,.95);border-bottom:none}
    .mark::after{content:"";position:absolute;inset:18px;border-radius:50%;border:4px solid rgba(255,255,255,.95)}
    .name{color:#fff;font-weight:800;font-size:26px;letter-spacing:-.02em}
  </style></head><body>
    <div class="mark"></div><div class="name">Shotcraft</div>
  </body></html>`;
  const ctx = await browser.newContext({ viewport: { width: 240, height: 240 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(PH, "thumbnail.png") });
  log("thumbnail.png");
  await ctx.close();
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  await mkdir(PH, { recursive: true });
  const browser = await chromium.launch();

  // 1) README/docs UI shots
  await capturePage(browser, { route: "/", name: "home", full: true });
  await capturePage(browser, { route: "/templates", name: "templates", full: true, waitFor: ".gallery-card" });
  await capturePage(browser, { route: "/builder", name: "builder", full: true });
  await capturePage(browser, { route: "/crawler", name: "crawler", full: true });

  // Demo page — drive a real render so the result preview shows
  await capturePage(browser, {
    route: "/demo",
    name: "demo",
    waitFor: "#demo-url",
  });

  // 2) Real composites (the money shots) via the live API
  await captureComposite({ templateId: "desktop-hero", caption: "Capture your live app", name: "desktop-hero" });
  await captureComposite({ templateId: "app-store-iphone", caption: "Every screen, every store", name: "app-store-iphone" });
  await captureComposite({ templateId: "readme-hero", caption: "Ship a README hero in one command", name: "readme-hero" });

  // 3) PH gallery images
  await capturePhGallery(browser, { route: "/", name: "01-home" });
  await capturePhGallery(browser, { route: "/templates", name: "02-templates", waitFor: ".gallery-card" });
  await capturePhGallery(browser, { route: "/builder", name: "03-builder" });
  await capturePhGallery(browser, { route: "/crawler", name: "04-crawler" });
  await captureMontage(browser);
  await captureThumbnail(browser);

  await browser.close();
  log("done");
}

main().catch((err) => {
  process.stderr.write(`${err?.stack ?? err}\n`);
  process.exit(1);
});
