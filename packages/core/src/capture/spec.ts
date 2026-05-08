import { join } from "node:path";
import type { ScreenDef, ShotcraftConfig, ShotcraftDefaults, Theme } from "../config/types.js";
import type { LoadedTemplate } from "../template/load.js";

/**
 * Resolved viewport — combines a template's `viewport` metadata with the
 * mobile / UA flags Playwright needs to construct a context.
 */
export interface ResolvedViewport {
  /** Stable identifier used in output filenames. Either a template id or `default`. */
  id: string;
  width: number;
  height: number;
  dpr: number;
  isMobile: boolean;
  userAgent: string | undefined;
}

/**
 * One unit of work for the capture phase: a single (screen × viewport × theme)
 * triple, with the absolute output path pre-computed.
 */
export interface CaptureSpec {
  screen: ScreenDef;
  viewport: ResolvedViewport;
  theme: Theme;
  /** Absolute path the screenshot should be written to. */
  outputPath: string;
}

const DEFAULT_VIEWPORT: ResolvedViewport = {
  id: "default",
  width: 1280,
  height: 800,
  dpr: 2,
  isMobile: false,
  userAgent: undefined,
};

const DEFAULT_THEMES: ReadonlyArray<Theme> = ["dark"];

/**
 * Apply user-provided defaults on top of Shotcraft's built-in defaults to
 * produce the viewport + theme set used when no template metadata is available.
 */
export function resolveDefaults(d: ShotcraftDefaults | undefined): {
  viewport: ResolvedViewport;
  themes: ReadonlyArray<Theme>;
} {
  const viewport: ResolvedViewport = {
    id: DEFAULT_VIEWPORT.id,
    width: d?.viewport?.width ?? DEFAULT_VIEWPORT.width,
    height: d?.viewport?.height ?? DEFAULT_VIEWPORT.height,
    dpr: d?.viewport?.dpr ?? DEFAULT_VIEWPORT.dpr,
    isMobile: d?.isMobile ?? DEFAULT_VIEWPORT.isMobile,
    userAgent: d?.userAgent,
  };
  const themes = d?.themes && d.themes.length > 0 ? d.themes : DEFAULT_THEMES;
  return { viewport, themes };
}

/**
 * Convert a {@link LoadedTemplate} into a {@link ResolvedViewport} the
 * capture engine can drive. The template's `id` becomes the viewport id
 * stamped into the output filename so render can find the right raw.
 */
export function viewportFromTemplate(lt: LoadedTemplate): ResolvedViewport {
  return {
    id: lt.template.id,
    width: lt.template.viewport.width,
    height: lt.template.viewport.height,
    dpr: lt.template.viewport.dpr,
    isMobile: lt.template.isMobile ?? false,
    userAgent: undefined,
  };
}

/**
 * Derive the full set of capture specs from a config.
 *
 * - When `templates` is non-empty, generate one spec per (screen × template ×
 *   theme), capturing at each template's required viewport. Output filenames
 *   embed the template id so render can find the matching raw.
 * - Otherwise, fall back to a single (screen × theme) pass at
 *   `config.defaults` (or the built-in desktop default). Useful for
 *   capture-only runs before templates are installed.
 *
 * `rawDir` is an absolute directory; output paths are joined onto it.
 */
export function deriveCaptureSpecs(
  config: ShotcraftConfig,
  rawDir: string,
  templates?: ReadonlyArray<LoadedTemplate>,
): CaptureSpec[] {
  if (templates && templates.length > 0) {
    return deriveFromTemplates(config, rawDir, templates);
  }
  return deriveFromDefaults(config, rawDir);
}

function deriveFromDefaults(config: ShotcraftConfig, rawDir: string): CaptureSpec[] {
  const { viewport, themes } = resolveDefaults(config.defaults);
  const specs: CaptureSpec[] = [];
  for (const screen of config.screens) {
    for (const theme of themes) {
      specs.push({
        screen,
        viewport,
        theme,
        outputPath: join(rawDir, captureFilename(screen, viewport, theme)),
      });
    }
  }
  return specs;
}

function deriveFromTemplates(
  config: ShotcraftConfig,
  rawDir: string,
  templates: ReadonlyArray<LoadedTemplate>,
): CaptureSpec[] {
  const specs: CaptureSpec[] = [];
  for (const screen of config.screens) {
    for (const lt of templates) {
      const viewport = viewportFromTemplate(lt);
      for (const theme of lt.themes) {
        specs.push({
          screen,
          viewport,
          theme,
          outputPath: join(rawDir, captureFilename(screen, viewport, theme)),
        });
      }
    }
  }
  return specs;
}

export function captureFilename(
  screen: ScreenDef,
  viewport: ResolvedViewport,
  theme: Theme,
): string {
  return `${screen.name}-${viewport.id}-${theme}.png`;
}
