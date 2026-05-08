import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { ShotcraftTemplate } from "shotcraft";

/**
 * Shotcraft template — Apple App Store iPad 13" tier.
 *
 * - Capture viewport: 1032×1376 CSS px @ dpr 2 → 2064×2752 raw pixels.
 * - Final composite: 2064×2752 — Apple's REQUIRED iPad 13" tier for the App
 *   Store when an app declares iPad support.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..");

const template: ShotcraftTemplate = {
  id: "app-store-ipad",
  displayName: 'Apple App Store — iPad 13"',
  viewport: { width: 1032, height: 1376, dpr: 2 },
  output: { width: 2064, height: 2752 },
  themes: ["dark", "light"],
  wrapperHtmlPath: resolve(PACKAGE_ROOT, "wrapper.html"),
  isMobile: true,
};

export default template;
