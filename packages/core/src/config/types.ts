import type { Page } from "playwright";

/**
 * Setup hook — called once after the headless browser launches and before any
 * screen is captured. The user has full Playwright `Page` access; this is the
 * escape hatch that lets Shotcraft handle every auth model (OAuth, email +
 * password, magic link, JWT, biometrics) without requiring a built-in primitive
 * for each.
 *
 * Anything you need to set up before capturing — log in, set localStorage,
 * dismiss onboarding, click a "Start tour" button — goes here.
 */
export type SetupFn = (page: Page) => Promise<void>;

export interface ScreenDef {
  /** Path on the target app to navigate to, e.g. "/dashboard". */
  route: string;
  /**
   * Stable identifier for this screen. Used in raw + composite output filenames
   * and as the `screen` key when overrides apply. Must be unique within a config.
   */
  name: string;
  /**
   * Headline caption shown over the device frame in the marketing wrapper.
   * Per-template templates can ignore or transform this.
   */
  caption: string;
  /** Optional sub-caption / second line of copy. */
  subtitle?: string;
  /**
   * Optional CSS selector to wait for before capturing — useful when a route
   * loads asynchronously and `networkidle` isn't enough.
   */
  waitForSelector?: string;
  /**
   * Extra ms to wait after the route is loaded (and any selector resolves).
   * Use to let chart animations finish.
   */
  waitMs?: number;
}

/**
 * A reference to a template package. Either:
 *
 * - A string (the package name) — Shotcraft uses the template's defaults.
 * - An object with options — fine-grained control over the template's behaviour
 *   for this run (themes, accent colours, etc.).
 */
export type TemplateRef =
  | string
  | {
      pkg: string;
      /** Override the template's default themes (e.g. `["dark"]` only). */
      themes?: ReadonlyArray<"dark" | "light">;
      /** Per-template options forwarded to the template's renderer. */
      options?: Record<string, unknown>;
    };

export interface ShotcraftConfig {
  /**
   * URL of the running app to capture. Usually a dev server (`http://localhost:5173`)
   * or a deployed staging URL. Production also works if your demo data is stable
   * there.
   */
  target: string;
  /**
   * One-time setup hook (login, dismiss tutorials, etc.). Runs once before any
   * screen capture.
   */
  setup?: SetupFn;
  /** Screens to capture. */
  screens: ReadonlyArray<ScreenDef>;
  /** Templates to render the captures through. */
  templates: ReadonlyArray<TemplateRef>;
  /**
   * Output directory root. Each template writes to `${outputDir}/${template.id}/`.
   * Default: `./screenshots`.
   */
  outputDir?: string;
  /**
   * Where intermediate raw captures are written, relative to outputDir.
   * Default: `raw`.
   */
  rawSubdir?: string;
  /** Override the locale Playwright reports to the page. Default: `en-US`. */
  locale?: string;
  /** Override the IANA timezone Playwright reports. Default: `America/New_York`. */
  timezoneId?: string;
}
