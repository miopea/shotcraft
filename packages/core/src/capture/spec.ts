import { join } from "node:path";
import type { ScreenDef, ShotcraftConfig, ShotcraftDefaults, Theme } from "../config/types.js";

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
 * Derive the full set of capture specs from a config. The render phase will,
 * in Phase 3, override this with template-driven viewport/theme combinations;
 * during Phase 2 the only path is "no templates installed" → use defaults.
 *
 * `rawDir` is an absolute directory; output paths are joined onto it.
 */
export function deriveCaptureSpecs(config: ShotcraftConfig, rawDir: string): CaptureSpec[] {
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

export function captureFilename(
  screen: ScreenDef,
  viewport: ResolvedViewport,
  theme: Theme,
): string {
  return `${screen.name}-${viewport.id}-${theme}.png`;
}
