/**
 * Shotcraft eat-our-own-dogfood demo.
 *
 * Drives the Shotcraft docs site (`@shotcraft/docs`, served on
 * http://localhost:4321 by `pnpm --filter @shotcraft/docs dev`) through
 * the README-hero and OG-card templates to produce the marketing assets
 * you see at the top of the project's GitHub repo.
 *
 * Workflow:
 *   1. In one terminal: `pnpm --filter @shotcraft/docs dev`
 *   2. From this directory: `pnpm screenshots`
 *   3. Curated outputs land in `./screenshots/`; the polished ones get
 *      copied to `assets/readme/` at the repo root for the README.
 */

import { defineConfig } from "shotcraft";

const TARGET = process.env.SHOTCRAFT_DOCS_URL ?? "http://localhost:4321";

export default defineConfig({
  target: TARGET,

  /**
   * No auth — the docs site is fully public. We dismiss Astro's hydration
   * helpers and the Starlight theme picker to avoid widget chrome in the
   * captured screen.
   */
  setup: async (page) => {
    // Force the page-load to settle so the captured screen reads cleanly.
    await page.goto(TARGET, { waitUntil: "networkidle" });
  },

  applyTheme: async (page, theme) => {
    // Starlight respects a `data-theme` attribute on <html>. Set it
    // explicitly so each theme captures cleanly even if the user's
    // device / Playwright defaults disagree.
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
  },

  screens: [
    {
      route: "/",
      name: "01-landing",
      caption: "Capture your live app",
      subtitle:
        "Open-source CLI that turns your running app into App Store, Play Store, README, and OG-card images in one command.",
      waitMs: 600,
    },
  ],

  templates: ["@shotcraft/template-readme-hero", "@shotcraft/template-social-og-card"],

  outputDir: "./screenshots",
});
