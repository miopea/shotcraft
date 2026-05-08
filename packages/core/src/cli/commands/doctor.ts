import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { findConfig, loadConfig } from "../../config/load.js";
import { deriveCaptureSpecs } from "../../capture/spec.js";

export interface DoctorOptions {
  cwd?: string;
  configFile?: string;
  /**
   * Skip the live target HTTP probe — useful for tests or offline runs.
   * Default: false.
   */
  skipTarget?: boolean;
  /** Per-line logger (defaults to console.log). */
  onLog?: (msg: string) => void;
}

export interface DoctorReport {
  ok: boolean;
  configPath: string | null;
  problems: string[];
  warnings: string[];
}

const TEMPLATE_PATTERN = /^(?:@shotcraft\/template-|shotcraft-template-)/;

/**
 * Sanity-check a Shotcraft setup. Returns a structured report and emits
 * human-readable lines via `onLog`. Doesn't throw on validation issues —
 * problems are returned in `report.problems` so the CLI can format them.
 *
 * Throws only if config loading itself blows up *unexpectedly* (e.g. the
 * config file has a syntax error).
 */
export async function runDoctor(options: DoctorOptions = {}): Promise<DoctorReport> {
  const cwd = options.cwd ?? process.cwd();
  const log = options.onLog ?? defaultLog;
  const problems: string[] = [];
  const warnings: string[] = [];

  // 1. Locate config.
  const configPath = options.configFile ? resolve(cwd, options.configFile) : findConfig(cwd);
  if (!configPath || !existsSync(configPath)) {
    problems.push(
      `No shotcraft.config.{ts,mts,js,mjs} found in ${cwd}. Run \`shotcraft init\` to scaffold one.`,
    );
    log(`✗ config: missing in ${cwd}`);
    return { ok: false, configPath: null, problems, warnings };
  }
  log(`✓ config: ${configPath}`);

  // 2. Load + validate (load.ts already enforces the strict schema).
  let config;
  try {
    ({ config } = await loadConfig({ cwd, configFile: configPath }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    problems.push(`Failed to load config: ${msg}`);
    log(`✗ load: ${msg}`);
    return { ok: false, configPath, problems, warnings };
  }
  log(`✓ schema: ${config.screens.length} screen(s) declared`);

  // 3. Derive capture specs to surface what would actually run.
  const specs = deriveCaptureSpecs(config, "/");
  log(
    `✓ specs: ${specs.length} capture(s) would run (${config.screens.length} screen × ${specs.length / Math.max(config.screens.length, 1)} theme)`,
  );

  // 4. Probe target (optional).
  if (options.skipTarget) {
    log("• target: probe skipped");
  } else {
    const reachable = await probeTarget(config.target);
    if (reachable.ok) {
      log(`✓ target: ${config.target} responded ${reachable.status}`);
    } else {
      problems.push(`Target ${config.target} not reachable: ${reachable.error}`);
      log(`✗ target: ${config.target} → ${reachable.error}`);
    }
  }

  // 5. Discover installed templates from package.json deps.
  const templates = discoverTemplates(dirname(configPath));
  if (templates.length === 0) {
    warnings.push(
      "No Shotcraft templates installed yet. `shotcraft capture` will use the default viewport profile until you `pnpm add` a template package.",
    );
    log("• templates: none installed (ok for capture-only runs)");
  } else {
    log(`✓ templates: ${templates.length} discovered`);
    for (const name of templates) log(`    – ${name}`);
  }

  return {
    ok: problems.length === 0,
    configPath,
    problems,
    warnings,
  };
}

async function probeTarget(
  url: string,
): Promise<{ ok: true; status: number } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      // 5s timeout via AbortController — long enough for slow dev servers,
      // short enough not to hang the CLI on a typo'd hostname.
      signal: AbortSignal.timeout(5000),
    });
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function discoverTemplates(configDir: string): string[] {
  const pkgPath = resolve(configDir, "package.json");
  if (!existsSync(pkgPath)) return [];
  let parsed: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    parsed = JSON.parse(readFileSync(pkgPath, "utf8")) as typeof parsed;
  } catch {
    return [];
  }
  const all = {
    ...(parsed.dependencies ?? {}),
    ...(parsed.devDependencies ?? {}),
  };
  return Object.keys(all)
    .filter((name) => TEMPLATE_PATTERN.test(name))
    .sort();
}

function defaultLog(msg: string): void {
  console.log(msg);
}
