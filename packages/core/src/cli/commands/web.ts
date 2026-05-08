import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";

export interface WebCliOptions {
  cwd?: string;
  /** Override the default port (3002 for the server). */
  port?: number;
}

/**
 * CLI entry for `shotcraft web`. Boots the @shotcraft/web hosted companion's
 * Express server with `SHOTCRAFT_LIVE_DEMO=1` set so the live-demo endpoint
 * is enabled. The built server already serves the React client out of
 * `dist/client/`, so a single process gives the operator the full
 * gallery + config builder + (locally) the live demo.
 *
 * Resolution rules:
 *   - Prefer the consumer project's `@shotcraft/web` (resolved via
 *     `createRequire` anchored at their `package.json`).
 *   - Fall back to a pre-built bundle inside the workspace's
 *     `packages/web/dist/server/index.js` when running from a clone.
 *   - Otherwise emit a clear error pointing at the workspace dev command.
 */
export async function runWebCommand(options: WebCliOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const entry = resolveWebEntry(cwd);
  const port = options.port ?? Number(process.env.PORT ?? 3002);

  process.stdout.write(
    `[shotcraft web] starting @shotcraft/web on http://localhost:${port}\n` +
      `[shotcraft web] live-demo enabled (SHOTCRAFT_LIVE_DEMO=1)\n`,
  );

  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      SHOTCRAFT_LIVE_DEMO: "1",
      NODE_ENV: "production",
      PORT: String(port),
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
  // 2. Try to find the entry alongside the running shotcraft package — works
  //    when both shotcraft and @shotcraft/web are linked into the same
  //    consumer's node_modules (workspace dev).
  try {
    const req = createRequire(import.meta.url);
    return req.resolve("@shotcraft/web");
  } catch {
    /* fall through */
  }
  throw new Error(
    "shotcraft web: @shotcraft/web is not installed.\n" +
      "  Install it locally: `pnpm add -D @shotcraft/web`\n" +
      "  Or, if you're running from the Shotcraft monorepo, use\n" +
      "  `pnpm --filter @shotcraft/web dev` for the dev experience.",
  );
}
