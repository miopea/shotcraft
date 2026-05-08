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
}

export interface ComposeScreenRequest {
  raw: Buffer;
  templateId: string;
  caption: string;
  subtitle?: string;
  theme?: "dark" | "light";
}

export type EngineResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

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
  const urlCheck = await validateUrl(req.url);
  if (!urlCheck.ok) return urlCheck;

  const job = inflight.then(() => withDeadline(60_000, runCapture(req)));
  inflight = job.catch(() => undefined);
  try {
    const value = await job;
    return { ok: true, value };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: `capture failed: ${err instanceof Error ? err.message : String(err)}`,
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

function validateActions(raw: ReadonlyArray<unknown>): RenderDemoFailure | null {
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

/**
 * Auto-discovery: BFS link-crawl from a start URL. Lets the Crawler page
 * suggest a starting list of routes instead of forcing the operator to
 * type every path. Hard-capped to keep the App Service worker honest:
 * one browser, one page, sequential navigation, 60s deadline overall.
 *
 * Limitations the caller should know:
 *   - Same-origin only by default — blind crawling foreign hosts is an
 *     SSRF amplifier and almost never what the operator wants.
 *   - Pure link extraction (`<a href>`). Routes only reachable via
 *     button clicks / state changes / dynamic IDs won't be found —
 *     those need explicit screen entries with actions.
 */
export interface DiscoverRequest {
  url: string;
  maxDepth?: number;
  maxPages?: number;
  auth?: RenderDemoAuth;
}

export interface DiscoveredRoute {
  path: string;
  title: string;
  depth: number;
}

const DISCOVER_DEFAULTS = {
  maxDepth: 2,
  maxPages: 25,
  perPageTimeoutMs: 12_000,
} as const;
const DISCOVER_HARD_CAPS = {
  maxDepth: 4,
  maxPages: 60,
} as const;

export async function discoverRoutes(
  req: DiscoverRequest,
): Promise<EngineResult<DiscoveredRoute[]>> {
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

  const job = inflight.then(() =>
    withDeadline(
      60_000,
      runDiscover({
        url: req.url,
        maxDepth,
        maxPages,
        ...(req.auth ? { auth: req.auth } : {}),
      }),
    ),
  );
  inflight = job.catch(() => undefined);
  try {
    const value = await job;
    return { ok: true, value };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: `discover failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

interface RunDiscoverArgs {
  url: string;
  maxDepth: number;
  maxPages: number;
  auth?: RenderDemoAuth;
}

async function runDiscover(args: RunDiscoverArgs): Promise<DiscoveredRoute[]> {
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
): Promise<DiscoveredRoute[]> {
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
    if (args.auth) {
      await runTargetAuth(page, args.url, args.auth);
    }

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
        // Failed nav: don't enqueue children, but don't abort the whole crawl.
        continue;
      }

      const title = await page.title().catch(() => "");
      const path = pathForResult(new URL(next.url), origin);
      results.push({ path, title: title.slice(0, 200), depth: next.depth });

      if (next.depth >= args.maxDepth) continue;

      // server tsconfig has no DOM lib — pass a string evaluator and
      // narrow the unknown result.
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
  } finally {
    await ctx.close();
  }
}

function parseSameOriginHref(href: string, origin: string): string | null {
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

function normalizeUrl(raw: string): string | null {
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

function pathForResult(u: URL, origin: string): string {
  if (u.origin !== origin) return u.toString();
  const p = u.pathname + u.search;
  return p.length === 0 ? "/" : p;
}

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  const n = Math.floor(raw);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

// Re-exports for the route + tests.
export type { Browser };
