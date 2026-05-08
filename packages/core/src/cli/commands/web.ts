import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

export interface WebCliOptions {
  cwd?: string;
  /** Override the default port (3002 for the server). */
  port?: number;
  /**
   * Override the path to `shotcraft.config.json`. Defaults to
   * `<cwd>/shotcraft.config.json`.
   */
  configPath?: string;
}

/**
 * CLI entry for `shotcraft web`. Boots the @shotcraft/web hosted companion
 * Express server in "local mode" — the operator's own machine running
 * against their own project — and enables features that don't make
 * sense in a public hosted deployment:
 *
 *   - SHOTCRAFT_LIVE_DEMO=1 enables the capture / render / discover
 *     endpoints (otherwise gated off in prod).
 *   - SHOTCRAFT_WEB_LOCAL_MODE=1 mounts the /api/local/config routes the
 *     Crawler uses to read + write `shotcraft.config.json` on disk.
 *   - SHOTCRAFT_ALLOW_LOCAL=1 relaxes the SSRF guard so localhost /
 *     RFC1918 capture targets work (you're capturing your own dev
 *     server, the threat model is different).
 *   - SHOTCRAFT_LIVE_DEMO_TOKEN deliberately unset — no token gate
 *     when you're the only client.
 *
 * Resolution rules for the @shotcraft/web entry:
 *   - Prefer the consumer project's installed `@shotcraft/web`
 *     (resolved via `createRequire` anchored at their `package.json`).
 *   - Fall back to a pre-built bundle inside the workspace's
 *     `packages/web/dist/server/index.js` when running from a clone.
 *   - Otherwise emit a clear error pointing at the workspace dev command.
 */
export async function runWebCommand(options: WebCliOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const entry = resolveWebEntry(cwd);
  const port = options.port ?? Number(process.env.PORT ?? 3002);
  const configPath = options.configPath ?? resolve(cwd, "shotcraft.config.json");

  process.stdout.write(
    `[shotcraft web] starting @shotcraft/web on http://localhost:${port}\n` +
      `[shotcraft web] local mode — bound to ${configPath}\n` +
      `[shotcraft web] live-demo + localhost capture enabled\n` +
      `[shotcraft web] open http://localhost:${port}/crawler\n`,
  );

  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      SHOTCRAFT_LIVE_DEMO: "1",
      SHOTCRAFT_WEB_LOCAL_MODE: "1",
      SHOTCRAFT_LOCAL_CONFIG_PATH: configPath,
      SHOTCRAFT_ALLOW_LOCAL: "1",
      NODE_ENV: "production",
      PORT: String(port),
      // Defensive: ensure no token gate is inherited from shell env in
      // local mode (the operator may have it set for hosted-deploy curl
      // scripts).
      SHOTCRAFT_LIVE_DEMO_TOKEN: "",
    },
    stdio: "inherit",
  });

  await new Promise<void>((resolveProcess) => {
    child.on("exit", (code) => {
      process.exit(code ?? 0);
      resolveProcess();
    });
  });
}

function resolveWebEntry(cwd: string): string {
  // 1. Consumer-project resolution.
  try {
    const req = createRequire(resolve(cwd, "package.json"));
    return req.resolve("@shotcraft/web");
  } catch {
    /* fall through */
  }
  // 2. Try to find the entry alongside the running shotcraft package —
  //    works when both shotcraft and @shotcraft/web are linked into the
  //    same consumer's node_modules (workspace dev).
  try {
    const req = createRequire(import.meta.url);
    return req.resolve("@shotcraft/web");
  } catch {
    /* fall through */
  }
  // 3. Workspace-clone fallback: walk up from this module looking for a
  //    sibling `packages/web/server/dist/index.js`. Lets `shotcraft web`
  //    work when invoked from anywhere inside (or against) a checkout
  //    of the monorepo without needing the user to install the web
  //    package as a dep first.
  const fromHere = dirname(fileURLToPath(import.meta.url));
  let candidate = fromHere;
  for (let i = 0; i < 6; i++) {
    const guess = resolve(candidate, "packages/web/server/dist/index.js");
    if (existsSync(guess)) return guess;
    const parent = dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  throw new Error(
    "shotcraft web: @shotcraft/web is not installed.\n" +
      "  Install it locally: `pnpm add -D @shotcraft/web`\n" +
      "  Or, if you're running from the Shotcraft monorepo, build it once:\n" +
      "    `pnpm --filter @shotcraft/web build`",
  );
}
