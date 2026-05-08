import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { TemplateRef, Theme } from "../config/types.js";
import type { ShotcraftTemplate } from "./types.js";

/**
 * A template resolved at runtime — the package's default export plus the
 * (possibly user-overridden) themes and options that should be applied to
 * this run.
 */
export interface LoadedTemplate {
  /** The resolved template metadata. */
  template: ShotcraftTemplate;
  /** Themes to render for this template (override or default). */
  themes: ReadonlyArray<Theme>;
  /** Per-template options merged from `defaultOptions` + user override. */
  options: Record<string, unknown>;
  /** The package name (or absolute path) the template came from. */
  source: string;
}

export interface LoadTemplatesOptions {
  /** Directory used as the "consumer project" root for npm resolution. */
  cwd?: string;
}

/**
 * Resolve a list of {@link TemplateRef}s into runnable {@link LoadedTemplate}s.
 *
 * Each ref is either:
 *   - A string — interpreted as a package name (or absolute file path) to
 *     dynamically import. The default export must satisfy `ShotcraftTemplate`.
 *   - An object with `pkg` + optional `themes` + optional `options` — same
 *     resolution, with caller-side overrides applied.
 *
 * Resolution walks `node_modules` from `cwd`. In a workspace, pnpm symlinks
 * the package into `node_modules` at install time, so dynamic import works
 * the same way it would in a real consumer project.
 */
export async function loadTemplates(
  refs: ReadonlyArray<TemplateRef>,
  options: LoadTemplatesOptions = {},
): Promise<LoadedTemplate[]> {
  const cwd = options.cwd ?? process.cwd();
  const loaded: LoadedTemplate[] = [];
  for (const ref of refs) {
    loaded.push(await loadOne(ref, cwd));
  }
  return loaded;
}

async function loadOne(ref: TemplateRef, cwd: string): Promise<LoadedTemplate> {
  const { pkg, themesOverride, optionsOverride } = normalizeRef(ref);
  const mod = await importTemplate(pkg, cwd);
  const template = pickDefault(mod);
  validateTemplate(template, pkg);

  const themes = themesOverride && themesOverride.length > 0 ? themesOverride : template.themes;
  const options: Record<string, unknown> = {
    ...(template.defaultOptions ?? {}),
    ...(optionsOverride ?? {}),
  };
  return { template, themes, options, source: pkg };
}

interface NormalizedRef {
  pkg: string;
  themesOverride: ReadonlyArray<Theme> | undefined;
  optionsOverride: Record<string, unknown> | undefined;
}

function normalizeRef(ref: TemplateRef): NormalizedRef {
  if (typeof ref === "string") {
    return { pkg: ref, themesOverride: undefined, optionsOverride: undefined };
  }
  return {
    pkg: ref.pkg,
    themesOverride: ref.themes,
    optionsOverride: ref.options,
  };
}

async function importTemplate(pkg: string, cwd: string): Promise<unknown> {
  // Absolute paths bypass npm resolution — handy for tests + monorepo bypass.
  if (isAbsolute(pkg) && existsSync(pkg)) {
    return await import(pathToFileURL(pkg).href);
  }
  // Resolve via the consumer project's node_modules. We anchor `createRequire`
  // at the user's `package.json` so resolution starts from THEIR project (in
  // a pnpm workspace, templates are linked into `consumer/node_modules/`,
  // not into shotcraft's own dist directory).
  //
  // Templates are ESM-only but their `package.json` `exports` maps include
  // a `default` condition so `createRequire().resolve()` (CJS) finds them
  // — without `default` the resolver would report "No exports main defined"
  // for any ESM-only consumer. We then dynamic-import the resolved file URL
  // so the template loads as ESM regardless of how we resolved it.
  try {
    const req = createRequire(resolve(cwd, "package.json"));
    const resolved = req.resolve(pkg);
    return await import(pathToFileURL(resolved).href);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `shotcraft: failed to load template "${pkg}" from ${cwd} — ${msg}\n` +
        `Did you \`pnpm add\` it? Templates are resolved from your project's node_modules.`,
      { cause: err },
    );
  }
}

function pickDefault(mod: unknown): unknown {
  if (mod && typeof mod === "object" && "default" in mod) {
    return mod.default;
  }
  return mod;
}

function validateTemplate(candidate: unknown, pkg: string): asserts candidate is ShotcraftTemplate {
  if (!candidate || typeof candidate !== "object") {
    throw new Error(`shotcraft: template "${pkg}" did not default-export a template object.`);
  }
  const t = candidate as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof t.id !== "string" || t.id.length === 0) {
    errors.push("`id` must be a non-empty string");
  }
  const viewport = t.viewport;
  if (!viewport || typeof viewport !== "object") {
    errors.push("`viewport` must be an object");
  } else {
    const v = viewport as Record<string, unknown>;
    if (typeof v.width !== "number") errors.push("`viewport.width` must be number");
    if (typeof v.height !== "number") errors.push("`viewport.height` must be number");
    if (typeof v.dpr !== "number") errors.push("`viewport.dpr` must be number");
  }
  const output = t.output;
  if (!output || typeof output !== "object") {
    errors.push("`output` must be an object");
  } else {
    const o = output as Record<string, unknown>;
    if (typeof o.width !== "number") errors.push("`output.width` must be number");
    if (typeof o.height !== "number") errors.push("`output.height` must be number");
  }
  if (!Array.isArray(t.themes) || t.themes.length === 0) {
    errors.push("`themes` must be a non-empty array");
  }
  if (typeof t.wrapperHtmlPath !== "string" || t.wrapperHtmlPath.length === 0) {
    errors.push("`wrapperHtmlPath` must be an absolute path string");
  }
  if (errors.length > 0) {
    throw new Error(
      `shotcraft: template "${pkg}" has an invalid shape:\n  - ${errors.join("\n  - ")}`,
    );
  }
}
