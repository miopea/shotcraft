import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findConfig, loadConfig } from "../config/load.js";

describe("findConfig + loadConfig", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "shotcraft-load-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("findConfig returns null when no config file exists", () => {
    expect(findConfig(dir)).toBeNull();
  });

  it("findConfig prefers .ts over .js when both exist", async () => {
    await writeFile(join(dir, "shotcraft.config.ts"), "export default {};");
    await writeFile(join(dir, "shotcraft.config.js"), "export default {};");
    expect(findConfig(dir)).toBe(join(dir, "shotcraft.config.ts"));
  });

  it("loadConfig loads a valid .js config", async () => {
    const file = join(dir, "shotcraft.config.js");
    await writeFile(
      file,
      `export default {
        target: "http://localhost:5173",
        screens: [
          { route: "/", name: "home", caption: "Hello" },
        ],
      };`,
    );
    const { path, config } = await loadConfig({ cwd: dir });
    expect(path).toBe(file);
    expect(config.target).toBe("http://localhost:5173");
    expect(config.screens).toHaveLength(1);
  });

  it("loadConfig loads a valid .ts config via jiti", async () => {
    const file = join(dir, "shotcraft.config.ts");
    await writeFile(
      file,
      `interface S { route: string; name: string; caption: string }
       const screens: S[] = [{ route: "/", name: "home", caption: "Hi" }];
       export default { target: "http://localhost:3000", screens };`,
    );
    const { config } = await loadConfig({ cwd: dir });
    expect(config.target).toBe("http://localhost:3000");
    expect(config.screens[0]?.name).toBe("home");
  });

  it("rejects configs missing required fields", async () => {
    await writeFile(join(dir, "shotcraft.config.js"), `export default { target: "" };`);
    await expect(loadConfig({ cwd: dir })).rejects.toThrow(/target.*non-empty/i);
  });

  it("rejects configs with duplicate screen names", async () => {
    await writeFile(
      join(dir, "shotcraft.config.js"),
      `export default {
        target: "http://localhost:5173",
        screens: [
          { route: "/", name: "home", caption: "A" },
          { route: "/x", name: "home", caption: "B" },
        ],
      };`,
    );
    await expect(loadConfig({ cwd: dir })).rejects.toThrow(/duplicated/i);
  });

  it("throws a helpful error when no config exists", async () => {
    await expect(loadConfig({ cwd: dir })).rejects.toThrow(/shotcraft init/);
  });

  it("respects explicit configFile option", async () => {
    const file = join(dir, "custom.mjs");
    await writeFile(
      file,
      `export default {
        target: "http://x",
        screens: [{ route: "/", name: "h", caption: "c" }],
      };`,
    );
    const { path } = await loadConfig({ cwd: dir, configFile: "custom.mjs" });
    expect(path).toBe(file);
  });
});
