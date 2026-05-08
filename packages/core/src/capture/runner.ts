import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import type { SetupFn, ShotcraftConfig, Theme } from "../config/types.js";
import { deriveCaptureSpecs, type CaptureSpec, type ResolvedViewport } from "./spec.js";

export interface CaptureRunOptions {
  /** Directory to resolve relative `outputDir` paths against. Default: `process.cwd()`. */
  cwd?: string;
  /** Override the config's `outputDir`. */
  outputDir?: string;
  /** Override the config's `rawSubdir`. */
  rawSubdir?: string;
  /** Run Chromium with a head — useful for local debugging. Default: false. */
  headed?: boolean;
  /**
   * Per-line progress logger. Receives status messages like
   * `"[capture] dashboard (default, dark) → /abs/path.png"`. Default: console.log.
   * Pass `() => {}` to silence.
   */
  onLog?: (msg: string) => void;
}

export interface CaptureResult {
  /** Number of PNGs successfully written. */
  written: number;
  /** Absolute path of the raw output directory. */
  rawDir: string;
  /** All capture specs that were run (regardless of pass/fail). */
  specs: ReadonlyArray<CaptureSpec>;
}

const DEFAULT_OUTPUT_DIR = "./screenshots";
const DEFAULT_RAW_SUBDIR = "raw";

/**
 * Run the capture phase: launches Chromium, runs the user's setup hook for
 * each viewport profile, then captures every spec to disk.
 *
 * Generalized from BudgetBug's `captureAppStoreScreenshots.ts`. The two
 * BudgetBug-specific concerns — login and theme switching — are now
 * user-supplied hooks (`setup`, `applyTheme`).
 */
export async function runCapture(
  config: ShotcraftConfig,
  options: CaptureRunOptions = {},
): Promise<CaptureResult> {
  const cwd = options.cwd ?? process.cwd();
  const log = options.onLog ?? defaultLog;

  const outputDir = absolutize(options.outputDir ?? config.outputDir ?? DEFAULT_OUTPUT_DIR, cwd);
  const rawSubdir = options.rawSubdir ?? config.rawSubdir ?? DEFAULT_RAW_SUBDIR;
  const rawDir = resolve(outputDir, rawSubdir);

  const specs = deriveCaptureSpecs(config, rawDir);
  await mkdir(rawDir, { recursive: true });

  const totalScreens = config.screens.length;
  log(
    `[capture] target=${config.target} screens=${totalScreens} captures=${specs.length} → ${rawDir}`,
  );

  const browser = await chromium.launch({ headless: !options.headed });
  try {
    const written = await captureAll(browser, config, specs, log);
    log(`[capture] done — ${written}/${specs.length} PNGs written`);
    return { written, rawDir, specs };
  } finally {
    await browser.close();
  }
}

async function captureAll(
  browser: Browser,
  config: ShotcraftConfig,
  specs: ReadonlyArray<CaptureSpec>,
  log: (msg: string) => void,
): Promise<number> {
  // Group specs by (viewport.id, theme) so each context is reused across all
  // screens that share its profile. Setup hook only runs once per context.
  const groups = groupSpecs(specs);
  let written = 0;

  for (const [, group] of groups) {
    const { viewport, theme, items } = group;
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.dpr,
      isMobile: viewport.isMobile,
      hasTouch: viewport.isMobile,
      ...(viewport.userAgent !== undefined ? { userAgent: viewport.userAgent } : {}),
      colorScheme: theme,
      locale: config.locale ?? "en-US",
      timezoneId: config.timezoneId ?? "America/New_York",
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    try {
      if (config.setup) {
        await runSetup(page, config.setup, config.target);
      }
      if (config.applyTheme) {
        await config.applyTheme(page, theme);
      }
      for (const spec of items) {
        await captureOne(page, config, spec, log);
        written++;
      }
    } finally {
      await context.close();
    }
  }
  return written;
}

interface CaptureGroup {
  viewport: ResolvedViewport;
  theme: Theme;
  items: CaptureSpec[];
}

function groupSpecs(specs: ReadonlyArray<CaptureSpec>): Map<string, CaptureGroup> {
  const groups = new Map<string, CaptureGroup>();
  for (const spec of specs) {
    const key = `${spec.viewport.id}::${spec.theme}`;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(spec);
    } else {
      groups.set(key, { viewport: spec.viewport, theme: spec.theme, items: [spec] });
    }
  }
  return groups;
}

async function runSetup(page: Page, setup: SetupFn, target: string): Promise<void> {
  // The setup hook commonly runs `page.goto(target)` itself; if it doesn't, we
  // navigate to the target's origin first so any localStorage / cookie writes
  // land on the right origin.
  const originUrl = new URL(target);
  await page.goto(originUrl.origin, { waitUntil: "domcontentloaded" });
  await setup(page);
}

async function captureOne(
  page: Page,
  config: ShotcraftConfig,
  spec: CaptureSpec,
  log: (msg: string) => void,
): Promise<void> {
  const url = joinUrl(config.target, spec.screen.route);
  await page.goto(url, { waitUntil: "networkidle" });

  // Re-apply theme post-navigation for SPAs that re-init context.
  if (config.applyTheme) {
    await config.applyTheme(page, spec.theme);
  }

  if (spec.screen.waitForSelector) {
    await page.waitForSelector(spec.screen.waitForSelector, { timeout: 15_000 });
  }
  await page.waitForTimeout(spec.screen.waitMs ?? 1500);

  await mkdir(dirname(spec.outputPath), { recursive: true });
  await page.screenshot({ path: spec.outputPath, fullPage: false });
  log(
    `[capture]   ✓ ${spec.screen.name} (${spec.viewport.id}, ${spec.theme}) → ${spec.outputPath}`,
  );
}

function joinUrl(base: string, route: string): string {
  if (/^https?:\/\//i.test(route)) return route;
  const baseTrimmed = base.replace(/\/$/, "");
  const routeTrimmed = route.startsWith("/") ? route : `/${route}`;
  return `${baseTrimmed}${routeTrimmed}`;
}

function absolutize(p: string, cwd: string): string {
  return isAbsolute(p) ? p : resolve(cwd, p);
}

function defaultLog(msg: string): void {
  console.log(msg);
}
