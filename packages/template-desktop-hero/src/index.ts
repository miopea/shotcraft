import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { ShotcraftTemplate } from "shotcraft";

/**
 * Shotcraft template — Desktop hero (landscape, 1920×1080).
 *
 * - Capture viewport: 1440×900 CSS px @ dpr 2 → 2880×1800 raw pixels.
 *   `isMobile: false` — we want a real desktop layout from the target,
 *   not the mobile breakpoint Tailwind etc. apply when isMobile is on.
 * - Final composite: 1920×1080 — the universal landscape ratio.
 *   Fits README hero `<img>` columns, OG image slots, and most
 *   landing-page screenshot frames.
 *
 * Visual: a minimal browser-chrome window (rounded corners, soft
 * drop-shadow, top bar with three traffic-light dots) centered on a
 * gradient background, with a short headline caption above. The
 * chrome is CSS — no SVG frame to maintain. Both dark + light
 * variants ship.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..");

const template: ShotcraftTemplate = {
  id: "desktop-hero",
  displayName: "Desktop hero (1920×1080)",
  viewport: { width: 1440, height: 900, dpr: 2 },
  output: { width: 1920, height: 1080 },
  themes: ["dark", "light"],
  wrapperHtmlPath: resolve(PACKAGE_ROOT, "wrapper.html"),
  isMobile: false,
};

export default template;
