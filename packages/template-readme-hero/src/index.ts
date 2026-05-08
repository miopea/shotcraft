import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { ShotcraftTemplate } from "shotcraft";

/**
 * Shotcraft template — GitHub README hero (landscape).
 *
 * - Capture viewport: 428×926 CSS px @ dpr 2 → 856×1852 raw pixels.
 * - Final composite: 1280×640 — fits gracefully into a README's content
 *   column on both desktop and mobile-rendered docs.
 *
 * Both `dark` and `light` are first-class — a README typically swaps via the
 * `<picture>` `prefers-color-scheme` element, so a hero that only ships dark
 * looks broken in a light-themed GitHub session.
 *
 * Layout is asymmetric two-pane: caption + tagline in left half, device
 * frame in right half. The README context already has lots of visual noise
 * (badges, contributor avatars, etc.); we keep the composition uncluttered.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..");

const template: ShotcraftTemplate = {
  id: "readme-hero",
  displayName: "GitHub README hero",
  viewport: { width: 428, height: 926, dpr: 2 },
  output: { width: 1280, height: 640 },
  themes: ["dark", "light"],
  wrapperHtmlPath: resolve(PACKAGE_ROOT, "wrapper.html"),
  isMobile: true,
};

export default template;
