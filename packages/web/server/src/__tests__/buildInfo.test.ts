/**
 * The build stamp must come from the artifact, and absent must read as absent —
 * a placeholder string would look like a SHA to anyone comparing deploys.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildSha, readBuildSha } from "../buildInfo.js";

describe("buildSha", () => {
  it("reads null from the source tree, which carries no stamp", () => {
    expect(buildSha()).toBeNull();
  });
});

describe("readBuildSha", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
    dirs.length = 0;
  });

  function fixture(contents: string | null): string {
    const dir = mkdtempSync(join(tmpdir(), "shotcraft-build-info-"));
    dirs.push(dir);
    if (contents !== null) writeFileSync(join(dir, "build-info.json"), contents);
    return dir;
  }

  it("returns the stamped SHA", () => {
    const sha = "7c7cd7b0a1b2c3d4e5f60718293a4b5c6d7e8f90";
    expect(readBuildSha(fixture(JSON.stringify({ sha })))).toBe(sha);
  });

  it("returns null when the file is absent", () => {
    expect(readBuildSha(fixture(null))).toBeNull();
  });

  it("returns null for an explicit null stamp (build made without BUILD_SHA)", () => {
    expect(readBuildSha(fixture(JSON.stringify({ sha: null })))).toBeNull();
  });

  it("returns null for an empty-string stamp rather than a blank SHA", () => {
    expect(readBuildSha(fixture(JSON.stringify({ sha: "" })))).toBeNull();
  });

  it("returns null for malformed JSON or a non-string sha", () => {
    expect(readBuildSha(fixture("{not json"))).toBeNull();
    expect(readBuildSha(fixture(JSON.stringify({ sha: 42 })))).toBeNull();
  });
});
