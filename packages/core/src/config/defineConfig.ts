import type { ShotcraftConfig } from "./types.js";

/**
 * Type-safe identity helper for declaring a Shotcraft config.
 *
 * Wrap your config in `defineConfig({ ... })` so your editor gets full
 * autocompletion + type checking. Returns the config unchanged at runtime.
 *
 * @example
 * ```ts
 * import { defineConfig } from "shotcraft";
 *
 * export default defineConfig({
 *   target: "http://localhost:5173",
 *   setup: async (page) => {
 *     await page.goto("/login");
 *     // ...
 *   },
 *   screens: [
 *     { route: "/", name: "dashboard", caption: "See your spending at a glance" },
 *   ],
 *   templates: ["@shotcraft/template-app-store-iphone"],
 * });
 * ```
 */
export function defineConfig(config: ShotcraftConfig): ShotcraftConfig {
  return config;
}
