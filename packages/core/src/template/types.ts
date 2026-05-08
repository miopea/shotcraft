/**
 * The contract every Shotcraft template package implements. Templates are
 * regular npm packages whose default export matches this shape — first-party
 * templates live under `@shotcraft/template-*`, and any community package can
 * be discovered from `package.json` dependencies whose name matches
 * `shotcraft-template-*`.
 */
export interface ShotcraftTemplate {
  /**
   * Stable identifier for this template, used in output paths and CLI commands.
   * Must be globally unique — convention is to mirror the npm package name
   * minus the `@shotcraft/template-` or `shotcraft-template-` prefix.
   *
   * Example: `app-store-iphone`, `readme-hero`, `social-og-card`.
   */
  id: string;

  /**
   * Pretty name for CLI output. Optional — falls back to `id`.
   */
  displayName?: string;

  /**
   * Logical viewport (CSS pixels) used during capture. The SPA being captured
   * sees this size in `window.innerWidth/Height` and media queries respond
   * accordingly — e.g. iPhone 6.5" needs CSS width 428 to trigger Tailwind's
   * mobile breakpoints, even though the final PNG is 1284 px wide.
   */
  viewport: { width: number; height: number; dpr: number };

  /**
   * Final composite dimensions in physical pixels. Should equal
   * `viewport.width * viewport.dpr × viewport.height * viewport.dpr` for
   * device-frame templates that fill the canvas with the captured screen,
   * but can differ for templates with their own aspect ratio (README hero,
   * social cards) where the captured screen is centred or windowed within.
   */
  output: { width: number; height: number };

  /**
   * Themes this template is designed to support. Most templates support both
   * light + dark, but some (e.g. social cards with a fixed background) may
   * only ship one.
   */
  themes: ReadonlyArray<"dark" | "light">;

  /**
   * Absolute path to the template's `wrapper.html` file, bundled with the
   * package. Shotcraft opens this in Playwright with URL params and renders
   * it to the final composite.
   */
  wrapperHtmlPath: string;

  /**
   * Should this template be advertised by `isMobile: true` and `hasTouch: true`
   * during capture? iPhone/iPad/Android phones = true. Desktop landing-page
   * captures = false.
   */
  isMobile?: boolean;

  /**
   * Optional per-template defaults the user can override via the
   * `templates: [{ pkg, options }]` config form.
   */
  defaultOptions?: Record<string, unknown>;
}
