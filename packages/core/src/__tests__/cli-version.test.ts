/**
 * `shotcraft --version` must print the version of the package that is
 * actually installed — a hardcoded string drifts the moment a release bumps
 * package.json, and nobody can tell which build they are running.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { readOwnVersion } from "../cli/version.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACKAGE_VERSION = (
  JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as { version: string }
).version;

describe("shotcraft --version", () => {
  it("prints the version from package.json", () => {
    // Run the real CLI entry from source through jiti (already a runtime
    // dependency), so this covers the dispatch path and not just a helper.
    const jitiCli = join(dirname(createRequire(import.meta.url).resolve("jiti")), "jiti-cli.mjs");
    const out = execFileSync(process.execPath, [jitiCli, "src/cli/index.ts", "--version"], {
      cwd: PACKAGE_ROOT,
      encoding: "utf8",
    });
    expect(out.trim()).toBe(PACKAGE_VERSION);
  }, 30_000);
});

describe("readOwnVersion", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("walks past a package.json that is not shotcraft's to the one that is", () => {
    // Mirrors an install: node_modules/shotcraft/package.json above
    // dist/cli/, with an unrelated package.json closer in.
    const root = mkdtempSync(join(tmpdir(), "shotcraft-version-"));
    dirs.push(root);
    const nested = join(root, "dist", "cli");
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "shotcraft", version: "9.8.7" }),
    );
    writeFileSync(join(root, "dist", "package.json"), JSON.stringify({ type: "module" }));
    expect(readOwnVersion(nested)).toBe("9.8.7");
  });

  it("throws rather than inventing a version when none is found", () => {
    const root = mkdtempSync(join(tmpdir(), "shotcraft-version-"));
    dirs.push(root);
    expect(() => readOwnVersion(root)).toThrow(/package\.json/);
  });
});
