/**
 * Shotcraft eat-our-own-dogfood demo.
 *
 * Drives the Shotcraft companion site (`@shotcraft/web`, live at
 * https://shotcraft.bfgsolutions.net) through the README-hero and
 * OG-card templates to produce the marketing assets you see at the top
 * of the project's GitHub repo.
 *
 * Workflow:
 *   1. (Optional) serve the companion locally for a fresh build:
 *        `pnpm --filter @shotcraft/web dev`   # http://localhost:5174
 *      …or just leave SHOTCRAFT_DOCS_URL unset to capture the live site.
 *   2. From this directory: `pnpm screenshots`
 *   3. Curated outputs land in `./screenshots/`; the polished ones get
 *      copied to `assets/readme/` at the repo root for the README.
 */

import { defineConfig } from "shotcraft";

const TARGET = process.env.SHOTCRAFT_DOCS_URL ?? "https://shotcraft.bfgsolutions.net";

export default defineConfig({
  target: TARGET,

  /**
   * No auth — the companion site is fully public. We just let the page
   * settle so the captured screen reads cleanly.
   */
  setup: async (page) => {
    await page.goto(TARGET, { waitUntil: "networkidle" });
  },

  /**
   * The companion ships a single (dark) theme, so we capture dark only.
   */
  defaults: {
    themes: ["dark"],
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
