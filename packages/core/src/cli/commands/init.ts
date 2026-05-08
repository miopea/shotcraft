import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_TARGET_PATH = "shotcraft.config.ts";

const TEMPLATE = `import { defineConfig } from "shotcraft";
// Auth helpers — uncomment whichever fits your login flow. See:
//   https://github.com/miopea/shotcraft/blob/main/docs/config.md#auth-helpers
// import { apiLogin, formLogin, injectSession, chain } from "shotcraft";

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
 * Docs: https://github.com/miopea/shotcraft/tree/main/docs
 */
export default defineConfig({
  target: "http://localhost:5173",

  /**
   * Setup hook — runs once before captures, full Playwright \`Page\` access.
   *
   * Three common patterns ship as helpers (see commented imports above):
   *
   *   API-based login (most common):
   *     setup: apiLogin({
   *       url: "/api/auth/login",
   *       body: {
   *         email: process.env.DEMO_EMAIL,
   *         password: process.env.DEMO_PASSWORD,
   *       },
   *     })
   *
   *   HTML form login:
   *     setup: formLogin({
   *       url: "/login",
   *       emailField: "input[name=email]",
   *       passwordField: "input[name=password]",
   *       submitButton: "button[type=submit]",
   *       email: process.env.DEMO_EMAIL!,
   *       password: process.env.DEMO_PASSWORD!,
   *       waitForUrl: /\\/dashboard$/,
   *     })
   *
   *   Pre-existing session token (CI-baked secret, dev token):
   *     setup: injectSession({
   *       cookies: [{
   *         name: "auth_token",
   *         value: process.env.DEMO_AUTH_TOKEN!,
   *         domain: "localhost",
   *       }],
   *       localStorage: { "onboarding-completed": "true" },
   *     })
   *
   * Compose multiple steps with \`chain(...)\`. For weirder flows (OAuth
   * popup, magic link, biometric), write your own:
   *
   *     setup: async (page) => { ... full Playwright Page here ... }
   */
  setup: async (page) => {
    // Replace with one of the patterns above, or your own login flow.
    void page;
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
   * what you need and reference them here. \`shotcraft capture\` runs
   * fine without any.
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
