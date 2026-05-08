/**
 * Copy each first-party template's `samples/*.png` into
 * `packages/web/client/public/samples/<id>/` so the React gallery and
 * the production-built static site both have them.
 *
 * Runs before `pnpm dev` and `pnpm build` (see package.json scripts).
 * Idempotent — safe to call repeatedly.
 */

import { copyFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(WEB_ROOT, "..", "..");
const PACKAGES_DIR = join(REPO_ROOT, "packages");
const TARGET_DIR = join(WEB_ROOT, "client", "public", "samples");

const TEMPLATES = [
  { id: "app-store-iphone", pkg: "template-app-store-iphone" },
  { id: "app-store-ipad", pkg: "template-app-store-ipad" },
  { id: "play-store-phone", pkg: "template-play-store-phone" },
  { id: "play-store-tablet", pkg: "template-play-store-tablet" },
  { id: "readme-hero", pkg: "template-readme-hero" },
  { id: "social-og-card", pkg: "template-social-og-card" },
];

async function copyTemplate(template) {
  const src = join(PACKAGES_DIR, template.pkg, "samples");
  if (!existsSync(src)) {
    throw new Error(
      `[copy-samples] missing source: ${src}\nRun \`pnpm --filter @shotcraft/${template.pkg} test\` to regenerate.`,
    );
  }
  const dest = join(TARGET_DIR, template.id);
  await mkdir(dest, { recursive: true });
  const files = (await readdir(src)).filter((f) => f.endsWith(".png"));
  for (const f of files) await copyFile(join(src, f), join(dest, f));
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
