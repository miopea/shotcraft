import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { ShotcraftTemplate } from "shotcraft";

/**
 * Shotcraft template — Google Play 7" tablet (landscape).
 *
 * - Capture viewport: 600×960 CSS px @ dpr 2 → 1200×1920 raw pixels.
 * - Final composite: 1920×1200 (16:10 landscape). Aligned with Play Store's
 *   recommended 7" tablet screenshot ratio.
 *
 * Layout is asymmetric two-pane: caption + subtitle in left ~38% of canvas,
 * device frame in right ~58%, slightly tilted in 3D toward the viewer. The
 * landscape ratio works much better as two columns than centered.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..");

const template: ShotcraftTemplate = {
  id: "play-store-tablet",
  displayName: 'Google Play — 7" tablet',
  viewport: { width: 600, height: 960, dpr: 2 },
  output: { width: 1920, height: 1200 },
  themes: ["dark", "light"],
  wrapperHtmlPath: resolve(PACKAGE_ROOT, "wrapper.html"),
  isMobile: true,
};

export default template;
