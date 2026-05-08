import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, type Browser } from "playwright";
import type { ScreenDef, ShotcraftConfig, Theme } from "../config/types.js";
import { loadTemplates, type LoadedTemplate } from "../template/load.js";
import type { ShotcraftTemplate } from "../template/types.js";

export interface RenderRunOptions {
  /** Directory to resolve relative `outputDir` paths against. Default: `process.cwd()`. */
  cwd?: string;
  /** Override the config's `outputDir`. */
  outputDir?: string;
  /** Override the config's `rawSubdir`. */
  rawSubdir?: string;
  /** Render only the template whose id matches. */
  templateFilter?: string;
  /**
   * Pre-loaded templates. If omitted and `config.templates` is non-empty,
   * `loadTemplates` runs internally. Pass this when capture + render share
   * the same load pass.
   */
  templates?: ReadonlyArray<LoadedTemplate>;
  /** Run Chromium with a head — useful for visually inspecting wrappers. */
  headed?: boolean;
  /** Per-line progress logger. Default: console.log; pass `() => {}` to silence. */
  onLog?: (msg: string) => void;
}

export interface CompositeSpec {
  template: ShotcraftTemplate;
  templateOptions: Record<string, unknown>;
  screen: ScreenDef;
  theme: Theme;
  /** Absolute path to the raw capture this composite consumes. */
  rawPath: string;
  /** Absolute path the composite is written to. */
  outputPath: string;
}

export interface CompositeOutcome {
  spec: CompositeSpec;
  /** True when the raw capture was missing and the composite was skipped. */
  skipped: boolean;
  /** Error from a render failure, if any. */
  error?: Error;
}

export interface RenderResult {
  /** Number of composites successfully written. */
  written: number;
  /** Number of (template × screen × theme) combos skipped because raw was missing. */
  skipped: number;
  /** Absolute output directory root. */
  outputDir: string;
  /** Per-combo outcome — success, skip, or error. */
  outcomes: ReadonlyArray<CompositeOutcome>;
}

const DEFAULT_OUTPUT_DIR = "./screenshots";
const DEFAULT_RAW_SUBDIR = "raw";

/**
 * Run the render phase. For each (template × theme × screen) where a raw
 * capture exists, opens the template's wrapper.html in Playwright, injects
 * URL params (`caption`, `subtitle`, `imageUrl`, `theme`), waits for the
 * wrapper to signal it's ready (`document.body.dataset.rendered === "true"`)
 * and for fonts to settle, then screenshots at the template's `output`
 * dimensions.
 *
 * Skips combinations whose raw capture is missing — the user might be
 * re-rendering only a subset of screens.
 */
export async function runRender(
  config: ShotcraftConfig,
  options: RenderRunOptions = {},
): Promise<RenderResult> {
  const cwd = options.cwd ?? process.cwd();
  const log = options.onLog ?? defaultLog;

  const outputDir = absolutize(options.outputDir ?? config.outputDir ?? DEFAULT_OUTPUT_DIR, cwd);
  const rawSubdir = options.rawSubdir ?? config.rawSubdir ?? DEFAULT_RAW_SUBDIR;
  const rawDir = resolve(outputDir, rawSubdir);

  const templates = await ensureTemplates(config, options, cwd);
  if (templates.length === 0) {
    log("[render] no templates configured; nothing to render.");
    return { written: 0, skipped: 0, outputDir, outcomes: [] };
  }
  const filtered = applyTemplateFilter(templates, options.templateFilter);

  const specs = buildCompositeSpecs(config, rawDir, outputDir, filtered);
  log(`[render] templates=${filtered.length} composites=${specs.length} → ${outputDir}`);

  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: !options.headed });
  let written = 0;
  let skipped = 0;
  const outcomes: CompositeOutcome[] = [];
  try {
    for (const spec of specs) {
      if (!existsSync(spec.rawPath)) {
        skipped++;
        outcomes.push({ spec, skipped: true });
        log(`[render]   ! skip (no raw): ${spec.rawPath}`);
        continue;
      }
      try {
        await renderOne(browser, spec, log);
        written++;
        outcomes.push({ spec, skipped: false });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        outcomes.push({ spec, skipped: false, error });
        log(
          `[render]   ✗ ${spec.template.id}/${spec.screen.name} (${spec.theme}): ${error.message}`,
        );
      }
    }
    log(`[render] done — ${written}/${specs.length} composites written, ${skipped} skipped`);
    return { written, skipped, outputDir, outcomes };
  } finally {
    await browser.close();
  }
}

async function renderOne(
  browser: Browser,
  spec: CompositeSpec,
  log: (msg: string) => void,
): Promise<void> {
  const url = buildWrapperUrl(spec);
  const context = await browser.newContext({
    viewport: { width: spec.template.output.width, height: spec.template.output.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction(
      // The wrapper.html sets this attribute after its <img> load event so
      // we don't screenshot a blank or half-loaded composite.
      () => document.body.dataset.rendered === "true",
      undefined,
      { timeout: 15_000 },
    );
    await page.evaluate(() => document.fonts.ready);
    await mkdir(dirname(spec.outputPath), { recursive: true });
    await page.screenshot({ path: spec.outputPath, type: "png", fullPage: false });
    log(
      `[render]   ✓ ${spec.template.id}/${spec.screen.name} (${spec.theme}) → ${spec.outputPath}`,
    );
  } finally {
    await context.close();
  }
}

/**
 * Build the URL Playwright navigates to for a composite. Exposed for tests
 * so they can assert URL params without spinning up a browser.
 */
export function buildWrapperUrl(spec: CompositeSpec): string {
  const params = new URLSearchParams();
  params.set("caption", spec.screen.caption);
  if (spec.screen.subtitle) params.set("subtitle", spec.screen.subtitle);
  params.set("theme", spec.theme);
  params.set("imageUrl", pathToFileURL(spec.rawPath).href);
  // Per-template options the wrapper may consult — prefix to avoid collisions.
  for (const [k, v] of Object.entries(spec.templateOptions)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      params.set(`opt.${k}`, String(v));
    }
  }
  return `${pathToFileURL(spec.template.wrapperHtmlPath).href}?${params.toString()}`;
}

/**
 * Build the full list of composite specs from a config + loaded templates.
 * Output paths are namespaced under `${outputDir}/${template.id}/`.
 */
export function buildCompositeSpecs(
  config: ShotcraftConfig,
  rawDir: string,
  outputDir: string,
  templates: ReadonlyArray<LoadedTemplate>,
): CompositeSpec[] {
  const specs: CompositeSpec[] = [];
  for (const lt of templates) {
    for (const screen of config.screens) {
      for (const theme of lt.themes) {
        const rawName = `${screen.name}-${lt.template.id}-${theme}.png`;
        const outName = `${screen.name}-${theme}.png`;
        specs.push({
          template: lt.template,
          templateOptions: lt.options,
          screen,
          theme,
          rawPath: join(rawDir, rawName),
          outputPath: join(outputDir, lt.template.id, outName),
        });
      }
    }
  }
  return specs;
}

function applyTemplateFilter(
  templates: ReadonlyArray<LoadedTemplate>,
  filter: string | undefined,
): ReadonlyArray<LoadedTemplate> {
  if (!filter) return templates;
  const matched = templates.filter((lt) => lt.template.id === filter);
  if (matched.length === 0) {
    throw new Error(
      `shotcraft: no template matches "${filter}". Loaded: ${
        templates.map((t) => t.template.id).join(", ") || "(none)"
      }`,
    );
  }
  return matched;
}

async function ensureTemplates(
  config: ShotcraftConfig,
  options: RenderRunOptions,
  cwd: string,
): Promise<ReadonlyArray<LoadedTemplate>> {
  if (options.templates) return options.templates;
  if (!config.templates || config.templates.length === 0) return [];
  return await loadTemplates(config.templates, { cwd });
}

function absolutize(p: string, cwd: string): string {
  return isAbsolute(p) ? p : resolve(cwd, p);
}

function defaultLog(msg: string): void {
  console.log(msg);
}
