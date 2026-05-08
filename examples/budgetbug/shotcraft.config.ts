/**
 * Shotcraft example — BudgetBug.
 *
 * The canonical "real-world demo" for Shotcraft. Drives BudgetBug's running
 * dev server (default: http://localhost:5173) through every first-party
 * template — App Store iPhone + iPad, Play Store phone + tablet, README
 * hero, and Open Graph card — to produce a full set of marketing-ready
 * screenshots in one command.
 *
 * Usage:
 *   1. Start BudgetBug locally — `pnpm dev` in ~/projects/personal/budgetbug,
 *      or point BUDGETBUG_BASE_URL at a staging/production deployment with
 *      stable demo data.
 *   2. Copy `.env.example` → `.env` and fill in BUDGETBUG_DEMO_PASSWORD
 *      (the BudgetBug demo user's password).
 *   3. From this directory: `pnpm screenshots`.
 *
 * Output lands in `./screenshots/{template-id}/{name}-{theme}.png`.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "shotcraft";

// ---------------------------------------------------------------------------
// .env loader — small enough to inline; avoids pulling in `dotenv` just for
// one example. Only sets keys not already in process.env so explicit shell
// exports win.
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^"(.*)"$/, "$1");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(join(HERE, ".env"));

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = process.env.BUDGETBUG_BASE_URL ?? "http://localhost:5173";
const EMAIL = process.env.BUDGETBUG_DEMO_EMAIL ?? "demo@budgetbug.live";
const PASSWORD = process.env.BUDGETBUG_DEMO_PASSWORD;

// BudgetBug's storage keys — mirrored from
// `~/projects/personal/budgetbug/client/src/lib/`.
const THEME_STORAGE_KEY = "budgetbug-theme";
const ONBOARDING_KEY = "budgetbug-onboarding-completed";

export default defineConfig({
  target: BASE_URL,

  /**
   * One-time setup. Runs once per (viewport × theme) capture group, before
   * any screen is captured. We log in by hitting BudgetBug's auth API
   * directly (faster + more reliable than driving the login form), then
   * pre-mark the onboarding tour as completed so it doesn't overlay every
   * screen.
   */
  setup: async (page) => {
    if (!PASSWORD) {
      throw new Error(
        "BUDGETBUG_DEMO_PASSWORD is not set. Copy `.env.example` → `.env` and fill it in.",
      );
    }
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(
      async ({ email, password }) => {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email, password }),
        });
        const text = await res.text();
        return { status: res.status, body: text };
      },
      { email: EMAIL, password: PASSWORD },
    );
    if (result.status !== 200) {
      throw new Error(`Login failed (${result.status}): ${result.body}`);
    }
    // Pre-mark the Bugsy onboarding tour as completed. The OnboardingOverlay
    // component reads via `readOfflineCache(KEY)` which expects a
    // `{ data, cachedAt }` envelope.
    await page.evaluate((key) => {
      const entry = { data: true, cachedAt: new Date().toISOString() };
      localStorage.setItem(key, JSON.stringify(entry));
    }, ONBOARDING_KEY);
  },

  /**
   * Imperative theme hook. BudgetBug's ThemeContext reads `localStorage` on
   * mount and toggles the `dark` class on `<html>`; the CSS
   * `prefers-color-scheme` media query alone isn't enough.
   */
  applyTheme: async (page, theme) => {
    await page.evaluate(
      ({ key, theme }) => {
        localStorage.setItem(key, theme);
        const root = document.documentElement;
        if (theme === "dark") root.classList.add("dark");
        else root.classList.remove("dark");
      },
      { key: THEME_STORAGE_KEY, theme },
    );
  },

  /**
   * Six screens — the same set BudgetBug's existing capture script produces.
   * `waitMs` is tuned per-route so chart animations have time to settle.
   */
  screens: [
    {
      route: "/",
      name: "01-dashboard",
      caption: "Know your budget at a glance",
      waitMs: 1500,
    },
    {
      route: "/cashflow",
      name: "02-cashflow",
      caption: "Track income and expenses",
      waitMs: 1800,
    },
    {
      route: "/bills",
      name: "03-bills",
      caption: "Never miss a recurring bill",
      waitMs: 1200,
    },
    {
      route: "/networth",
      name: "04-networth",
      caption: "Watch your wealth grow",
      waitMs: 1800,
    },
    {
      route: "/insights",
      name: "05-insights",
      caption: "Get personalized AI guidance",
      waitMs: 1500,
    },
    {
      route: "/transactions",
      name: "06-transactions",
      caption: "Every purchase, categorized",
      waitMs: 1200,
    },
  ],

  /**
   * All six first-party templates. Capture runs once per (template ×
   * screen × theme); render composes each into its target dimensions.
   *
   * To run a subset (e.g. just App Store), comment templates out — the
   * pipeline scales linearly with template count.
   */
  templates: [
    "@shotcraft/template-app-store-iphone",
    "@shotcraft/template-app-store-ipad",
    "@shotcraft/template-play-store-phone",
    "@shotcraft/template-play-store-tablet",
    "@shotcraft/template-readme-hero",
    "@shotcraft/template-social-og-card",
  ],

  outputDir: "./screenshots",
});
