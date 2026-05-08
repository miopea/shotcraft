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
export type {
  ShotcraftConfig,
  ScreenDef,
  TemplateRef,
  SetupFn,
} from "./config/types.js";
export { run } from "./run.js";
export type { RunOptions } from "./run.js";
export type { ShotcraftTemplate } from "./template/types.js";
