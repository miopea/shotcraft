/**
 * First-party templates must declare their peer on `shotcraft` as a caret
 * range. pnpm publishes `workspace:*` as the EXACT current version
 * (`"shotcraft": "0.1.2"`), so a template already on npm refuses the next CLI
 * patch (npm ERESOLVE) and every CLI patch forces all seven templates to be
 * republished. `workspace:^` publishes as `^0.1.2`, which accepts it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PACKAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const TEMPLATE_DIRS = readdirSync(PACKAGES_DIR)
  .filter((dir) => dir.startsWith("template-"))
  .sort();

interface TemplateManifest {
  peerDependencies?: Record<string, string>;
}

function peerOnShotcraft(dir: string): string | undefined {
  const manifest = JSON.parse(
    readFileSync(join(PACKAGES_DIR, dir, "package.json"), "utf8"),
  ) as TemplateManifest;
  return manifest.peerDependencies?.shotcraft;
}

describe("first-party template peer on shotcraft", () => {
  it("finds all seven first-party templates", () => {
    // Without this, the cases below would pass over an empty list.
    expect(TEMPLATE_DIRS).toHaveLength(7);
  });

  it.each(TEMPLATE_DIRS)("%s declares it as workspace:^", (dir) => {
    expect(peerOnShotcraft(dir)).toBe("workspace:^");
  });
});
