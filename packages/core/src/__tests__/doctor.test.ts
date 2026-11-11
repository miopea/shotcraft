import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runDoctor } from "../cli/commands/doctor.js";

const NOOP_LOG = () => {};

describe("runDoctor", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "shotcraft-doctor-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reports missing config as a problem", async () => {
    const report = await runDoctor({
      cwd: dir,
      skipTarget: true,
      onLog: NOOP_LOG,
    });
    expect(report.ok).toBe(false);
    expect(report.configPath).toBeNull();
    expect(report.problems[0]).toMatch(/no shotcraft.config/i);
  });

  it("returns ok + warnings when config is valid but no templates installed", async () => {
    await writeFile(
      join(dir, "shotcraft.config.js"),
      `export default {
        target: "http://localhost:5173",
        screens: [{ route: "/", name: "home", caption: "Hi" }],
      };`,
    );
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "demo", version: "0.0.0" }));
    const report = await runDoctor({
      cwd: dir,
      skipTarget: true,
      onLog: NOOP_LOG,
    });
    expect(report.ok).toBe(true);
    expect(report.warnings.some((w) => /No Shotcraft templates/i.test(w))).toBe(true);
  });

  it("discovers shotcraft template packages from devDependencies", async () => {
    await writeFile(
      join(dir, "shotcraft.config.js"),
      `export default {
        target: "http://localhost:5173",
        screens: [{ route: "/", name: "home", caption: "Hi" }],
      };`,
    );
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "demo",
        version: "0.0.0",
        devDependencies: {
          "@shotcraft/template-app-store-iphone": "*",
          "shotcraft-template-community-vibes": "*",
          react: "*",
        },
      }),
    );
    const report = await runDoctor({
      cwd: dir,
      skipTarget: true,
      onLog: NOOP_LOG,
    });
    expect(report.ok).toBe(true);
    expect(report.warnings).toHaveLength(0);
  });

  it("discovers scoped community templates (@scope/shotcraft-template-*)", async () => {
    await writeFile(
      join(dir, "shotcraft.config.js"),
      `export default {
        target: "http://localhost:5173",
        screens: [{ route: "/", name: "home", caption: "Hi" }],
      };`,
    );
    await writeFile(
      join(dir, "package.json"),
      JSON.stringify({
        name: "demo",
        version: "0.0.0",
        devDependencies: {
          "@shotcraft/template-app-store-iphone": "*",
          "@acme/shotcraft-template-brand": "*",
          "shotcraft-template-community-vibes": "*",
          // Near misses — the prefix must start the (unscoped) name.
          "@acme/not-a-shotcraft-template-x": "*",
          "my-shotcraft-template-y": "*",
        },
      }),
    );
    const lines: string[] = [];
    const report = await runDoctor({
      cwd: dir,
      skipTarget: true,
      onLog: (msg) => lines.push(msg),
    });
    expect(report.ok).toBe(true);
    expect(lines).toContain("✓ templates: 3 discovered");
    expect(lines).toContain("    – @acme/shotcraft-template-brand");
    expect(lines.join("\n")).not.toMatch(/not-a-shotcraft-template-x|my-shotcraft-template-y/);
  });
});
