import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import template from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..");
const SAMPLES_DIR = resolve(PACKAGE_ROOT, "samples");
// Committed BudgetBug demo-account captures, shared by every template's
// render test so the tests run in CI rather than only on a machine that has
// BudgetBug checked out. See fixtures/budgetbug/README.md.
const FIXTURES_DIR = resolve(HERE, "../../../fixtures/budgetbug");

const BUDGETBUG_RAWS = {
  dark: resolve(FIXTURES_DIR, "01-dashboard-iphone-6.5-dark.png"),
  light: resolve(FIXTURES_DIR, "01-dashboard-iphone-6.5-light.png"),
} as const;

const CAPTION = "Know your budget at a glance";

async function renderSample(theme: "dark" | "light"): Promise<string> {
  const raw = BUDGETBUG_RAWS[theme];
  await mkdir(SAMPLES_DIR, { recursive: true });
  const outPath = resolve(SAMPLES_DIR, `dashboard-${theme}.png`);

  const params = new URLSearchParams();
  params.set("caption", CAPTION);
  params.set("theme", theme);
  params.set("imageUrl", pathToFileURL(raw).href);
  const url = `${pathToFileURL(template.wrapperHtmlPath).href}?${params.toString()}`;

  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      viewport: {
        width: template.output.width,
        height: template.output.height,
      },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.body.dataset.rendered === "true", undefined, {
      timeout: 15_000,
    });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: outPath, type: "png", fullPage: false });
  } finally {
    await browser.close();
  }
  return outPath;
}

describe("@shotcraft/template-app-store-iphone snapshot", () => {
  it("exports a valid ShotcraftTemplate", () => {
    expect(template.id).toBe("app-store-iphone");
    expect(template.output).toEqual({ width: 1284, height: 2778 });
    expect(template.themes).toContain("dark");
    expect(template.themes).toContain("light");
    expect(existsSync(template.wrapperHtmlPath)).toBe(true);
  });

  it("renders a 1284×2778 dark composite from a BudgetBug capture", async () => {
    const out = await renderSample("dark");
    const buf = readFileSync(out);
    expect(buf.readUInt32BE(16)).toBe(1284);
    expect(buf.readUInt32BE(20)).toBe(2778);
  }, 90_000);

  it("renders a 1284×2778 light composite from a BudgetBug capture", async () => {
    const out = await renderSample("light");
    const buf = readFileSync(out);
    expect(buf.readUInt32BE(16)).toBe(1284);
    expect(buf.readUInt32BE(20)).toBe(2778);
  }, 90_000);
});
