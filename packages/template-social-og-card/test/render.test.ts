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

const FIXTURE = resolve(
  homedir(),
  "projects/personal/budgetbug/fastlane/metadata/en-US/screenshots/raw/01-dashboard-iphone-6.5-dark.png",
);

const CAPTION = "Capture your live app, ship every screenshot you need";
const SUBTITLE = "Open-source CLI by miopea";

async function renderSample(): Promise<string> {
  await mkdir(SAMPLES_DIR, { recursive: true });
  const out = resolve(SAMPLES_DIR, "card-dark.png");
  const params = new URLSearchParams();
  params.set("caption", CAPTION);
  params.set("subtitle", SUBTITLE);
  params.set("theme", "dark");
  params.set("imageUrl", pathToFileURL(FIXTURE).href);
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

const hasFixture = existsSync(FIXTURE);

describe("@shotcraft/template-social-og-card snapshot", () => {
  it("exports a valid ShotcraftTemplate", () => {
    expect(template.id).toBe("social-og-card");
    expect(template.output).toEqual({ width: 1200, height: 630 });
    expect(template.themes).toEqual(["dark"]);
    expect(existsSync(template.wrapperHtmlPath)).toBe(true);
  });

  it.skipIf(!hasFixture)(
    "renders a 1200×630 dark composite",
    async () => {
      const out = await renderSample();
      const buf = readFileSync(out);
      expect(buf.readUInt32BE(16)).toBe(1200);
      expect(buf.readUInt32BE(20)).toBe(630);
    },
    90_000,
  );
});
