import { dirname } from "node:path";
import { loadConfig } from "../../config/load.js";
import { runCapture } from "../../capture/runner.js";

export interface CaptureCliOptions {
  cwd?: string;
  configFile?: string;
  headed?: boolean;
}

/**
 * CLI entry for `shotcraft capture`. Loads the user's config and runs the
 * capture phase only. Resolves relative `outputDir` paths against the config
 * file's directory rather than `process.cwd()` so behaviour is consistent
 * regardless of where the CLI is invoked from.
 */
export async function runCaptureCommand(options: CaptureCliOptions = {}): Promise<void> {
  const { path, config } = await loadConfig({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.configFile !== undefined ? { configFile: options.configFile } : {}),
  });
  await runCapture(config, {
    cwd: dirname(path),
    headed: options.headed ?? false,
  });
}
