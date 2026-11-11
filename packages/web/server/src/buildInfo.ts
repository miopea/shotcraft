/**
 * The SHA and `@shotcraft/web` version of the build actually being served,
 * reported by `/api/health` as `build` and `version`.
 *
 * Read from `build-info.json`, which `scripts/stamp-build-info.mjs` writes next
 * to the compiled server at BUILD time — not from an App Service setting read
 * at run time. Writing an app setting restarts the app, so the OLD package can
 * come back up already reporting the NEW SHA; a SHA inside the deployed bundle
 * cannot exist unless that bundle is the one being served. Same file name and
 * shape as bfg-ops-console, sculpt-studio and budgetbug, on purpose.
 *
 * The version is stamped for the same reason, and because nothing else on the
 * server knows it: the deploy workflow ships a synthetic `package.json` whose
 * version is always 0.0.0, so reading package.json at run time would report
 * that instead of the release.
 *
 * ABSENT READS AS null, NEVER AS A PLACEHOLDER. Local dev (`tsx` runs from
 * `src/`, where no stamp exists) and any build made without `BUILD_SHA` report
 * a null SHA, which means "this build carries no stamp" — a different and
 * honest claim from a plausible-looking string that could never match a commit.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface BuildInfo {
  sha: string | null;
  version: string | null;
}

let cached: BuildInfo | undefined;

function servedBuildInfo(): BuildInfo {
  cached ??= readBuildInfo(dirname(fileURLToPath(import.meta.url)));
  return cached;
}

export function buildSha(): string | null {
  return servedBuildInfo().sha;
}

export function buildVersion(): string | null {
  return servedBuildInfo().version;
}

/** Reads the SHA from `<dir>/build-info.json`. Exported so tests can point it at a fixture. */
export function readBuildSha(dir: string): string | null {
  return readBuildInfo(dir).sha;
}

/** Reads the version from `<dir>/build-info.json`. Exported so tests can point it at a fixture. */
export function readBuildVersion(dir: string): string | null {
  return readBuildInfo(dir).version;
}

function readBuildInfo(dir: string): BuildInfo {
  let parsed: { sha?: unknown; version?: unknown };
  try {
    parsed = JSON.parse(readFileSync(join(dir, "build-info.json"), "utf-8")) as typeof parsed;
  } catch {
    // Absent, unreadable, or malformed all mean the same thing to a caller:
    // there is no trustworthy stamp.
    return { sha: null, version: null };
  }
  return { sha: nonEmptyString(parsed.sha), version: nonEmptyString(parsed.version) };
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
