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

/**
 * Per-screen action — runs inside the captured page after `goto()`,
 * before the screenshot. A small, safe subset of Playwright that the
 * engine knows how to drive.
 */
export type ScreenAction =
  | { type: "click"; selector: string; timeoutMs?: number }
  | { type: "fill"; selector: string; value: string; timeoutMs?: number }
  | { type: "press"; selector: string; key: string; timeoutMs?: number }
  | { type: "wait"; ms: number }
  | { type: "waitForSelector"; selector: string; timeoutMs?: number }
  | { type: "waitForUrl"; url: string; timeoutMs?: number }
  | { type: "scroll"; selector?: string; y?: number };

const MAX_ACTIONS = 20;

export interface RenderDemoRequest {
  url: string;
  caption: string;
  subtitle?: string;
  templateId: string;
  theme?: "dark" | "light";
  /** Target-app auth — runs as setup() before the capture goto. */
  auth?: RenderDemoAuth;
  /** Optional script — click/fill/wait between goto and screenshot. */
  actions?: ReadonlyArray<ScreenAction>;
  /** Run after goto, before per-screen actions (dismiss tour, etc.). */
  setupActions?: ReadonlyArray<ScreenAction>;
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
  const browser = await chromium.launch({ headless: true });
  try {
    const raw = await captureWithBrowser(browser, {
      url: req.url,
      viewport: template.viewport,
      isMobile: template.isMobile,
      theme,
      ...(req.auth ? { auth: req.auth } : {}),
      ...(req.actions ? { actions: req.actions } : {}),
      ...(req.setupActions ? { setupActions: req.setupActions } : {}),
      waitMs: 1200,
    });
    return await composeWithBrowser(browser, {
      raw,
      wrapperPath,
      output: template.output,
      caption: req.caption,
      ...(req.subtitle !== undefined ? { subtitle: req.subtitle } : {}),
      theme,
    });
  } finally {
    await browser.close().catch(() => undefined);
  }
}

// ---------------------------------------------------------------------------
// Standalone capture + compose — used by the Crawler page's two-step flow.
// Each entry point queues behind the same in-flight mutex used by
// `runRenderDemo`, so a Crawler session and a single-shot demo render
// never compete for Chromium.
// ---------------------------------------------------------------------------

export interface CaptureScreenRequest {
  url: string;
  viewport: { width: number; height: number; dpr: number };
  isMobile?: boolean;
  theme?: "dark" | "light";
  auth?: RenderDemoAuth;
  /** Extra ms to wait after `networkidle` (chart animations, etc.). */
  waitMs?: number;
  /** Optional script: run these in order after goto, before screenshot. */
  actions?: ReadonlyArray<ScreenAction>;
  /**
   * Actions that run AFTER goto but BEFORE per-screen `actions` —
   * used for one-time-per-session things like dismissing tour modals
   * or accepting cookie banners. Each capture uses a fresh browser
   * context, so any "remember I dismissed this" state stored in
   * localStorage is lost — setup needs to re-run per capture.
   */
  setupActions?: ReadonlyArray<ScreenAction>;
}

export interface ComposeScreenRequest {
  raw: Buffer;
  templateId: string;
  caption: string;
  subtitle?: string;
  theme?: "dark" | "light";
}

export type EngineResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string; errorScreenshot?: string };

/**
 * Thrown by `runTargetAuth` when login submitted but the page is
 * still on the login screen. Carries a base64 screenshot of what
 * the page looks like at failure time so the user can SEE what the
 * engine couldn't get past (CAPTCHA, error toast, 2FA prompt, etc.).
 */
export class AuthFailureError extends Error {
  screenshotBase64?: string;
  constructor(message: string, screenshotBase64?: string) {
    super(message);
    this.name = "AuthFailureError";
    if (screenshotBase64) this.screenshotBase64 = screenshotBase64;
  }
}

/**
 * Capture-only entry point. No template composition — returns the raw
 * screenshot at the given viewport. Same SSRF + auth semantics as the
 * full pipeline.
 */
export async function captureScreen(req: CaptureScreenRequest): Promise<EngineResult<Buffer>> {
  if (!req || typeof req !== "object") {
    return { ok: false, status: 400, error: "Request must be a JSON object." };
  }
  if (typeof req.url !== "string" || req.url.length === 0) {
    return { ok: false, status: 400, error: "`url` is required." };
  }
  if (
    !req.viewport ||
    typeof req.viewport.width !== "number" ||
    typeof req.viewport.height !== "number" ||
    typeof req.viewport.dpr !== "number"
  ) {
    return { ok: false, status: 400, error: "`viewport` must be { width, height, dpr } numbers." };
  }
  if (req.auth) {
    const authError = validateAuth(req.auth);
    if (authError) return authError;
  }
  if (req.actions !== undefined) {
    const actionsError = validateActions(req.actions);
    if (actionsError) return actionsError;
  }
  if (req.setupActions !== undefined) {
    const setupErr = validateActions(req.setupActions);
    if (setupErr) return setupErr;
  }
  const urlCheck = await validateUrl(req.url);
  if (!urlCheck.ok) return urlCheck;

  const job = inflight.then(() => withDeadline(60_000, runCapture(req)));
  inflight = job.catch(() => undefined);
  try {
    const value = await job;
    return { ok: true, value };
  } catch (err) {
    const screenshot =
      err instanceof AuthFailureError && err.screenshotBase64 ? err.screenshotBase64 : undefined;
    return {
      ok: false,
      status: 500,
      error: `capture failed: ${err instanceof Error ? err.message : String(err)}`,
      ...(screenshot ? { errorScreenshot: screenshot } : {}),
    };
  }
}

/**
 * Render-only entry point. Takes a previously-captured raw + template id
 * + caption, returns the composite. No external URL hits — no SSRF check
 * needed.
 */
export async function composeScreen(req: ComposeScreenRequest): Promise<EngineResult<Buffer>> {
  if (!req || typeof req !== "object") {
    return { ok: false, status: 400, error: "Request must be a JSON object." };
  }
  if (!Buffer.isBuffer(req.raw) || req.raw.length === 0) {
    return { ok: false, status: 400, error: "`raw` PNG buffer is required." };
  }
  if (typeof req.caption !== "string" || req.caption.length === 0) {
    return { ok: false, status: 400, error: "`caption` is required." };
  }
  if (req.caption.length > 240) {
    return { ok: false, status: 400, error: "`caption` is too long (max 240)." };
  }
  if (req.subtitle !== undefined && req.subtitle.length > 480) {
    return { ok: false, status: 400, error: "`subtitle` is too long (max 480)." };
  }
  const template = TEMPLATE_REGISTRY.find((t) => t.id === req.templateId);
  if (!template) {
    return { ok: false, status: 400, error: `Unknown templateId: ${String(req.templateId)}` };
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
  const wrapperPath = join(TEMPLATES_ROOT, template.id, "wrapper.html");
  if (!(await fileExists(wrapperPath))) {
    return {
      ok: false,
      status: 500,
      error: `Server missing template assets for "${template.id}".`,
    };
  }

  const job = inflight.then(() =>
    withDeadline(45_000, runCompose(template, theme, wrapperPath, req)),
  );
  inflight = job.catch(() => undefined);
  try {
    const value = await job;
    return { ok: true, value };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: `compose failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function runCapture(req: CaptureScreenRequest): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    return await captureWithBrowser(browser, req);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function runCompose(
  template: TemplateInfo,
  theme: "dark" | "light",
  wrapperPath: string,
  req: ComposeScreenRequest,
): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  try {
    return await composeWithBrowser(browser, {
      raw: req.raw,
      wrapperPath,
      output: template.output,
      caption: req.caption,
      ...(req.subtitle !== undefined ? { subtitle: req.subtitle } : {}),
      theme,
    });
  } finally {
    await browser.close().catch(() => undefined);
  }
}

interface CaptureWithBrowserArgs {
  url: string;
  viewport: { width: number; height: number; dpr: number };
  isMobile?: boolean;
  theme?: "dark" | "light";
  auth?: RenderDemoAuth;
  waitMs?: number;
  actions?: ReadonlyArray<ScreenAction>;
  setupActions?: ReadonlyArray<ScreenAction>;
}

async function captureWithBrowser(browser: Browser, args: CaptureWithBrowserArgs): Promise<Buffer> {
  const tmp = await mkdtemp(join(tmpdir(), "shotcraft-cap-"));
  const rawPath = join(tmp, "raw.png");
  try {
    const ctx = await browser.newContext({
      viewport: { width: args.viewport.width, height: args.viewport.height },
      deviceScaleFactor: args.viewport.dpr,
      isMobile: args.isMobile ?? false,
      hasTouch: args.isMobile ?? false,
      colorScheme: args.theme ?? "dark",
      locale: "en-US",
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    try {
      if (args.auth) {
        await runTargetAuth(page, args.url, args.auth);
      }
      await page.goto(args.url, { waitUntil: "networkidle", timeout: 25_000 });
      // Run setup actions first (dismiss tour modal, accept cookie
      // banner, etc.) — these apply to every screen because each
      // capture uses a fresh browser context with empty localStorage.
      if (args.setupActions && args.setupActions.length > 0) {
        try {
          await runActions(page, args.setupActions);
        } catch (err) {
          throw new Error(`setupActions: ${err instanceof Error ? err.message : String(err)}`, {
            cause: err,
          });
        }
      }
      // Run user-supplied actions (click / fill / wait / etc.) between
      // navigation and screenshot so the Crawler can drive into modals,
      // search results, multi-step flows.
      if (args.actions && args.actions.length > 0) {
        await runActions(page, args.actions);
      }
      await page.waitForTimeout(args.waitMs ?? 1200);
      await page.screenshot({ path: rawPath, fullPage: false });
    } finally {
      await ctx.close();
    }
    return await readFile(rawPath);
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function runActions(page: Page, actions: ReadonlyArray<ScreenAction>): Promise<void> {
  for (const [i, action] of actions.entries()) {
    try {
      await runOneAction(page, action);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`actions[${i}] (${action.type}) failed: ${msg}`, { cause: err });
    }
  }
}

async function runOneAction(page: Page, action: ScreenAction): Promise<void> {
  if (action.type === "click") {
    await page.click(action.selector, { timeout: action.timeoutMs ?? 10_000 });
    return;
  }
  if (action.type === "fill") {
    await page.fill(action.selector, action.value, { timeout: action.timeoutMs ?? 10_000 });
    return;
  }
  if (action.type === "press") {
    await page.press(action.selector, action.key, { timeout: action.timeoutMs ?? 10_000 });
    return;
  }
  if (action.type === "wait") {
    await page.waitForTimeout(action.ms);
    return;
  }
  if (action.type === "waitForSelector") {
    await page.waitForSelector(action.selector, { timeout: action.timeoutMs ?? 10_000 });
    return;
  }
  if (action.type === "waitForUrl") {
    await page.waitForURL(action.url, { timeout: action.timeoutMs ?? 10_000 });
    return;
  }
  // scroll
  if (action.selector) {
    await page.locator(action.selector).scrollIntoViewIfNeeded({ timeout: 10_000 });
  } else if (typeof action.y === "number") {
    await page.evaluate(`window.scrollTo(0, ${action.y})`);
  }
}

export function validateActions(raw: ReadonlyArray<unknown>): RenderDemoFailure | null {
  if (!Array.isArray(raw)) {
    return { ok: false, status: 400, error: "`actions` must be an array." };
  }
  if (raw.length > MAX_ACTIONS) {
    return { ok: false, status: 400, error: `Too many actions (max ${MAX_ACTIONS}).` };
  }
  for (let i = 0; i < raw.length; i++) {
    const a: unknown = raw[i];
    if (!a || typeof a !== "object") {
      return { ok: false, status: 400, error: `actions[${i}] must be an object.` };
    }
    const obj = a as Record<string, unknown>;
    const t = obj.type;
    if (typeof t !== "string") {
      return { ok: false, status: 400, error: `actions[${i}].type is required.` };
    }
    if (t === "click" || t === "waitForSelector") {
      if (typeof obj.selector !== "string" || obj.selector.length === 0) {
        return { ok: false, status: 400, error: `actions[${i}] (${t}) needs \`selector\`.` };
      }
      continue;
    }
    if (t === "fill") {
      if (typeof obj.selector !== "string" || typeof obj.value !== "string") {
        return {
          ok: false,
          status: 400,
          error: `actions[${i}] (fill) needs \`selector\` and \`value\` strings.`,
        };
      }
      continue;
    }
    if (t === "press") {
      if (typeof obj.selector !== "string" || typeof obj.key !== "string") {
        return {
          ok: false,
          status: 400,
          error: `actions[${i}] (press) needs \`selector\` and \`key\` strings.`,
        };
      }
      continue;
    }
    if (t === "wait") {
      if (typeof obj.ms !== "number" || obj.ms < 0 || obj.ms > 30_000) {
        return { ok: false, status: 400, error: `actions[${i}] (wait).ms must be 0..30000.` };
      }
      continue;
    }
    if (t === "waitForUrl") {
      if (typeof obj.url !== "string" || obj.url.length === 0) {
        return { ok: false, status: 400, error: `actions[${i}] (waitForUrl) needs \`url\`.` };
      }
      continue;
    }
    if (t === "scroll") {
      const okSelector = typeof obj.selector === "string" || obj.selector === undefined;
      const okY = typeof obj.y === "number" || obj.y === undefined;
      if (!okSelector || !okY) {
        return {
          ok: false,
          status: 400,
          error: `actions[${i}] (scroll) needs \`selector\` (string) or \`y\` (number).`,
        };
      }
      continue;
    }
    return {
      ok: false,
      status: 400,
      error: `actions[${i}].type "${t}" not supported. Allowed: click, fill, press, wait, waitForSelector, waitForUrl, scroll.`,
    };
  }
  return null;
}

interface ComposeWithBrowserArgs {
  raw: Buffer;
  wrapperPath: string;
  output: { width: number; height: number };
  caption: string;
  subtitle?: string;
  theme: "dark" | "light";
}

async function composeWithBrowser(browser: Browser, args: ComposeWithBrowserArgs): Promise<Buffer> {
  const tmp = await mkdtemp(join(tmpdir(), "shotcraft-compose-"));
  const rawPath = join(tmp, "raw.png");
  const outPath = join(tmp, "out.png");
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(rawPath, args.raw);

    const params = new URLSearchParams();
    params.set("caption", args.caption);
    if (args.subtitle) params.set("subtitle", args.subtitle);
    params.set("theme", args.theme);
    params.set("imageUrl", pathToFileURL(rawPath).href);
    const wrapperUrl = `${pathToFileURL(args.wrapperPath).href}?${params.toString()}`;

    const ctx = await browser.newContext({
      viewport: { width: args.output.width, height: args.output.height },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(wrapperUrl, { waitUntil: "networkidle", timeout: 15_000 });
      await page.waitForFunction(`document.body.dataset.rendered === "true"`, undefined, {
        timeout: 15_000,
      });
      await page.evaluate(`document.fonts.ready`);
      await page.screenshot({ path: outPath, type: "png", fullPage: false });
    } finally {
      await ctx.close();
    }
    return await readFile(outPath);
  } finally {
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
    // Allow relative URLs like "/login" — resolve against the capture
    // origin so users don't have to type the full host twice.
    const formUrl = new URL(auth.url, origin).toString();
    await page.goto(formUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await fillFirstMatch(page, "email", auth.emailField, auth.email, EMAIL_FALLBACK_SELECTORS);
    await fillFirstMatch(
      page,
      "password",
      auth.passwordField,
      auth.password,
      PASSWORD_FALLBACK_SELECTORS,
    );
    await clickFirstMatch(page, "submit", auth.submitButton, SUBMIT_FALLBACK_SELECTORS);

    // Wait for the auth flow to actually finish. Race several signals
    // — first to resolve wins, then a settle period for SPA renders:
    //   1. URL changes away from the login URL (multi-page apps redirect)
    //   2. Password field becomes hidden or removed from the DOM
    //   3. User-supplied waitForUrl glob matches
    //   4. User-supplied waitForSelector matches
    //
    // `networkidle` deliberately NOT in the race: it's misleading for
    // SPAs with active analytics/polling that transition without a URL
    // change. networkidle can resolve during a brief lull while React
    // is mid-transition, leading us to false-flag "still on login".
    const beforeUrl = page.url();
    const AUTH_WAIT_MS = 30_000;
    const waiters: Promise<unknown>[] = [
      page
        .waitForURL((u) => u.toString() !== beforeUrl, { timeout: AUTH_WAIT_MS })
        .catch(() => null),
      page
        .waitForFunction(
          // Password field hidden (display:none / removed from layout)
          // OR fully removed from the DOM.
          `(() => {
            const el = document.querySelector('input[type=password]');
            return !el || el.offsetParent === null;
          })()`,
          { timeout: AUTH_WAIT_MS },
        )
        .catch(() => null),
    ];
    if (auth.waitForUrl) {
      waiters.push(page.waitForURL(auth.waitForUrl, { timeout: AUTH_WAIT_MS }).catch(() => null));
    }
    if (auth.waitForSelector) {
      waiters.push(
        page.waitForSelector(auth.waitForSelector, { timeout: AUTH_WAIT_MS }).catch(() => null),
      );
    }
    await Promise.race(waiters);
    // 2-second settle: React state updates + portal renders + any
    // post-auth modal mount need a real beat. 500ms was tight enough
    // to mid-sample BudgetBug's transition and false-flag failure.
    await page.waitForTimeout(2_000);

    // Detect silent auth failure: if we're still on the login URL AND
    // there's still a *visible* password field, the submit didn't
    // succeed. We check visibility (not just DOM presence) because
    // SPAs sometimes leave the login form mounted but hidden after
    // auth completes — the user is on the dashboard but a hidden
    // password node is still in the DOM tree.
    const afterUrl = page.url();
    const stillOnLogin =
      afterUrl === formUrl ||
      new URL(afterUrl).pathname === new URL(formUrl).pathname ||
      /[/?]login/i.test(afterUrl);
    if (stillOnLogin) {
      // `.first().isVisible()` returns false for elements with
      // offsetParent === null (display:none, hidden ancestor, etc.) —
      // matches our wait condition above.
      const hasVisiblePassword = await page
        .locator('input[type="password"]')
        .first()
        .isVisible()
        .catch(() => false);
      if (hasVisiblePassword) {
        // Scrape visible error text from the page so the user sees
        // exactly what the login form is complaining about: "Invalid
        // email or password", "Account locked", etc.
        const visibleError = await scrapeVisibleAuthError(page);
        // Diagnostic dump: page title + visible buttons + inputs.
        const diagnostic = await scrapeLoginDiagnostic(page);
        // Screenshot of the failed-login page state — the user can
        // see CAPTCHA modals / off-DOM error toasts / Cloudflare
        // challenges that the DOM scrape missed.
        const screenshot = await page
          .screenshot({ fullPage: false, type: "png" })
          .then((buf) => buf.toString("base64"))
          .catch(() => undefined);
        const errLine = visibleError ? `Page shows: "${visibleError}". ` : ``;
        throw new AuthFailureError(
          `auth (form): submitted login but page is still on ${new URL(afterUrl).pathname} ` +
            `with a password field present. ${errLine}\n\n${diagnostic}\n\n` +
            `If the submit button text says "Please wait..." or similar loading state, the ` +
            `auth POST is failing silently — likely cause: bot/captcha detection, server-side ` +
            `error, or the form needs a CSRF token. See the screenshot for what the page ` +
            `actually looks like. Workaround: switch auth mode to "session" and paste cookies ` +
            `from a manual browser login.`,
          screenshot,
        );
      }
    }
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

/**
 * Form-login resilience — when the user's chosen selector misses
 * (e.g. they kept the default `input[name=email]` but their app uses
 * `input[type=email]`), fall back through a list of common shapes
 * before failing. The error message names every selector we tried so
 * the user knows what to fix.
 */
const EMAIL_FALLBACK_SELECTORS: ReadonlyArray<string> = [
  'input[type="email"]',
  'input[name="email"]',
  'input[name="username"]',
  'input[name="user"]',
  'input[name="login"]',
  "input#email",
  "input#username",
  'input[autocomplete="username"]',
  'input[autocomplete="email"]',
];
const PASSWORD_FALLBACK_SELECTORS: ReadonlyArray<string> = [
  'input[type="password"]',
  'input[name="password"]',
  'input[name="pass"]',
  "input#password",
  'input[autocomplete="current-password"]',
];
const SUBMIT_FALLBACK_SELECTORS: ReadonlyArray<string> = [
  'button[type="submit"]',
  'input[type="submit"]',
  "form button",
  "[data-testid*=login i]",
  "[data-testid*=signin i]",
  // React-style buttons without type=submit, identified by text. Playwright's
  // text= selector matches case-insensitive substring by default.
  'button:has-text("Sign in")',
  'button:has-text("Log in")',
  'button:has-text("Login")',
  'button:has-text("Continue")',
  'button:has-text("Submit")',
];

/**
 * Look for visible "Invalid credentials" / "Account locked" / etc.
 * messages on a failed-login page. Checks common error-display
 * patterns (role=alert, [aria-live], common Tailwind/Bootstrap error
 * classes). Returns the first non-empty match, capped to 200 chars.
 */
/**
 * Diagnostic dump for failed form auth. Returns a multi-line string
 * with: page title, current URL, all visible buttons + their labels,
 * any input fields (so the user can see if there's a hidden CAPTCHA
 * or a 2FA prompt). Helps the user pick the right submit selector
 * without having to inspect the live page in DevTools.
 */
export async function scrapeLoginDiagnostic(page: Page): Promise<string> {
  const result: unknown = await page
    .evaluate(
      `
      (() => {
        const out = {
          title: document.title,
          url: location.href,
          buttons: [],
          inputs: [],
        };
        const seenBtnText = new Set();
        for (const b of document.querySelectorAll('button, input[type=submit]')) {
          if (b.offsetParent === null) continue;
          const t = (b.textContent || b.value || '').trim();
          if (!t || t.length > 80) continue;
          if (seenBtnText.has(t)) continue;
          seenBtnText.add(t);
          out.buttons.push({
            text: t,
            type: b.getAttribute('type') || 'button',
            id: b.id || null,
            testid: b.getAttribute('data-testid') || null,
            classes: b.className.toString().slice(0, 80) || null,
          });
          if (out.buttons.length >= 8) break;
        }
        for (const i of document.querySelectorAll('input')) {
          if (i.offsetParent === null) continue;
          const t = i.getAttribute('type') || 'text';
          if (t === 'hidden') continue;
          out.inputs.push({
            type: t,
            name: i.getAttribute('name') || null,
            placeholder: i.getAttribute('placeholder') || null,
            id: i.id || null,
          });
          if (out.inputs.length >= 6) break;
        }
        return out;
      })()
    `,
    )
    .catch(() => null);

  if (!result || typeof result !== "object") {
    return "Could not extract page diagnostic.";
  }
  const r = result as {
    title?: unknown;
    url?: unknown;
    buttons?: unknown;
    inputs?: unknown;
  };
  const lines: string[] = [];
  if (typeof r.title === "string") lines.push(`Page title: "${r.title}"`);
  if (typeof r.url === "string") lines.push(`Current URL: ${r.url}`);
  if (Array.isArray(r.buttons) && r.buttons.length > 0) {
    lines.push(`Visible buttons (${r.buttons.length}):`);
    for (const b of r.buttons) {
      if (!b || typeof b !== "object") continue;
      const obj = b as Record<string, unknown>;
      const sel: string[] = [];
      if (typeof obj.testid === "string") sel.push(`[data-testid="${obj.testid}"]`);
      if (typeof obj.id === "string" && obj.id.length > 0) sel.push(`#${obj.id}`);
      if (typeof obj.text === "string")
        sel.push(`button:has-text("${obj.text.replace(/"/g, '\\"')}")`);
      lines.push(`  • "${String(obj.text)}" (type=${String(obj.type)}) → ${sel.join(" or ")}`);
    }
  }
  if (Array.isArray(r.inputs) && r.inputs.length > 0) {
    lines.push(`Visible inputs:`);
    for (const i of r.inputs) {
      if (!i || typeof i !== "object") continue;
      const obj = i as Record<string, unknown>;
      lines.push(
        `  • type=${String(obj.type)}, name=${String(obj.name)}, placeholder=${String(obj.placeholder)}`,
      );
    }
  }
  return lines.join("\n");
}

export async function scrapeVisibleAuthError(page: Page): Promise<string | null> {
  const result: unknown = await page
    .evaluate(
      `
      (() => {
        const selectors = [
          '[role="alert"]',
          '[aria-live="polite"]',
          '[aria-live="assertive"]',
          '.error',
          '.error-message',
          '.alert-error',
          '.alert-danger',
          '.text-red-500',
          '.text-red-600',
          '.text-red-700',
          '.text-destructive',
          '[data-testid*="error" i]',
          'form .text-sm.text-red-500',
        ];
        for (const sel of selectors) {
          for (const el of document.querySelectorAll(sel)) {
            if (el.offsetParent === null) continue;
            const t = (el.textContent || '').trim();
            if (t && t.length > 2 && t.length < 500) return t.slice(0, 200);
          }
        }
        return null;
      })()
    `,
    )
    .catch(() => null);
  return typeof result === "string" && result.length > 0 ? result : null;
}

export async function fillFirstMatch(
  page: Page,
  fieldName: string,
  primary: string,
  value: string,
  fallbacks: ReadonlyArray<string>,
): Promise<void> {
  const selectors = [primary, ...fallbacks.filter((s) => s !== primary)];
  const tried: string[] = [];
  for (const sel of selectors) {
    tried.push(sel);
    try {
      const locator = page.locator(sel).first();
      // Focus by clicking first — also confirms the selector matches
      // a real visible element. Tighter timeout for fallback selectors
      // so the worst-case total stays under ~6s.
      await locator.click({ timeout: sel === primary ? 4_000 : 1_500 });
      // Clear any pre-filled value (browser autocomplete, etc.).
      await locator.fill("", { timeout: 2_000 });
      // Type with real keystrokes. `page.fill()` programmatically sets
      // the DOM value and dispatches an `input` event, but some React
      // controlled-input setups don't react to that — internal state
      // stays empty, the form submits with no credentials, and the
      // server silently rejects. pressSequentially fires the full
      // keydown/keypress/input/keyup sequence per character, which
      // every framework's onChange handler picks up.
      await locator.pressSequentially(value, { delay: 25 });
      return;
    } catch {
      // try next
    }
  }
  throw new Error(
    `auth (form): ${fieldName} field not found. Tried: ${tried.join(", ")}. ` +
      `Open the login page in DevTools and update the selector.`,
  );
}

export async function clickFirstMatch(
  page: Page,
  fieldName: string,
  primary: string,
  fallbacks: ReadonlyArray<string>,
): Promise<void> {
  const selectors = [primary, ...fallbacks.filter((s) => s !== primary)];
  const tried: string[] = [];
  for (const sel of selectors) {
    tried.push(sel);
    try {
      await page.click(sel, { timeout: sel === primary ? 4_000 : 1_500 });
      return;
    } catch {
      // try next
    }
  }
  throw new Error(
    `auth (form): ${fieldName} button not found. Tried: ${tried.join(", ")}. ` +
      `Update the selector to match your login form.`,
  );
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

  // Local mode (`shotcraft web` launched the server) is the operator
  // running this on their own machine — localhost / RFC1918 are valid
  // capture targets. Public deployments still get the SSRF guard.
  const allowLocal = process.env.SHOTCRAFT_ALLOW_LOCAL === "1";

  const host = parsed.hostname.toLowerCase();
  if (host === "metadata.google.internal") {
    return { ok: false, status: 400, error: "Cloud metadata hosts not allowed." };
  }
  if (!allowLocal && (host === "localhost" || host.endsWith(".localhost"))) {
    return { ok: false, status: 400, error: "Localhost not allowed in hosted mode." };
  }

  // Resolve to verify no private IPs. If DNS fails, let the actual fetch
  // surface the error rather than silently hiding it here.
  try {
    const { address } = await dnsLookup(host);
    if (!allowLocal && isPrivateIp(address)) {
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

/**
 * Auto-discovery: combine multiple route-finding techniques against a
 * start URL. Same-origin only (SSRF guard); 60s overall deadline shared
 * across all enabled techniques.
 *
 * Available techniques (each toggleable):
 *   - linkCrawl:    BFS `<a href>` links, the original v0.1 behavior.
 *   - sitemap:      GET /sitemap.xml; if present, parse <loc> entries.
 *   - commonRoutes: probe a list of standard SaaS paths
 *                   (/dashboard, /settings, /billing, ...).
 *   - navClick:     [coming in v0.2.x] click buttons inside <nav> /
 *                   header / sidebar to surface React-Router-style
 *                   non-anchor routes.
 *
 * Modal-state crawling (clicking buttons on a single page to surface
 * dialog states) is opt-in per-screen via `discoverable: true` in the
 * config; not part of this orchestrator.
 */
export interface DiscoverRequest {
  url: string;
  maxDepth?: number;
  maxPages?: number;
  auth?: RenderDemoAuth;
  techniques?: DiscoverTechniques;
  /** Override for `commonRoutes` probe list. Defaults to COMMON_ROUTES. */
  commonRouteList?: ReadonlyArray<string>;
  /**
   * Actions to run once after auth (or after initial nav if no auth)
   * before discovery techniques run. Use this to dismiss tour modals,
   * accept cookie banners, click past onboarding, etc. — anything
   * that's covering the actual UI you want to crawl.
   *
   * Same shape as per-screen `actions`: click / fill / press / wait
   * / waitForSelector / waitForUrl / scroll.
   */
  setupActions?: ReadonlyArray<ScreenAction>;
}

export interface DiscoverTechniques {
  linkCrawl?: boolean;
  sitemap?: boolean;
  commonRoutes?: boolean;
  navClick?: boolean;
}

export interface DiscoveredRoute {
  path: string;
  title: string;
  depth: number;
  source: "link" | "sitemap" | "common" | "nav";
}

export interface DiscoverSummary {
  /** Which URL each technique actually crawled from (post-auth). */
  startUrl: string;
  /** Number of routes contributed by each technique (pre-dedup). */
  perTechnique: { link: number; sitemap: number; common: number; nav: number };
  /** Number of routes after dedup (matches the returned routes length). */
  finalCount: number;
  /** Base64 PNG of the page state after all techniques finished. */
  finalScreenshot?: string;
}

export interface DiscoverResult {
  routes: DiscoveredRoute[];
  summary: DiscoverSummary;
}

/**
 * Default probe list for the `commonRoutes` technique. These are paths
 * a typical SaaS app exposes; we GET each one through the page's auth
 * context and keep the 200/30x ones.
 */
const COMMON_ROUTES: ReadonlyArray<string> = [
  "/",
  "/dashboard",
  "/home",
  "/settings",
  "/profile",
  "/account",
  "/billing",
  "/about",
  "/pricing",
  "/login",
  "/signup",
  "/help",
  "/docs",
  "/admin",
  "/team",
  "/projects",
  "/notifications",
];

const DISCOVER_DEFAULTS = {
  maxDepth: 2,
  maxPages: 25,
  perPageTimeoutMs: 12_000,
} as const;
const DISCOVER_HARD_CAPS = {
  maxDepth: 4,
  maxPages: 60,
} as const;

export async function discoverRoutes(req: DiscoverRequest): Promise<EngineResult<DiscoverResult>> {
  if (!req || typeof req !== "object") {
    return { ok: false, status: 400, error: "Request must be a JSON object." };
  }
  if (typeof req.url !== "string" || req.url.length === 0) {
    return { ok: false, status: 400, error: "`url` is required." };
  }
  if (req.auth) {
    const authError = validateAuth(req.auth);
    if (authError) return authError;
  }
  const urlCheck = await validateUrl(req.url);
  if (!urlCheck.ok) return urlCheck;

  const maxDepth = clampInt(
    req.maxDepth,
    DISCOVER_DEFAULTS.maxDepth,
    1,
    DISCOVER_HARD_CAPS.maxDepth,
  );
  const maxPages = clampInt(
    req.maxPages,
    DISCOVER_DEFAULTS.maxPages,
    1,
    DISCOVER_HARD_CAPS.maxPages,
  );

  // Defaults: link + sitemap on, common off (noisy on apps that don't
  // expose those paths), nav-click off (not implemented yet).
  const techniques: Required<DiscoverTechniques> = {
    linkCrawl: req.techniques?.linkCrawl ?? true,
    sitemap: req.techniques?.sitemap ?? true,
    commonRoutes: req.techniques?.commonRoutes ?? false,
    navClick: req.techniques?.navClick ?? false,
  };

  if (req.setupActions !== undefined) {
    const actionsError = validateActions(req.setupActions);
    if (actionsError) return actionsError;
  }

  const job = inflight.then(() =>
    withDeadline(
      60_000,
      runDiscover({
        url: req.url,
        maxDepth,
        maxPages,
        techniques,
        ...(req.commonRouteList ? { commonRouteList: req.commonRouteList } : {}),
        ...(req.auth ? { auth: req.auth } : {}),
        ...(req.setupActions ? { setupActions: req.setupActions } : {}),
      }),
    ),
  );
  inflight = job.catch(() => undefined);
  try {
    const value = await job;
    return { ok: true, value };
  } catch (err) {
    const screenshot =
      err instanceof AuthFailureError && err.screenshotBase64 ? err.screenshotBase64 : undefined;
    return {
      ok: false,
      status: 500,
      error: `discover failed: ${err instanceof Error ? err.message : String(err)}`,
      ...(screenshot ? { errorScreenshot: screenshot } : {}),
    };
  }
}

interface RunDiscoverArgs {
  url: string;
  maxDepth: number;
  maxPages: number;
  techniques: Required<DiscoverTechniques>;
  commonRouteList?: ReadonlyArray<string>;
  auth?: RenderDemoAuth;
  setupActions?: ReadonlyArray<ScreenAction>;
}

async function runDiscover(args: RunDiscoverArgs): Promise<DiscoverResult> {
  const browser = await chromium.launch({ headless: true });
  try {
    return await discoverWithBrowser(browser, args);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function discoverWithBrowser(
  browser: Browser,
  args: RunDiscoverArgs,
): Promise<DiscoverResult> {
  const start = new URL(args.url);
  const origin = start.origin;
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: "en-US",
    reducedMotion: "reduce",
  });
  try {
    const page = await ctx.newPage();

    // After auth, the user typically lands on /dashboard or similar.
    // We use that as the discover start instead of the original target
    // URL — re-navigating to the public marketing root after login
    // throws away the authenticated UI we actually want to discover.
    let discoverStart = args.url;
    if (args.auth) {
      await runTargetAuth(page, args.url, args.auth);
      const postAuth = page.url();
      if (postAuth && postAuth !== "about:blank") {
        try {
          const u = new URL(postAuth);
          if (u.origin === origin && u.pathname !== "/") {
            discoverStart = postAuth;
          }
        } catch {
          // unparseable post-auth url — fall back to the user's target
        }
      }
    }

    // Make sure the page is on discoverStart for downstream fetches
    // (page.evaluate fetches resolve relative to the current URL).
    if (page.url() !== discoverStart) {
      try {
        await page.goto(discoverStart, {
          waitUntil: "domcontentloaded",
          timeout: DISCOVER_DEFAULTS.perPageTimeoutMs,
        });
      } catch {
        // Even if the initial nav fails we let the techniques try; sitemap
        // + common-routes fetches still work as long as the origin is
        // reachable.
      }
    }

    // Run user-supplied post-auth setup actions (dismiss tour modal,
    // accept cookie banner, etc.) before discovery techniques. If any
    // action fails, we surface the error — discovery against a
    // half-dismissed modal would just produce confusing partial results.
    if (args.setupActions && args.setupActions.length > 0) {
      try {
        await runActions(page, args.setupActions);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`setupActions: ${msg}`, { cause: err });
      }
    }

    // Each technique returns DiscoveredRoute[]; `merged` dedupes by
    // normalized path so the same URL surfaced by two techniques
    // doesn't show twice (first-source wins).
    const merged: Map<string, DiscoveredRoute> = new Map();
    const addRoute = (r: DiscoveredRoute): void => {
      const key = r.path.replace(/\/$/, "") || "/";
      if (!merged.has(key)) merged.set(key, r);
    };

    // Techniques run against discoverStart, not args.url — see the
    // post-auth redirect comment above.
    const techArgs: RunDiscoverArgs = { ...args, url: discoverStart };

    // Per-technique counts (pre-dedup) — surfaced to the UI so the
    // operator sees which technique actually contributed routes
    // and which fell flat.
    const perTechnique = { link: 0, sitemap: 0, common: 0, nav: 0 };

    if (args.techniques.sitemap) {
      const found = await discoverViaSitemap(page, origin).catch(() => [] as DiscoveredRoute[]);
      perTechnique.sitemap = found.length;
      for (const r of found) {
        addRoute(r);
        if (merged.size >= args.maxPages) break;
      }
    }

    if (args.techniques.commonRoutes && merged.size < args.maxPages) {
      const list = args.commonRouteList ?? COMMON_ROUTES;
      const found = await discoverViaCommonRoutes(page, origin, list).catch(
        () => [] as DiscoveredRoute[],
      );
      perTechnique.common = found.length;
      for (const r of found) {
        addRoute(r);
        if (merged.size >= args.maxPages) break;
      }
    }

    if (args.techniques.linkCrawl && merged.size < args.maxPages) {
      const found = await discoverViaLinks(page, origin, techArgs).catch(
        () => [] as DiscoveredRoute[],
      );
      perTechnique.link = found.length;
      for (const r of found) {
        addRoute(r);
        if (merged.size >= args.maxPages) break;
      }
    }

    if (args.techniques.navClick && merged.size < args.maxPages) {
      const found = await discoverViaNavClick(page, origin, discoverStart).catch(
        () => [] as DiscoveredRoute[],
      );
      perTechnique.nav = found.length;
      for (const r of found) {
        addRoute(r);
        if (merged.size >= args.maxPages) break;
      }
    }

    // Final-state screenshot — captures whatever the page settled on
    // after all techniques ran. Lets the operator see what we were
    // actually crawling (was auth applied? did we land on the
    // dashboard? what does the post-auth UI look like?).
    const finalScreenshot = await page
      .screenshot({ fullPage: false, type: "png" })
      .then((buf) => buf.toString("base64"))
      .catch(() => undefined);

    const routes = Array.from(merged.values()).sort((a, b) => a.path.localeCompare(b.path));
    return {
      routes,
      summary: {
        startUrl: discoverStart,
        perTechnique,
        finalCount: routes.length,
        ...(finalScreenshot ? { finalScreenshot } : {}),
      },
    };
  } finally {
    await ctx.close();
  }
}

/**
 * Fetch /sitemap.xml through the page's auth context, regex out
 * `<loc>...</loc>` entries, return the same-origin ones. No XML
 * parser dependency — sitemap.xml shape is narrow and well-known.
 */
async function discoverViaSitemap(page: Page, origin: string): Promise<DiscoveredRoute[]> {
  interface FetchResult {
    status: number;
    body: string;
  }
  const result: unknown = await page
    .evaluate(
      `
      (async () => {
        try {
          const r = await fetch('/sitemap.xml', { credentials: 'include' });
          const body = await r.text();
          return { status: r.status, body };
        } catch (e) {
          return { status: 0, body: '' };
        }
      })()
    `,
    )
    .catch(() => ({ status: 0, body: "" }));

  const candidate = result as { status?: unknown; body?: unknown } | null;
  const fetched: FetchResult =
    candidate &&
    typeof candidate === "object" &&
    typeof candidate.status === "number" &&
    typeof candidate.body === "string"
      ? { status: candidate.status, body: candidate.body }
      : { status: 0, body: "" };

  if (fetched.status < 200 || fetched.status >= 300 || fetched.body.length === 0) return [];

  const out: DiscoveredRoute[] = [];
  const locRegex = /<loc>\s*([^<\s][^<]*?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = locRegex.exec(fetched.body)) !== null) {
    const raw = m[1];
    if (!raw) continue;
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      continue;
    }
    if (parsed.origin !== origin) continue;
    out.push({
      path: pathForResult(parsed, origin),
      title: "",
      depth: 0,
      source: "sitemap",
    });
  }
  return out;
}

/**
 * Probe a list of standard SaaS paths in parallel, keep the 200s.
 * Title is regex'd from the response body so we don't spend a goto
 * per route. SPAs with client-rendered titles will return the index
 * shell title (same for every route) — useful enough.
 */
async function discoverViaCommonRoutes(
  page: Page,
  origin: string,
  routes: ReadonlyArray<string>,
): Promise<DiscoveredRoute[]> {
  void origin; // reserved for absolute-URL probe support
  const result: unknown = await page
    .evaluate(
      `
      (async (paths) => {
        const probes = await Promise.all(
          paths.map(async (p) => {
            try {
              const r = await fetch(p, { credentials: 'include', method: 'GET' });
              if (r.status < 200 || r.status >= 300) {
                return { path: p, status: r.status, title: '', bodyLen: 0 };
              }
              const body = await r.text();
              const m = /<title[^>]*>([^<]*)<\\/title>/i.exec(body);
              const title = m && m[1] ? m[1].trim().slice(0, 200) : '';
              return { path: p, status: r.status, title, bodyLen: body.length };
            } catch (e) {
              return { path: p, status: 0, title: '', bodyLen: 0 };
            }
          })
        );
        return probes;
      })(${JSON.stringify(routes)})
    `,
    )
    .catch(() => [] as unknown);

  if (!Array.isArray(result)) return [];

  interface Probe {
    path: string;
    status: number;
    title: string;
    bodyLen: number;
  }
  const probes: Probe[] = [];
  for (const item of result) {
    if (!item || typeof item !== "object") continue;
    const o = item as { path?: unknown; status?: unknown; title?: unknown; bodyLen?: unknown };
    if (typeof o.path !== "string" || typeof o.status !== "number") continue;
    if (o.status < 200 || o.status >= 300) continue;
    probes.push({
      path: o.path,
      status: o.status,
      title: typeof o.title === "string" ? o.title : "",
      bodyLen: typeof o.bodyLen === "number" ? o.bodyLen : 0,
    });
  }

  // SPA-shell filter: if more than half the 200-responses share an
  // identical body length, that length is the catch-all shell and the
  // technique is hallucinating routes. Drop the shared-length set; keep
  // any outliers (real, distinct pages).
  const lenCounts = new Map<number, number>();
  for (const p of probes) lenCounts.set(p.bodyLen, (lenCounts.get(p.bodyLen) ?? 0) + 1);
  const shellLen = pickShellLength(lenCounts, probes.length);

  return probes
    .filter((p) => p.bodyLen !== shellLen)
    .map((p) => ({
      path: p.path,
      title: p.title,
      depth: 0,
      source: "common" as const,
    }));
}

export function pickShellLength(counts: Map<number, number>, total: number): number | null {
  if (total < 3) return null;
  for (const [len, count] of counts.entries()) {
    if (count >= Math.ceil(total / 2)) return len;
  }
  return null;
}

/**
 * Original v0.1 behavior — BFS link-crawl via `<a href>`. Extracted
 * out of the orchestrator so it composes with the other techniques.
 */
async function discoverViaLinks(
  page: Page,
  origin: string,
  args: RunDiscoverArgs,
): Promise<DiscoveredRoute[]> {
  const start = new URL(args.url);
  const visited = new Set<string>();
  const results: DiscoveredRoute[] = [];
  const queue: Array<{ url: string; depth: number }> = [{ url: start.toString(), depth: 0 }];

  while (queue.length > 0 && results.length < args.maxPages) {
    const next = queue.shift();
    if (!next) break;
    const norm = normalizeUrl(next.url);
    if (norm === null || visited.has(norm)) continue;
    visited.add(norm);

    try {
      await page.goto(next.url, {
        waitUntil: "domcontentloaded",
        timeout: DISCOVER_DEFAULTS.perPageTimeoutMs,
      });
    } catch {
      continue;
    }

    const title = await page.title().catch(() => "");
    const path = pathForResult(new URL(next.url), origin);
    results.push({ path, title: title.slice(0, 200), depth: next.depth, source: "link" });

    if (next.depth >= args.maxDepth) continue;

    const raw: unknown = await page
      .evaluate(
        "Array.from(document.querySelectorAll('a[href]')).map((a) => a.href).filter(Boolean)",
      )
      .catch(() => [] as unknown);
    const hrefs: string[] = Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === "string")
      : [];
    for (const href of hrefs) {
      const child = parseSameOriginHref(href, origin);
      if (!child) continue;
      if (visited.has(normalizeUrl(child) ?? "")) continue;
      queue.push({ url: child, depth: next.depth + 1 });
    }
  }
  return results;
}

/**
 * Click buttons inside <nav> / header / sidebar containers, watching for
 * URL changes. Catches React-Router routes that render as `<button>` +
 * onClick navigation rather than `<a href>` (link-crawl misses those).
 *
 * Safety:
 *   - Only `<button type="button">`-style elements (skip submit).
 *   - Skip text matching destructive keywords (sign out, delete, …).
 *   - Cap at 12 candidates per session to keep budget bounded.
 *   - Reload between clicks to reset DOM state.
 */
async function discoverViaNavClick(
  page: Page,
  origin: string,
  startUrl: string,
): Promise<DiscoveredRoute[]> {
  // Collect button label texts. We re-query by text after each reload
  // because React rerenders invalidate any positional selector.
  const labels: unknown = await page
    .evaluate(
      `(() => {
        const sels = [
          'nav button',
          'header button',
          '[role="navigation"] button',
          'aside button',
          '.navbar button',
          '.nav button',
          '.sidebar button',
          '[data-testid*="nav" i] button'
        ];
        const out = [];
        const seen = new Set();
        for (const sel of sels) {
          for (const b of document.querySelectorAll(sel)) {
            if (b.offsetParent === null) continue;
            const t = (b.getAttribute('type') || 'button').toLowerCase();
            if (t === 'submit' || t === 'reset') continue;
            const text = (b.textContent || '').trim();
            if (!text || text.length > 60) continue;
            if (/delete|remove|sign\\s?out|logout|cancel|confirm|close/i.test(text)) continue;
            if (seen.has(text)) continue;
            seen.add(text);
            out.push(text);
            if (out.length >= 12) return out;
          }
        }
        return out;
      })()`,
    )
    .catch(() => [] as unknown);

  if (!Array.isArray(labels) || labels.length === 0) return [];

  const results: DiscoveredRoute[] = [];
  const seenPaths = new Set<string>();

  for (const labelRaw of labels) {
    if (typeof labelRaw !== "string") continue;
    const label = labelRaw;
    try {
      await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 8_000 });
    } catch {
      break; // origin offline mid-discover
    }
    // Use Playwright's text= selector with first(); narrow to nav-like
    // containers via locator filter. `getByRole('button', { name })` is
    // stricter than text= alone — exact-match by accessible name.
    let clicked = false;
    try {
      const target = page.getByRole("button", { name: label, exact: true }).first();
      await target.click({ timeout: 2_000 });
      clicked = true;
    } catch {
      /* fall through — sometimes the role-name match misses; ignore */
    }
    if (!clicked) continue;

    // Wait briefly for navigation; React Router sets URL synchronously
    // but client-side hydration of the new view takes a beat.
    await page.waitForTimeout(800);
    const afterUrl = page.url();
    if (afterUrl === startUrl || afterUrl === `${startUrl}/`) continue;
    let parsed: URL;
    try {
      parsed = new URL(afterUrl);
    } catch {
      continue;
    }
    if (parsed.origin !== origin) continue;
    const path = pathForResult(parsed, origin);
    const norm = path.replace(/\/$/, "") || "/";
    if (seenPaths.has(norm)) continue;
    seenPaths.add(norm);
    const title = await page.title().catch(() => "");
    results.push({ path, title: title.slice(0, 200) || label, depth: 1, source: "nav" });
  }

  return results;
}

export function parseSameOriginHref(href: string, origin: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.origin !== origin) return null;
  parsed.hash = "";
  return parsed.toString();
}

export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    u.hash = "";
    // Strip trailing slash from non-root paths so /about/ and /about dedupe.
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return null;
  }
}

export function pathForResult(u: URL, origin: string): string {
  if (u.origin !== origin) return u.toString();
  const p = u.pathname + u.search;
  return p.length === 0 ? "/" : p;
}

export function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  const n = Math.floor(raw);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

// Re-exports for the route + tests.
export type { Browser };
