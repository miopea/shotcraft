import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import type { ShotcraftConfig } from "./types.js";

const CONFIG_FILENAMES = [
  "shotcraft.config.ts",
  "shotcraft.config.mts",
  "shotcraft.config.js",
  "shotcraft.config.mjs",
] as const;

export interface LoadedConfig {
  /** Absolute path the config was loaded from. */
  path: string;
  /** The user's config object (after default-export unwrapping). */
  config: ShotcraftConfig;
}

export interface LoadConfigOptions {
  /** Directory to search for the config file. Defaults to process.cwd(). */
  cwd?: string;
  /** Explicit path to a config file (overrides cwd lookup). */
  configFile?: string;
}

/**
 * Locate the first `shotcraft.config.*` in the given directory. Returns the
 * absolute path, or null when none is found.
 */
export function findConfig(cwd: string): string | null {
  for (const name of CONFIG_FILENAMES) {
    const full = resolve(cwd, name);
    if (existsSync(full)) return full;
  }
  return null;
}

/**
 * Load and validate a Shotcraft config. Supports `.ts` / `.mts` / `.js` /
 * `.mjs` — TypeScript files are transpiled on the fly via jiti.
 *
 * Throws a descriptive `Error` when:
 *   - no config can be found in `cwd`
 *   - the explicit `configFile` doesn't exist
 *   - the loaded module's default export is missing or not an object
 *   - required fields (`target`, `screens`) are absent or malformed
 */
export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadedConfig> {
  const cwd = options.cwd ?? process.cwd();
  const explicit = options.configFile;

  let path: string | null;
  if (explicit) {
    const abs = isAbsolute(explicit) ? explicit : resolve(cwd, explicit);
    if (!existsSync(abs)) {
      throw new Error(`shotcraft: config file not found at ${abs}`);
    }
    path = abs;
  } else {
    path = findConfig(cwd);
    if (!path) {
      throw new Error(
        `shotcraft: no shotcraft.config.{ts,mts,js,mjs} found in ${cwd}.\n` +
          `Run \`shotcraft init\` to scaffold one.`,
      );
    }
  }

  const mod = await importConfigModule(path);
  const candidate = unwrapDefault(mod);
  validateConfig(candidate, path);
  return { path, config: candidate };
}

async function importConfigModule(path: string): Promise<unknown> {
  if (path.endsWith(".js") || path.endsWith(".mjs")) {
    return (await import(pathToFileURL(path).href)) as unknown;
  }
  const jiti = createJiti(import.meta.url, {
    interopDefault: false,
    moduleCache: false,
  });
  return await jiti.import(path);
}

function unwrapDefault(mod: unknown): unknown {
  if (mod && typeof mod === "object" && "default" in mod) {
    const inner: unknown = mod.default;
    if (inner && typeof inner === "object") return inner;
  }
  return mod;
}

function validateConfig(candidate: unknown, path: string): asserts candidate is ShotcraftConfig {
  if (!candidate || typeof candidate !== "object") {
    throw new Error(`shotcraft: config at ${path} must be an object (got ${typeof candidate}).`);
  }
  const cfg = candidate as Record<string, unknown>;
  const errors: string[] = [];

  const target = cfg.target;
  if (typeof target !== "string" || target.length === 0) {
    errors.push("`target` must be a non-empty string URL");
  }

  const screens = cfg.screens;
  if (!Array.isArray(screens) || screens.length === 0) {
    errors.push("`screens` must be a non-empty array");
  } else {
    const seen = new Set<string>();
    screens.forEach((entry: unknown, i: number) => {
      if (!entry || typeof entry !== "object") {
        errors.push(`screens[${i}] must be an object`);
        return;
      }
      const s = entry as Record<string, unknown>;
      if (typeof s.route !== "string" || s.route.length === 0) {
        errors.push(`screens[${i}].route must be a non-empty string`);
      }
      const name = s.name;
      if (typeof name !== "string" || name.length === 0) {
        errors.push(`screens[${i}].name must be a non-empty string`);
      } else if (seen.has(name)) {
        errors.push(`screens[${i}].name "${name}" is duplicated (names must be unique)`);
      } else {
        seen.add(name);
      }
      if (typeof s.caption !== "string") {
        errors.push(`screens[${i}].caption must be a string`);
      }
    });
  }

  const templates = cfg.templates;
  if (templates !== undefined && !Array.isArray(templates)) {
    errors.push("`templates` must be an array when provided");
  }

  if (errors.length > 0) {
    throw new Error(`shotcraft: invalid config at ${path}:\n  - ${errors.join("\n  - ")}`);
  }
}
