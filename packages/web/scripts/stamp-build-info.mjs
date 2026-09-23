/**
 * Stamp the commit being built into `server/dist/build-info.json`, which
 * `server/src/buildInfo.ts` reads and `/api/health` reports as `build`.
 *
 * Runs after `tsc` in `build:server`. The deploy workflow sets `BUILD_SHA` to
 * the commit it is building; anywhere else it is unset and the stamp is null.
 * Always rewrites the file, so a local build can never inherit a SHA left in
 * `dist/` by an earlier stamped build.
 *
 * `||`, not `??`: a failed or partial stamp step can leave `BUILD_SHA=""`,
 * and an empty string must read as absent rather than as a real value.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "server", "dist", "build-info.json");

const sha = process.env.BUILD_SHA || null;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ sha }) + "\n");
console.log(`stamped server/dist/build-info.json (sha=${sha ?? "null"})`);
