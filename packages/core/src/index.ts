/**
 * Shotcraft programmatic API.
 *
 * Most users won't import from here directly — the CLI (`shotcraft`) is the
 * primary surface. This module exists so projects can compose Shotcraft into
 * their own scripts when the CLI is too coarse.
 *
 * @example
 * ```ts
 * import { defineConfig, run } from "shotcraft";
 *
 * await run(defineConfig({
 *   target: "http://localhost:5173",
 *   setup: async (page) => { await page.goto("/login"); ... },
 *   screens: [{ route: "/", name: "dashboard", caption: "..." }],
 *   templates: ["@shotcraft/template-app-store-iphone"],
 * }));
 * ```
 */

export { defineConfig } from "./config/defineConfig.js";
export { loadConfig, findConfig } from "./config/load.js";
export type { LoadConfigOptions, LoadedConfig } from "./config/load.js";
export type {
  ShotcraftConfig,
  ShotcraftDefaults,
  ScreenDef,
  TemplateRef,
  SetupFn,
  ApplyThemeFn,
  Theme,
} from "./config/types.js";
export { runCapture } from "./capture/runner.js";
export type { CaptureRunOptions, CaptureResult } from "./capture/runner.js";
export { deriveCaptureSpecs, resolveDefaults, captureFilename } from "./capture/spec.js";
export type { CaptureSpec, ResolvedViewport } from "./capture/spec.js";
export { run } from "./run.js";
export type { RunOptions } from "./run.js";
export type { ShotcraftTemplate } from "./template/types.js";
