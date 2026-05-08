import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { ShotcraftTemplate } from "shotcraft";

/**
 * Shotcraft template — Apple App Store iPhone 6.5" tier.
 *
 * - Logical capture viewport: 428×926 CSS px @ dpr 3 → 1284×2778 raw pixels.
 *   Capturing at the dpr-multiplied physical size avoids upsampling under the
 *   wrapper's 3D perspective transform.
 * - Final composite: 1284×2778 — Apple's REQUIRED iPhone 6.5" tier for the
 *   App Store.
 *
 * The wrapper.html beside this file is what the Shotcraft render engine
 * navigates to in Playwright. URL params (`caption`, `subtitle`, `theme`,
 * `imageUrl`) populate the marketing layer; once the captured `<img>` loads
 * the wrapper sets `document.body.dataset.rendered = "true"` to signal
 * Shotcraft it's safe to screenshot.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
// `dist/index.js` ships alongside the asset files in the package root —
// `files: ["dist", "wrapper.html", ...]` in package.json keeps the layout
// consistent in node_modules. Step up one directory to find them.
const PACKAGE_ROOT = resolve(HERE, "..");

const template: ShotcraftTemplate = {
  id: "app-store-iphone",
  displayName: 'Apple App Store — iPhone 6.5"',
  viewport: { width: 428, height: 926, dpr: 3 },
  output: { width: 1284, height: 2778 },
  themes: ["dark", "light"],
  wrapperHtmlPath: resolve(PACKAGE_ROOT, "wrapper.html"),
  isMobile: true,
};

export default template;
