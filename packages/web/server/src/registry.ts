/**
 * Hardcoded registry of the first-party Shotcraft templates that the
 * hosted companion's gallery serves.
 *
 * The data here matches each template's `src/index.ts` metadata. We
 * hardcode it (rather than dynamically importing each template) so
 * the web server stays standalone — production deployments don't have
 * the templates installed and shouldn't need to.
 *
 * Sample images get copied into `public/samples/<id>/` at build time
 * (see `scripts/copy-samples.mjs`).
 */

export interface TemplateInfo {
  id: string;
  pkg: string;
  displayName: string;
  category: "app-store" | "play-store" | "readme" | "social";
  output: { width: number; height: number };
  themes: ReadonlyArray<"dark" | "light">;
  /**
   * Sample PNG URLs relative to the site root, one per theme. Files live
   * under `/samples/<id>/` once `scripts/copy-samples.mjs` has run.
   */
  samples: ReadonlyArray<{ theme: "dark" | "light"; url: string; filename: string }>;
}

export const TEMPLATE_REGISTRY: ReadonlyArray<TemplateInfo> = [
  {
    id: "app-store-iphone",
    pkg: "@shotcraft/template-app-store-iphone",
    displayName: 'Apple App Store — iPhone 6.5"',
    category: "app-store",
    output: { width: 1284, height: 2778 },
    themes: ["dark", "light"],
    samples: [
      {
        theme: "dark",
        url: "/samples/app-store-iphone/dashboard-dark.png",
        filename: "dashboard-dark.png",
      },
      {
        theme: "light",
        url: "/samples/app-store-iphone/dashboard-light.png",
        filename: "dashboard-light.png",
      },
    ],
  },
  {
    id: "app-store-ipad",
    pkg: "@shotcraft/template-app-store-ipad",
    displayName: 'Apple App Store — iPad 13"',
    category: "app-store",
    output: { width: 2064, height: 2752 },
    themes: ["dark", "light"],
    samples: [
      {
        theme: "dark",
        url: "/samples/app-store-ipad/dashboard-dark.png",
        filename: "dashboard-dark.png",
      },
      {
        theme: "light",
        url: "/samples/app-store-ipad/dashboard-light.png",
        filename: "dashboard-light.png",
      },
    ],
  },
  {
    id: "play-store-phone",
    pkg: "@shotcraft/template-play-store-phone",
    displayName: "Google Play — phone",
    category: "play-store",
    output: { width: 1080, height: 1920 },
    themes: ["dark", "light"],
    samples: [
      {
        theme: "dark",
        url: "/samples/play-store-phone/dashboard-dark.png",
        filename: "dashboard-dark.png",
      },
      {
        theme: "light",
        url: "/samples/play-store-phone/dashboard-light.png",
        filename: "dashboard-light.png",
      },
    ],
  },
  {
    id: "play-store-tablet",
    pkg: "@shotcraft/template-play-store-tablet",
    displayName: 'Google Play — 7" tablet',
    category: "play-store",
    output: { width: 1920, height: 1200 },
    themes: ["dark", "light"],
    samples: [
      {
        theme: "dark",
        url: "/samples/play-store-tablet/dashboard-dark.png",
        filename: "dashboard-dark.png",
      },
      {
        theme: "light",
        url: "/samples/play-store-tablet/dashboard-light.png",
        filename: "dashboard-light.png",
      },
    ],
  },
  {
    id: "readme-hero",
    pkg: "@shotcraft/template-readme-hero",
    displayName: "GitHub README hero",
    category: "readme",
    output: { width: 1280, height: 640 },
    themes: ["dark", "light"],
    samples: [
      { theme: "dark", url: "/samples/readme-hero/hero-dark.png", filename: "hero-dark.png" },
      { theme: "light", url: "/samples/readme-hero/hero-light.png", filename: "hero-light.png" },
    ],
  },
  {
    id: "social-og-card",
    pkg: "@shotcraft/template-social-og-card",
    displayName: "Social — Open Graph / Twitter",
    category: "social",
    output: { width: 1200, height: 630 },
    themes: ["dark"],
    samples: [
      {
        theme: "dark",
        url: "/samples/social-og-card/card-dark.png",
        filename: "card-dark.png",
      },
    ],
  },
];
