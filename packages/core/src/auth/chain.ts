import type { Page } from "playwright";
import type { SetupFn } from "../config/types.js";

/**
 * Compose multiple {@link SetupFn}s into one, executed in order. Plays
 * well with the auth helpers — e.g. log in via API, then drop pre-filled
 * onboarding state into localStorage, then dismiss a tutorial banner —
 * without writing a giant imperative `setup`.
 *
 * @example
 * ```ts
 * setup: chain(
 *   apiLogin({ url: "/api/auth/login", body: { email, password } }),
 *   injectSession({ localStorage: { "tour-dismissed": "1" } }),
 * )
 * ```
 */
export function chain(...fns: ReadonlyArray<SetupFn>): SetupFn {
  return async (page: Page) => {
    for (const fn of fns) {
      await fn(page);
    }
  };
}
