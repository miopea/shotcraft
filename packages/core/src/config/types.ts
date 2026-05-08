import type { Page } from "playwright";

export type Theme = "dark" | "light";

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

/**
 * Optional imperative theme hook. If your app respects the CSS
 * `prefers-color-scheme` media query (most modern frameworks do), you can
 * leave this unset — Shotcraft already configures the Playwright context
 * with the right `colorScheme` per theme.
 *
 * Provide this only when your app needs a programmatic toggle: setting a
 * `localStorage` key, calling a global, clicking a UI affordance.
 */
export type ApplyThemeFn = (page: Page, theme: Theme) => Promise<void>;

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

export interface ShotcraftDefaults {
  /**
   * Logical viewport (CSS pixels) used during capture when a template's
   * viewport metadata isn't available. Default: `{ width: 1280, height: 800,
   * dpr: 2 }` (desktop). For mobile-first captures override with iPhone-ish
   * dimensions.
   */
  viewport?: { width: number; height: number; dpr: number };
  /** Themes to capture for. Default: `["dark"]`. */
  themes?: ReadonlyArray<Theme>;
  /** Advertise mobile UA / touch / `isMobile`. Default: `false`. */
  isMobile?: boolean;
  /** Optional UA override. */
  userAgent?: string;
}

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
  /**
   * Optional imperative theme hook — see {@link ApplyThemeFn}. Most apps that
   * respect `prefers-color-scheme` won't need this.
   */
  applyTheme?: ApplyThemeFn;
  /** Screens to capture. */
  screens: ReadonlyArray<ScreenDef>;
  /**
   * Templates to render the captures through. Optional during the Phase 2
   * timeframe — capture-only runs work without any installed templates and
   * fall back to {@link ShotcraftDefaults}.
   */
  templates?: ReadonlyArray<TemplateRef>;
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
  /**
   * Defaults applied when no template metadata is available (e.g. capture-only
   * runs before Phase 4 ships first-party templates).
   */
  defaults?: ShotcraftDefaults;
}
