import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Version surfacing — same pattern as `budgetbug/client/vite.config.ts`:
 * the version anchor lives in this package's package.json. Read it at
 * build time and embed it into the client bundle so the footer can
 * show `v0.2.0 a1b2c3d` (semver + short SHA) on every page.
 *
 * Bumping the version is a release-script concern (see
 * ~/.claude/CLAUDE.md → Release Management). Shotcraft does NOT yet
 * have a `scripts/release.{sh,py,mjs}` — version stays at the value
 * baked into packages/web/package.json until one lands.
 */
const pkg = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "..", "package.json"), "utf-8"),
) as { version: string };

function gitShortSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  root: resolve(import.meta.dirname),
  plugins: [react()],
  define: {
    __SHOTCRAFT_VERSION__: JSON.stringify(pkg.version),
    __SHOTCRAFT_GIT_SHA__: JSON.stringify(gitShortSha()),
    __SHOTCRAFT_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    outDir: resolve(import.meta.dirname, "../dist/client"),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:3002",
    },
  },
});
