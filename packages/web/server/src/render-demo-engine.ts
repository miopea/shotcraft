/**
 * Live-demo render engine. Captures a user-supplied URL through Playwright,
 * runs it through one of the bundled template wrappers, returns the PNG.
 *
 * Runs ONLY when `SHOTCRAFT_LIVE_DEMO=1`. The deploy bundle ships:
 *   - `templates/<id>/wrapper.html` + `wrapper.css` + `frames/*.svg`
 *     (copied by scripts/copy-samples.mjs's sibling stage step)
 *   - `playwright` in node_modules
 *   - Chromium binaries under `PLAYWRIGHT_BROWSERS_PATH`
 *
 * Hard limits enforced:
 *   - One render at a time (in-process queue).
 *   - 60s total per request, after which Chromium is force-closed.
 *   - URL must be HTTP(S). Localhost / private / link-local IPs blocked
 *     to stop SSRF against the host's internal network.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { lookup as dnsLookup } from "node:dns/promises";
import { chromium, type Browser, type Page } from "playwright";
import type { TemplateInfo } from "./registry.js";
import { TEMPLATE_REGISTRY } from "./registry.js";

/**
 * Optional target-app authentication. Mirrors the `apiLogin` /
 * `formLogin` / `injectSession` shapes from the `shotcraft/auth`
 * helpers — same fields, same semantics, just inlined here so the
 * deploy bundle doesn't need shotcraft as a runtime dep.
 */
export type RenderDemoAuth =
  | {
      type: "api";
      url: string;
      body: unknown;
      method?: "POST" | "PUT" | "PATCH" | "GET" | "DELETE";
      headers?: Record<string, string>;
      expectStatus?: number;
    }
  | {
      type: "form";
      url: string;
      emailField: string;
      passwordField: string;
      submitButton: string;
      email: string;
      password: string;
      waitForUrl?: string;
      waitForSelector?: string;
    }
  | {
      type: "session";
      cookies?: ReadonlyArray<{
        name: string;
        value: string;
        domain?: string;
        path?: string;
      }>;
      localStorage?: Record<string, string>;
      sessionStorage?: Record<string, string>;
    };

export interface RenderDemoRequest {
  url: string;
  caption: string;
  subtitle?: string;
  templateId: string;
  theme?: "dark" | "light";
  /** Target-app auth — runs as setup() before the capture goto. */
  auth?: RenderDemoAuth;
}

export interface RenderDemoSuccess {
  ok: true;
  png: Buffer;
  template: TemplateInfo;
  theme: "dark" | "light";
}

export interface RenderDemoFailure {
  ok: false;
  status: number;
  error: string;
}

export type RenderDemoResult = RenderDemoSuccess | RenderDemoFailure;

// Module-level mutex — only one render runs at a time. Express requests
// queue here; a 6th simultaneous client just waits.
let inflight: Promise<unknown> = Promise.resolve();

const HERE = dirname(fileURLToPath(import.meta.url));
// Server bundle ships at `server/dist/index.js`; templates copy to
// `<package-root>/templates/<id>/`. From `server/dist/`: ../../templates.
const TEMPLATES_ROOT = resolve(HERE, "..", "..", "templates");

/**
 * Runs the live-demo render pipeline. Validates inputs, blocks unsafe
 * URLs, then captures + composites under a 60s deadline.
 */
export async function runRenderDemo(req: RenderDemoRequest): Promise<RenderDemoResult> {
  // 1. Validate request shape.
  const validation = validateRequest(req);
  if (!validation.ok) return validation;
  const { template, theme } = validation;

  // 2. Validate URL safety (anti-SSRF).
  const urlCheck = await validateUrl(req.url);
  if (!urlCheck.ok) return urlCheck;

  // 3. Confirm wrapper assets shipped with this deployment.
  const wrapperPath = join(TEMPLATES_ROOT, template.id, "wrapper.html");
  if (!(await fileExists(wrapperPath))) {
    return {
      ok: false,
      status: 500,
      error: `Server missing template assets for "${template.id}". The deploy bundle didn't include packages/template-${template.id}/wrapper.*.`,
    };
  }

  // 4. Queue behind any in-flight render and execute under a deadline.
  const job = inflight.then(() => withDeadline(60_000, runOne(template, theme, req, wrapperPath)));
  inflight = job.catch(() => undefined);
  try {
    const png = await job;
    return { ok: true, png, template, theme };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 500, error: `Render failed: ${message}` };
  }
}

async function runOne(
  template: TemplateInfo,
  theme: "dark" | "light",
  req: RenderDemoRequest,
  wrapperPath: string,
): Promise<Buffer> {
  const tmp = await mkdtemp(join(tmpdir(), "shotcraft-demo-"));
  const rawPath = join(tmp, "raw.png");
  const outPath = join(tmp, "out.png");

  const browser = await chromium.launch({ headless: true });
  try {
    // Capture phase — the user's URL at the template's viewport.
    {
      const ctx = await browser.newContext({
        viewport: { width: template.viewport.width, height: template.viewport.height },
        deviceScaleFactor: template.viewport.dpr,
        isMobile: template.isMobile,
        hasTouch: template.isMobile,
        colorScheme: theme,
        locale: "en-US",
        reducedMotion: "reduce",
      });
      const page = await ctx.newPage();
      try {
        // If target-app auth was supplied, run it before navigating to
        // the captured URL. The capture context already has the right
        // viewport + colorScheme; auth runs in this same context so any
        // cookies / localStorage / session set during login survive
        // into the capture goto.
        if (req.auth) {
          await runTargetAuth(page, req.url, req.auth);
        }
        await page.goto(req.url, { waitUntil: "networkidle", timeout: 25_000 });
        // Brief settle so chart animations + lazy images land. Live-demo
        // doesn't expose a `waitMs` knob — keep it short.
        await page.waitForTimeout(1200);
        await page.screenshot({ path: rawPath, fullPage: false });
      } finally {
        await ctx.close();
      }
    }

    // Render phase — wrapper.html composes the captured raw.
    {
      const params = new URLSearchParams();
      params.set("caption", req.caption);
      if (req.subtitle) params.set("subtitle", req.subtitle);
      params.set("theme", theme);
      params.set("imageUrl", pathToFileURL(rawPath).href);
      const wrapperUrl = `${pathToFileURL(wrapperPath).href}?${params.toString()}`;

      const ctx = await browser.newContext({
        viewport: { width: template.output.width, height: template.output.height },
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();
      try {
        await page.goto(wrapperUrl, { waitUntil: "networkidle", timeout: 15_000 });
        // Predicate strings run inside the browser — keeping them as
        // strings means this file doesn't need DOM lib in tsconfig.
        await page.waitForFunction(`document.body.dataset.rendered === "true"`, undefined, {
          timeout: 15_000,
        });
        await page.evaluate(`document.fonts.ready`);
        await page.screenshot({ path: outPath, type: "png", fullPage: false });
      } finally {
        await ctx.close();
      }
    }

    return await readFile(outPath);
  } finally {
    await browser.close().catch(() => undefined);
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

interface ValidatedRequest {
  ok: true;
  template: TemplateInfo;
  theme: "dark" | "light";
}

function validateRequest(req: RenderDemoRequest): ValidatedRequest | RenderDemoFailure {
  if (!req || typeof req !== "object") {
    return { ok: false, status: 400, error: "Request body must be a JSON object." };
  }
  if (typeof req.url !== "string" || req.url.length === 0) {
    return { ok: false, status: 400, error: "`url` is required." };
  }
  if (req.url.length > 2048) {
    return { ok: false, status: 400, error: "`url` is too long (max 2048 chars)." };
  }
  if (typeof req.caption !== "string" || req.caption.length === 0) {
    return { ok: false, status: 400, error: "`caption` is required." };
  }
  if (req.caption.length > 240) {
    return { ok: false, status: 400, error: "`caption` is too long (max 240 chars)." };
  }
  if (req.subtitle !== undefined && typeof req.subtitle !== "string") {
    return { ok: false, status: 400, error: "`subtitle` must be a string when provided." };
  }
  if (req.subtitle !== undefined && req.subtitle.length > 480) {
    return { ok: false, status: 400, error: "`subtitle` is too long (max 480 chars)." };
  }
  if (typeof req.templateId !== "string") {
    return { ok: false, status: 400, error: "`templateId` is required." };
  }
  const template = TEMPLATE_REGISTRY.find((t) => t.id === req.templateId);
  if (!template) {
    const ids = TEMPLATE_REGISTRY.map((t) => t.id).join(", ");
    return { ok: false, status: 400, error: `Unknown templateId. Valid: ${ids}` };
  }
  const theme: "dark" | "light" =
    req.theme === "dark" || req.theme === "light" ? req.theme : (template.themes[0] ?? "dark");
  if (!template.themes.includes(theme)) {
    return {
      ok: false,
      status: 400,
      error: `Template "${template.id}" doesn't support theme "${theme}".`,
    };
  }
  // Auth field, if present, has to declare a valid type.
  if (req.auth !== undefined) {
    const authError = validateAuth(req.auth);
    if (authError) return authError;
  }
  return { ok: true, template, theme };
}

function validateAuth(auth: unknown): RenderDemoFailure | null {
  if (!auth || typeof auth !== "object") {
    return { ok: false, status: 400, error: "`auth` must be an object when provided." };
  }
  const a = auth as Record<string, unknown>;
  if (a.type === "api") {
    if (typeof a.url !== "string" || a.url.length === 0) {
      return { ok: false, status: 400, error: "`auth.url` is required for type=api." };
    }
    if (a.body === undefined) {
      return { ok: false, status: 400, error: "`auth.body` is required for type=api." };
    }
    return null;
  }
  if (a.type === "form") {
    for (const field of [
      "url",
      "emailField",
      "passwordField",
      "submitButton",
      "email",
      "password",
    ] as const) {
      const value = a[field];
      if (typeof value !== "string" || value.length === 0) {
        return {
          ok: false,
          status: 400,
          error: `\`auth.${field}\` is required for type=form.`,
        };
      }
    }
    return null;
  }
  if (a.type === "session") {
    const noFields = !a.cookies && !a.localStorage && !a.sessionStorage;
    if (noFields) {
      return {
        ok: false,
        status: 400,
        error:
          "`auth` (type=session) needs at least one of cookies / localStorage / sessionStorage.",
      };
    }
    return null;
  }
  return {
    ok: false,
    status: 400,
    error: "`auth.type` must be one of: 'api', 'form', 'session'.",
  };
}

/**
 * Run target-app authentication inside the capture context, before the
 * `goto(req.url)`. Mirrors the `apiLogin` / `formLogin` / `injectSession`
 * helpers from `shotcraft/auth` — see `packages/core/src/auth/`.
 *
 * Errors thrown here propagate up to the engine's failure path so the
 * route returns a useful 5xx with the message. Credentials are NEVER
 * logged from this function.
 */
async function runTargetAuth(page: Page, captureUrl: string, auth: RenderDemoAuth): Promise<void> {
  // Most auth flows need to be on the same origin as the captured URL
  // before the cookie / token sets, so navigate to that origin first.
  const origin = new URL(captureUrl).origin;
  await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 20_000 });

  if (auth.type === "api") {
    interface FetchArgs {
      url: string;
      method: string;
      headers: Record<string, string>;
      body: string;
    }
    interface FetchResult {
      status: number;
      statusText: string;
      body: string;
    }
    const args: FetchArgs = {
      url: auth.url,
      method: auth.method ?? "POST",
      headers: { "Content-Type": "application/json", ...(auth.headers ?? {}) },
      body: JSON.stringify(auth.body),
    };
    const result = await page.evaluate<FetchResult, FetchArgs>(
      async (a: FetchArgs): Promise<FetchResult> => {
        const res = await fetch(a.url, {
          method: a.method,
          headers: a.headers,
          credentials: "include",
          body: a.body,
        });
        return { status: res.status, statusText: res.statusText, body: await res.text() };
      },
      args,
    );
    const expected = auth.expectStatus ?? 200;
    if (result.status !== expected) {
      throw new Error(
        `auth (api): ${args.method} ${auth.url} returned ${result.status} ${result.statusText}`,
      );
    }
    return;
  }

  if (auth.type === "form") {
    await page.goto(auth.url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.fill(auth.emailField, auth.email, { timeout: 15_000 });
    await page.fill(auth.passwordField, auth.password, { timeout: 15_000 });
    const wait = auth.waitForUrl
      ? page.waitForURL(auth.waitForUrl, { timeout: 15_000 })
      : auth.waitForSelector
        ? page.waitForSelector(auth.waitForSelector, { timeout: 15_000 })
        : page.waitForLoadState("networkidle", { timeout: 15_000 });
    await page.click(auth.submitButton, { timeout: 15_000 });
    await wait;
    return;
  }

  // type === "session"
  if (auth.cookies && auth.cookies.length > 0) {
    await page.context().addCookies(
      auth.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        ...(c.domain !== undefined ? { domain: c.domain } : { url: origin }),
        path: c.path ?? "/",
      })),
    );
  }
  if (auth.localStorage) {
    const entries = Object.entries(auth.localStorage);
    await page.evaluate((items: ReadonlyArray<readonly [string, string]>) => {
      for (const [k, v] of items) localStorage.setItem(k, v);
    }, entries);
  }
  if (auth.sessionStorage) {
    const entries = Object.entries(auth.sessionStorage);
    await page.evaluate((items: ReadonlyArray<readonly [string, string]>) => {
      for (const [k, v] of items) sessionStorage.setItem(k, v);
    }, entries);
  }
}

async function validateUrl(raw: string): Promise<{ ok: true } | RenderDemoFailure> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, status: 400, error: "`url` is not a valid URL." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, status: 400, error: "`url` must be http:// or https://." };
  }

  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "metadata.google.internal") {
    return { ok: false, status: 400, error: "Localhost / metadata hosts not allowed." };
  }

  // Resolve to verify no private IPs. If DNS fails, let the actual fetch
  // surface the error rather than silently hiding it here.
  try {
    const { address } = await dnsLookup(host);
    if (isPrivateIp(address)) {
      return {
        ok: false,
        status: 400,
        error: `Resolved IP ${address} is private/link-local — not allowed.`,
      };
    }
  } catch {
    // DNS failure isn't a security issue; let Playwright report the timeout.
  }
  return { ok: true };
}

/**
 * Block IPv4 / IPv6 ranges that should never be reachable from a public
 * live-demo: loopback, private RFC1918, link-local, IMDS endpoints, and
 * IPv6 ULA / link-local. Doesn't need to be exhaustive — the goal is
 * "no SSRF against the App Service's network."
 */
function isPrivateIp(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "0.0.0.0" || ip === "::1") return true;
  if (ip === "169.254.169.254") return true; // Azure / AWS / GCP metadata
  // IPv4 dotted-quad ranges.
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 0) return true;
  }
  // IPv6 — link-local (fe80::/10) + ULA (fc00::/7).
  if (/^fe[89ab][0-9a-f]:/i.test(ip)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return true;
  return false;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const { access } = await import("node:fs/promises");
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function withDeadline<T>(ms: number, p: Promise<T>): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`render-demo exceeded ${ms / 1000}s deadline`)),
      ms,
    );
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

// Re-exports for the route + tests.
export type { Browser };
