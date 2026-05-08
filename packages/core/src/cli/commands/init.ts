import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_TARGET_PATH = "shotcraft.config.ts";

const TEMPLATE = `import { defineConfig } from "shotcraft";

/**
 * Shotcraft config. Captures from your live app — point Shotcraft at a
 * running dev server (or staging URL) and \`shotcraft\` will produce raw
 * screenshots ready for templates to compose into App Store / Play Store
 * / README hero / social card images.
 *
 * Run:
 *   shotcraft         # capture + render end-to-end
 *   shotcraft capture # capture only
 *   shotcraft doctor  # sanity-check this config
 *
 * Docs: https://shotcraft.dev
 */
export default defineConfig({
  target: "http://localhost:5173",

  /**
   * Setup hook — full Playwright \`Page\` access. Use it to log in, prefill
   * localStorage, dismiss tutorials. This is the only auth abstraction
   * Shotcraft ships; it covers OAuth, email+password, magic links, JWT,
   * biometric, anything you can drive with Playwright.
   */
  setup: async (page) => {
    // Example: log in by hitting your auth API directly. Replace with whatever
    // matches your app's flow.
    //
    // await page.goto("http://localhost:5173/login", {
    //   waitUntil: "domcontentloaded",
    // });
    // await page.evaluate(async () => {
    //   const res = await fetch("/api/auth/login", {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     credentials: "include",
    //     body: JSON.stringify({
    //       email: "demo@example.com",
    //       password: "demo-password",
    //     }),
    //   });
    //   if (!res.ok) throw new Error("Login failed: " + (await res.text()));
    // });
  },

  screens: [
    {
      route: "/",
      name: "01-home",
      caption: "Welcome to your app",
      waitMs: 1500,
    },
    // {
    //   route: "/dashboard",
    //   name: "02-dashboard",
    //   caption: "See everything at a glance",
    //   waitForSelector: "[data-testid='dashboard-loaded']",
    // },
  ],

  /**
   * Templates compose your captures into final marketing images. Install
   * what you need and reference them here. (Templates land in Shotcraft v0.2;
   * \`shotcraft capture\` runs without any.)
   */
  // templates: [
  //   "@shotcraft/template-app-store-iphone",
  //   "@shotcraft/template-readme-hero",
  // ],

  outputDir: "./screenshots",
});
`;

export interface InitOptions {
  cwd?: string;
  /** Allow overwriting an existing config. Default: false. */
  force?: boolean;
  /** Override target filename. Default: \`shotcraft.config.ts\`. */
  target?: string;
}

export interface InitResult {
  /** Absolute path written. */
  path: string;
  /** True if a file was written; false if it already existed and force was off. */
  written: boolean;
}

/**
 * Scaffold a starter `shotcraft.config.ts` in `cwd`. Returns the absolute
 * path written. Refuses to clobber an existing file unless `force` is set.
 */
export async function runInit(options: InitOptions = {}): Promise<InitResult> {
  const cwd = options.cwd ?? process.cwd();
  const target = options.target ?? DEFAULT_TARGET_PATH;
  const path = resolve(cwd, target);
  if (existsSync(path) && !options.force) {
    return { path, written: false };
  }
  await writeFile(path, TEMPLATE, "utf8");
  return { path, written: true };
}

/** Exposed for tests so we can assert the scaffold compiles correctly. */
export const INIT_TEMPLATE = TEMPLATE;
