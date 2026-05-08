import type { Page } from "playwright";
import type { SetupFn } from "../config/types.js";
import type { FormLoginOptions } from "./types.js";

/**
 * Build a {@link SetupFn} that logs into an HTML form. Navigates to
 * `url`, fills the email + password inputs, clicks submit, and waits
 * for either `waitForSelector` / `waitForUrl` (when provided) or
 * `networkidle` (the default).
 *
 * @example
 * ```ts
 * setup: formLogin({
 *   url: "/login",
 *   emailField: "input[name=email]",
 *   passwordField: "input[name=password]",
 *   submitButton: "button[type=submit]",
 *   email: process.env.DEMO_EMAIL!,
 *   password: process.env.DEMO_PASSWORD!,
 *   waitForUrl: /\/dashboard$/,
 * })
 * ```
 */
export function formLogin(opts: FormLoginOptions): SetupFn {
  const timeout = opts.timeoutMs ?? 15_000;
  return async (page: Page) => {
    await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout });
    await page.fill(opts.emailField, opts.email, { timeout });
    await page.fill(opts.passwordField, opts.password, { timeout });

    // Race the click against whichever wait condition the user picked.
    // We click *after* setting up the wait so we don't miss a fast
    // navigation event.
    const wait = waitFor(page, opts, timeout);
    await page.click(opts.submitButton, { timeout });
    await wait;
  };
}

function waitFor(page: Page, opts: FormLoginOptions, timeout: number): Promise<unknown> {
  if (opts.waitForUrl !== undefined) {
    return page.waitForURL(opts.waitForUrl, { timeout });
  }
  if (opts.waitForSelector !== undefined) {
    return page.waitForSelector(opts.waitForSelector, { timeout });
  }
  return page.waitForLoadState("networkidle", { timeout });
}
