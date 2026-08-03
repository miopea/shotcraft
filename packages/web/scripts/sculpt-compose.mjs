/**
 * Sculpt Studio store-screenshot compositor.
 * Captioned marketing composite: raw app screenshot on a branded (cream +
 * plum) background with a serif headline + sans subtitle, at exact store
 * pixel sizes. Apple = fully-visible (contain); Google Play = fuller crop
 * (cover, top-anchored) onto a Play-legal canvas.
 *
 * Run from a dir where `playwright` resolves (packages/web).
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const PKG = "/home/bschleifer/sculpt-store-package";
const SHOTS = `${PKG}/screenshots`;
const OUT = `${PKG}/store`;
const FONTS = "/tmp/sculpt-fonts";

const serifB64 = readFileSync(`${FONTS}/serif.ttf`).toString("base64");
const sansB64 = readFileSync(`${FONTS}/sans.ttf`).toString("base64");

// Marketing order + captions (approved).
const SCREENS = [
  { key: "today", file: "01-today", headline: "Your day, composed", subtitle: "Training and recovery, planned for today." },
  { key: "readiness", file: "02-readiness", headline: "Train with your body", subtitle: "A readiness score from your sleep, HRV, and heart rate." },
  { key: "this-week", file: "04-this-week", headline: "A week that flexes", subtitle: "A plan that adapts to energy, weather, and real life." },
  { key: "runner-hold", file: "07-runner-hold", headline: "Guided, cue by cue", subtitle: "Timers, form cues, and RPE, right in the moment." },
  { key: "progress", file: "06-progress", headline: "See the patterns", subtitle: "Trends across strength, cardio, and recovery." },
  { key: "fitness-age", file: "03-fitness-age", headline: "Lower your fitness age", subtitle: "A VO₂max estimate you can actually move." },
  { key: "restrictions", file: "05-restrictions", headline: "Strength, with intention", subtitle: "Set a direction — and the movements to skip." },
];

const TARGETS = [
  { out: "apple/iphone-6.9", srcDir: "iphone-6.9-1320x2868", w: 1320, h: 2868, fit: "contain" },
  { out: "apple/iphone-6.5", srcDir: "iphone-6.5-1242x2688", w: 1242, h: 2688, fit: "contain" },
  { out: "apple/ipad-13", srcDir: "ipad-13-2048x2732", w: 2048, h: 2732, fit: "contain", exclude: ["runner-hold"] },
  { out: "google/phone", srcDir: "iphone-6.9-1320x2868", w: 1290, h: 2292, fit: "cover" },
  // iPad raws (1.33:1) are within Google Play's 2:1 tablet limit. Play requires BOTH the
  // 7" and 10" tablet slots — the same image set is valid for each, so emit both folders.
  { out: "google/tablet-7in", srcDir: "ipad-13-2048x2732", w: 2048, h: 2732, fit: "contain", exclude: ["runner-hold"] },
  { out: "google/tablet-10in", srcDir: "ipad-13-2048x2732", w: 2048, h: 2732, fit: "contain", exclude: ["runner-hold"] },
];

function html({ w, h, rawB64, headline, subtitle, fit }) {
  const pad = Math.round(w * 0.075);
  const hHead = Math.round(w * (fit === "cover" ? 0.072 : 0.078));
  const hSub = Math.round(w * (fit === "cover" ? 0.034 : 0.037));
  const radius = Math.round(w * 0.035);
  const shotCss =
    fit === "cover"
      ? `width:84%;height:100%;object-fit:cover;object-position:top center`
      : `max-width:80%;max-height:100%;object-fit:contain`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face{font-family:'SerifV';src:url(data:font/ttf;base64,${serifB64}) format('truetype');}
    @font-face{font-family:'SansV';src:url(data:font/ttf;base64,${sansB64}) format('truetype');}
    *{margin:0;box-sizing:border-box}
    body{width:${w}px;height:${h}px;display:flex;flex-direction:column;overflow:hidden;
      background:
        radial-gradient(120% 55% at 50% 0%, rgba(142,58,84,.10) 0%, rgba(142,58,84,0) 60%),
        linear-gradient(180deg,#F6F1EB 0%,#EFE6DC 100%);
      padding:${Math.round(h * 0.05)}px ${pad}px ${Math.round(h * 0.045)}px;}
    .caption{text-align:center;flex:0 0 auto}
    .headline{font-family:'SerifV',serif;font-weight:560;font-size:${hHead}px;line-height:1.04;
      letter-spacing:-0.01em;color:#2B2126}
    .subtitle{font-family:'SansV',system-ui,sans-serif;font-weight:450;font-size:${hSub}px;
      line-height:1.3;color:#6E6259;margin-top:${Math.round(w * 0.028)}px;
      max-width:88%;margin-left:auto;margin-right:auto}
    .shotwrap{flex:1 1 auto;display:flex;align-items:center;justify-content:center;
      padding-top:${Math.round(h * 0.035)}px;min-height:0}
    .shot{${shotCss};border-radius:${radius}px;
      box-shadow:0 ${Math.round(h * 0.012)}px ${Math.round(h * 0.03)}px rgba(60,22,38,.26);
      border:1px solid rgba(142,58,84,.14)}
  </style></head><body>
    <div class="caption">
      <div class="headline">${headline}</div>
      <div class="subtitle">${subtitle}</div>
    </div>
    <div class="shotwrap"><img class="shot" src="data:image/png;base64,${rawB64}"/></div>
  </body></html>`;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  let total = 0;
  for (const t of TARGETS) {
    const dir = `${OUT}/${t.out}`;
    mkdirSync(dir, { recursive: true });
    const screens = SCREENS.filter((s) => !(t.exclude || []).includes(s.key));
    let idx = 0;
    for (const s of screens) {
      idx++;
      const rawB64 = readFileSync(`${SHOTS}/${t.srcDir}/${s.file}.png`).toString("base64");
      await page.setViewportSize({ width: t.w, height: t.h });
      await page.setContent(html({ w: t.w, h: t.h, rawB64, headline: s.headline, subtitle: s.subtitle, fit: t.fit }), { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(120);
      const name = `${String(idx).padStart(2, "0")}-${s.key}.png`;
      await page.screenshot({ path: `${dir}/${name}` });
      total++;
    }
    process.stdout.write(`[compose] ${t.out}: ${screens.length} → ${dir}\n`);
  }
  await browser.close();
  process.stdout.write(`[compose] done — ${total} composites\n`);
}
main().catch((e) => { process.stderr.write(`${e.stack}\n`); process.exit(1); });
