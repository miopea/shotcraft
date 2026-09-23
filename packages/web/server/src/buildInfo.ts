/**
 * The SHA of the build actually being served, reported by `/api/health` as
 * `build`.
 *
 * Read from `build-info.json`, which `scripts/stamp-build-info.mjs` writes next
 * to the compiled server at BUILD time — not from an App Service setting read
 * at run time. Writing an app setting restarts the app, so the OLD package can
 * come back up already reporting the NEW SHA; a SHA inside the deployed bundle
 * cannot exist unless that bundle is the one being served. Same file name and
 * shape as bfg-ops-console, sculpt-studio and budgetbug, on purpose.
 *
 * ABSENT READS AS null, NEVER AS A PLACEHOLDER. Local dev (`tsx` runs from
 * `src/`, where no stamp exists) and any build made without `BUILD_SHA` report
 * null, which means "this build carries no stamp" — a different and honest
 * claim from a plausible-looking string that could never match a commit.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | null | undefined;

export function buildSha(): string | null {
  if (cached !== undefined) return cached;
  cached = readBuildSha(dirname(fileURLToPath(import.meta.url)));
  return cached;
}

/** Reads `<dir>/build-info.json`. Exported so tests can point it at a fixture. */
export function readBuildSha(dir: string): string | null {
  try {
    const raw = readFileSync(join(dir, "build-info.json"), "utf-8");
    const parsed = JSON.parse(raw) as { sha?: unknown };
    return typeof parsed.sha === "string" && parsed.sha ? parsed.sha : null;
  } catch {
    // Absent, unreadable, or malformed all mean the same thing to a caller:
    // there is no trustworthy stamp.
    return null;
  }
}
