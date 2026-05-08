import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInit, INIT_TEMPLATE } from "../cli/commands/init.js";

describe("runInit", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "shotcraft-init-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes shotcraft.config.ts with the expected scaffold", async () => {
    const result = await runInit({ cwd: dir });
    expect(result.written).toBe(true);
    expect(result.path).toBe(join(dir, "shotcraft.config.ts"));
    expect(existsSync(result.path)).toBe(true);
    const written = readFileSync(result.path, "utf8");
    expect(written).toBe(INIT_TEMPLATE);
    expect(written).toContain('import { defineConfig } from "shotcraft"');
    expect(written).toContain("export default defineConfig({");
  });

  it("refuses to overwrite an existing config without force", async () => {
    await runInit({ cwd: dir });
    const second = await runInit({ cwd: dir });
    expect(second.written).toBe(false);
  });

  it("overwrites with force: true", async () => {
    await runInit({ cwd: dir });
    const second = await runInit({ cwd: dir, force: true });
    expect(second.written).toBe(true);
  });
});
