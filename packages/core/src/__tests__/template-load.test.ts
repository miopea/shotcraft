import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadTemplates } from "../template/load.js";

const STUB_TEMPLATE = `
export default {
  id: "stub-template",
  viewport: { width: 100, height: 200, dpr: 2 },
  output: { width: 200, height: 400 },
  themes: ["dark", "light"],
  wrapperHtmlPath: "/abs/path/to/wrapper.html",
  isMobile: true,
  defaultOptions: { accent: "#ff0000" },
};
`;

describe("loadTemplates", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "shotcraft-tload-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("loads a template from an absolute file path (test escape hatch)", async () => {
    const file = join(dir, "stub.mjs");
    await writeFile(file, STUB_TEMPLATE);
    const loaded = await loadTemplates([file]);
    expect(loaded).toHaveLength(1);
    const lt = loaded[0]!;
    expect(lt.template.id).toBe("stub-template");
    expect(lt.themes).toEqual(["dark", "light"]);
    expect(lt.options).toEqual({ accent: "#ff0000" });
    expect(lt.source).toBe(file);
  });

  it("applies user-supplied theme + option overrides", async () => {
    const file = join(dir, "stub.mjs");
    await writeFile(file, STUB_TEMPLATE);
    const [lt] = await loadTemplates([
      { pkg: file, themes: ["dark"], options: { accent: "#00ff00", custom: 42 } },
    ]);
    expect(lt!.themes).toEqual(["dark"]);
    expect(lt!.options).toEqual({ accent: "#00ff00", custom: 42 });
  });

  it("rejects a template missing required fields", async () => {
    const file = join(dir, "broken.mjs");
    await writeFile(file, `export default { id: "broken" };`);
    await expect(loadTemplates([file])).rejects.toThrow(/invalid shape/i);
  });

  it("rejects a missing package with a helpful message", async () => {
    // Create a fake project with no node_modules.
    await mkdir(join(dir, "fake-project"));
    await writeFile(join(dir, "fake-project", "package.json"), JSON.stringify({ name: "fake" }));
    await expect(
      loadTemplates(["@shotcraft/totally-fictional-template"], {
        cwd: join(dir, "fake-project"),
      }),
    ).rejects.toThrow(/failed to load template/i);
  });
});
