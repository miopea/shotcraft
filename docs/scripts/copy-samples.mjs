/**
 * Copy each first-party template's `samples/*.png` into `docs/public/samples/`
 * so the templates gallery + READMEs can show real composites.
 *
 * Runs before `astro build` (see package.json scripts). Safe to run as part
 * of `pnpm dev` too — it's idempotent.
 *
 *   docs/public/samples/<template-id>/<file>.png
 *
 * The mapping is hard-coded so a missing template package surfaces as a
 * loud error rather than a silent skip.
 */

import { copyFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(DOCS_ROOT, "..");
const PACKAGES_DIR = join(REPO_ROOT, "packages");
const TARGET_DIR = join(DOCS_ROOT, "public", "samples");

const TEMPLATES = [
  { id: "app-store-iphone", pkg: "template-app-store-iphone" },
  { id: "app-store-ipad", pkg: "template-app-store-ipad" },
  { id: "play-store-phone", pkg: "template-play-store-phone" },
  { id: "play-store-tablet", pkg: "template-play-store-tablet" },
  { id: "readme-hero", pkg: "template-readme-hero" },
  { id: "social-og-card", pkg: "template-social-og-card" },
];

async function copyTemplate(template) {
  const samplesSrc = join(PACKAGES_DIR, template.pkg, "samples");
  if (!existsSync(samplesSrc)) {
    throw new Error(
      `[copy-samples] missing source dir: ${samplesSrc}\n` +
        `Run \`pnpm --filter @shotcraft/${template.pkg} test\` to regenerate it.`,
    );
  }
  const dest = join(TARGET_DIR, template.id);
  await mkdir(dest, { recursive: true });
  const files = (await readdir(samplesSrc)).filter((f) => f.endsWith(".png"));
  if (files.length === 0) {
    throw new Error(
      `[copy-samples] no PNGs in ${samplesSrc} — snapshot test may not have run yet.`,
    );
  }
  for (const file of files) {
    await copyFile(join(samplesSrc, file), join(dest, file));
  }
  return files.length;
}

async function main() {
  await mkdir(TARGET_DIR, { recursive: true });
  let total = 0;
  for (const t of TEMPLATES) {
    const n = await copyTemplate(t);
    total += n;
    process.stdout.write(`[copy-samples]  ✓ ${t.id} (${n} PNG${n === 1 ? "" : "s"})\n`);
  }
  process.stdout.write(`[copy-samples] copied ${total} sample PNG(s) → ${TARGET_DIR}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.message ?? err}\n`);
  process.exit(1);
});
