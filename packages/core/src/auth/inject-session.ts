import type { Page } from "playwright";
import type { SetupFn } from "../config/types.js";
import type { InjectSessionOptions } from "./types.js";

/**
 * Build a {@link SetupFn} that injects pre-existing session state into
 * the browser before any screen is captured. Useful when you already
 * hold a session token (CI-baked secret, signed dev token) and don't
 * need to round-trip a real login flow at all.
 *
 * Cookies land on the browser context via Playwright's
 * `addCookies`; localStorage / sessionStorage entries are written
 * inside `page.evaluate`. The capture engine has already navigated
 * to the target's origin before `setup` runs, so storage writes hit
 * the right origin by default; override `origin` to write storage
 * for a different host.
 *
 * @example
 * ```ts
 * setup: injectSession({
 *   cookies: [{
 *     name: "auth_token",
 *     value: process.env.DEMO_AUTH_TOKEN!,
 *     domain: "localhost",
 *   }],
 *   localStorage: { "onboarding-completed": "true" },
 * })
 * ```
 */
export function injectSession(opts: InjectSessionOptions): SetupFn {
  return async (page: Page) => {
    if (opts.cookies && opts.cookies.length > 0) {
      const ctx = page.context();
      await ctx.addCookies(
        opts.cookies.map((c) => ({
          name: c.name,
          value: c.value,
          ...(c.domain !== undefined ? { domain: c.domain } : {}),
          path: c.path ?? "/",
          httpOnly: c.httpOnly ?? false,
          secure: c.secure ?? false,
          sameSite: c.sameSite ?? "Lax",
          ...(c.expires !== undefined ? { expires: c.expires } : {}),
        })),
      );
    }

    if (opts.origin !== undefined) {
      await page.goto(opts.origin, { waitUntil: "domcontentloaded" });
    }

    if (opts.localStorage) {
      const entries = Object.entries(opts.localStorage);
      await page.evaluate((items: ReadonlyArray<readonly [string, string]>) => {
        for (const [k, v] of items) localStorage.setItem(k, v);
      }, entries);
    }
    if (opts.sessionStorage) {
      const entries = Object.entries(opts.sessionStorage);
      await page.evaluate((items: ReadonlyArray<readonly [string, string]>) => {
        for (const [k, v] of items) sessionStorage.setItem(k, v);
      }, entries);
    }
  };
}
