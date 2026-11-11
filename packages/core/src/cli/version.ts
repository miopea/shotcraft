import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The version of the installed `shotcraft` package, read from its own
 * package.json so `shotcraft --version` can never drift from a release.
 *
 * Walks up from `fromDir` to the nearest package.json named `shotcraft`
 * rather than using a fixed relative path: tsup bundles this file into
 * whichever entry imports it, so its depth under the package differs
 * between `src/` (tests, jiti) and each `dist/` bundle.
 */
export function readOwnVersion(fromDir: string = dirname(fileURLToPath(import.meta.url))): string {
  let dir = fromDir;
  for (;;) {
    const version = shotcraftVersionAt(join(dir, "package.json"));
    if (version !== null) return version;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`could not find shotcraft's own package.json above ${fromDir}`);
    }
    dir = parent;
  }
}

function shotcraftVersionAt(path: string): string | null {
  let parsed: { name?: unknown; version?: unknown };
  try {
    parsed = JSON.parse(readFileSync(path, "utf8")) as typeof parsed;
  } catch {
    // Absent or unreadable — not this directory.
    return null;
  }
  return parsed.name === "shotcraft" && typeof parsed.version === "string" && parsed.version
    ? parsed.version
    : null;
}
