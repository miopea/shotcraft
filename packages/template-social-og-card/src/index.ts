import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { ShotcraftTemplate } from "shotcraft";

/**
 * Shotcraft template — Open Graph / Twitter card.
 *
 * - Capture viewport: 428×926 CSS px @ dpr 2 → 856×1852 raw pixels.
 * - Final composite: 1200×630 — the open-graph standard size that Twitter,
 *   LinkedIn, Slack, Discord, Notion, etc. all preview against.
 *
 * Single dark-only theme by design: OG cards are consumed against feeds
 * (Twitter, Slack) where dark holds attention against the surrounding light
 * UI. Caption-dominant layout: copy fills ~65 % of canvas, a small framed
 * device peek anchors the bottom-right corner. Optimized for thumbnail
 * legibility — at 200-300 px wide in a feed, the caption has to read.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..");

const template: ShotcraftTemplate = {
  id: "social-og-card",
  displayName: "Social — Open Graph / Twitter",
  viewport: { width: 428, height: 926, dpr: 2 },
  output: { width: 1200, height: 630 },
  themes: ["dark"],
  wrapperHtmlPath: resolve(PACKAGE_ROOT, "wrapper.html"),
  isMobile: true,
};

export default template;
