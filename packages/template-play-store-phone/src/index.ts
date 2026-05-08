import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { ShotcraftTemplate } from "shotcraft";

/**
 * Shotcraft template — Google Play Store phone screenshot.
 *
 * - Capture viewport: 360×640 CSS px @ dpr 3 → 1080×1920 raw pixels (9:16).
 * - Final composite: 1080×1920. Aligned with Play Store's 1080×1920 portrait
 *   phone screenshot tier.
 *
 * Visual is brighter / more saturated than App Store templates: Play Store
 * thumbnails get clobbered by the colorful Play UI surrounding them, so deep
 * slate gradients lose attention. We lean Material — emerald → cyan.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..");

const template: ShotcraftTemplate = {
  id: "play-store-phone",
  displayName: "Google Play — phone",
  viewport: { width: 360, height: 640, dpr: 3 },
  output: { width: 1080, height: 1920 },
  themes: ["dark", "light"],
  wrapperHtmlPath: resolve(PACKAGE_ROOT, "wrapper.html"),
  isMobile: true,
};

export default template;
