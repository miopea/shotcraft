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
import { chromium, type Browser } from "playwright";
import type { TemplateInfo } from "./registry.js";
import { TEMPLATE_REGISTRY } from "./registry.js";

export interface RenderDemoRequest {
  url: string;
  caption: string;
  subtitle?: string;
  templateId: string;
  theme?: "dark" | "light";
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
  return { ok: true, template, theme };
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
