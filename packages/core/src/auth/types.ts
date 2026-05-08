/**
 * Declarative auth helpers — public API surface lives in `./index.ts`.
 *
 * The helpers wrap the most common login patterns in functions that
 * return a {@link SetupFn}. Same `setup(page)` interface as before,
 * just less imperative code in the user's config for the 90% case.
 * For anything weirder, fall back to writing your own setup function;
 * helpers and hand-written code mix freely via {@link chain}.
 */

export interface FormLoginOptions {
  /**
   * URL of the login page. Either an absolute URL, or a path relative
   * to `config.target` (in which case it's joined onto the target the
   * capture engine has already navigated to).
   */
  url: string;
  /** CSS selector for the email/username input. */
  emailField: string;
  /** CSS selector for the password input. */
  passwordField: string;
  /** CSS selector for the submit button. */
  submitButton: string;
  /** The email/username value to fill in. */
  email: string;
  /** The password value to fill in. */
  password: string;
  /**
   * Optional CSS selector that should appear after a successful login
   * (e.g. a dashboard greeting). When set, the helper waits for it.
   */
  waitForSelector?: string;
  /**
   * Optional URL pattern (string or RegExp) the page should land on
   * after submit. When set, the helper waits for navigation to match.
   */
  waitForUrl?: string | RegExp;
  /** Per-step timeout (ms). Default: 15000. */
  timeoutMs?: number;
}

export interface ApiLoginOptions<TBody = unknown> {
  /**
   * Login endpoint URL. Absolute, or relative to `config.target`.
   * The capture engine has already navigated to the target's origin
   * before `setup` runs, so a relative path is fine — `fetch()` from
   * the page will join it onto the current origin.
   */
  url: string;
  /**
   * JSON-serializable body. The helper wraps this in `JSON.stringify`
   * and sends with `Content-Type: application/json` (override via
   * `headers`).
   */
  body: TBody;
  /** HTTP method. Default: `"POST"`. */
  method?: "POST" | "PUT" | "GET" | "PATCH" | "DELETE";
  /** Extra request headers, merged with the default JSON content type. */
  headers?: Record<string, string>;
  /**
   * Status the response must match. Default: 200. Pass a function for
   * a range like `(s) => s >= 200 && s < 300`.
   */
  expectStatus?: number | ((status: number) => boolean);
  /**
   * Whether to send `credentials: "include"` so the response's
   * `Set-Cookie` lands on the browser context. Default: true.
   */
  credentialsInclude?: boolean;
}

export interface SessionCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  /** Unix epoch seconds. Defaults to no expiration (session cookie). */
  expires?: number;
}

export interface InjectSessionOptions {
  /** Cookies to add via `BrowserContext.addCookies`. */
  cookies?: ReadonlyArray<SessionCookie>;
  /** localStorage key→value pairs to inject. */
  localStorage?: Record<string, string>;
  /** sessionStorage key→value pairs to inject. */
  sessionStorage?: Record<string, string>;
  /**
   * Origin URL the storage entries should land on. Defaults to the
   * page's current origin (set by the capture engine before `setup`
   * runs). Override when you need to write storage for a different
   * origin (e.g. an embedded auth domain).
   */
  origin?: string;
}
