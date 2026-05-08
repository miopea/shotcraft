import type { Page } from "playwright";
import type { SetupFn } from "../config/types.js";
import type { ApiLoginOptions } from "./types.js";

/**
 * Build a {@link SetupFn} that authenticates by calling a JSON API.
 * The helper executes the `fetch()` from inside the page so any
 * `Set-Cookie` in the response lands on the browser context that the
 * subsequent capture screens use.
 *
 * @example
 * ```ts
 * setup: apiLogin({
 *   url: "/api/auth/login",
 *   body: {
 *     email: process.env.DEMO_EMAIL,
 *     password: process.env.DEMO_PASSWORD,
 *   },
 * })
 * ```
 */
export function apiLogin<T = unknown>(opts: ApiLoginOptions<T>): SetupFn {
  return async (page: Page) => {
    interface FetchArgs {
      url: string;
      method: string;
      headers: Record<string, string>;
      body: string | undefined;
      credentialsInclude: boolean;
    }
    interface FetchResult {
      status: number;
      statusText: string;
      body: string;
    }

    const args: FetchArgs = {
      url: opts.url,
      method: opts.method ?? "POST",
      headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentialsInclude: opts.credentialsInclude !== false,
    };

    const result = await page.evaluate(async (a: FetchArgs): Promise<FetchResult> => {
      const init: RequestInit = {
        method: a.method,
        headers: a.headers,
        credentials: a.credentialsInclude ? "include" : "same-origin",
      };
      if (a.body !== undefined) init.body = a.body;
      const res = await fetch(a.url, init);
      return {
        status: res.status,
        statusText: res.statusText,
        body: await res.text(),
      };
    }, args);

    const expected = opts.expectStatus ?? 200;
    const ok =
      typeof expected === "function" ? expected(result.status) : result.status === expected;

    if (!ok) {
      throw new Error(
        `apiLogin: ${args.method} ${opts.url} returned ${result.status} ${result.statusText}: ${result.body.slice(0, 200)}`,
      );
    }
  };
}
