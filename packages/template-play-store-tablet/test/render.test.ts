import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import template from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..");
const SAMPLES_DIR = resolve(PACKAGE_ROOT, "samples");

// Use the iPad raws (closer aspect to a portrait tablet than the iPhone).
const FIXTURES = {
  dark: resolve(
    homedir(),
    "projects/personal/budgetbug/fastlane/metadata/en-US/screenshots/raw/01-dashboard-ipad-13-dark.png",
  ),
  light: resolve(
    homedir(),
    "projects/personal/budgetbug/fastlane/metadata/en-US/screenshots/raw/01-dashboard-ipad-13-light.png",
  ),
} as const;

const CAPTION = "More room to think";
const SUBTITLE = "Side-by-side cashflow on the tablet you already use";

async function renderSample(theme: "dark" | "light"): Promise<string> {
  await mkdir(SAMPLES_DIR, { recursive: true });
  const out = resolve(SAMPLES_DIR, `dashboard-${theme}.png`);
  const params = new URLSearchParams();
  params.set("caption", CAPTION);
  params.set("subtitle", SUBTITLE);
  params.set("theme", theme);
  params.set("imageUrl", pathToFileURL(FIXTURES[theme]).href);
  const url = `${pathToFileURL(template.wrapperHtmlPath).href}?${params.toString()}`;

  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      viewport: { width: template.output.width, height: template.output.height },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.body.dataset.rendered === "true", undefined, {
      timeout: 15_000,
    });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out, type: "png", fullPage: false });
  } finally {
    await browser.close();
  }
  return out;
}

const hasFixtures = existsSync(FIXTURES.dark) && existsSync(FIXTURES.light);

describe("@shotcraft/template-play-store-tablet snapshot", () => {
  it("exports a valid ShotcraftTemplate", () => {
    expect(template.id).toBe("play-store-tablet");
    expect(template.output).toEqual({ width: 1920, height: 1200 });
    expect(template.themes).toContain("dark");
    expect(template.themes).toContain("light");
    expect(existsSync(template.wrapperHtmlPath)).toBe(true);
  });

  it.skipIf(!hasFixtures)(
    "renders a 1920×1200 dark composite",
    async () => {
      const out = await renderSample("dark");
      const buf = readFileSync(out);
      expect(buf.readUInt32BE(16)).toBe(1920);
      expect(buf.readUInt32BE(20)).toBe(1200);
    },
    90_000,
  );

  it.skipIf(!hasFixtures)(
    "renders a 1920×1200 light composite",
    async () => {
      const out = await renderSample("light");
      const buf = readFileSync(out);
      expect(buf.readUInt32BE(16)).toBe(1920);
      expect(buf.readUInt32BE(20)).toBe(1200);
    },
    90_000,
  );
});
