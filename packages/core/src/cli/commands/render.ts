import { dirname } from "node:path";
import { loadConfig } from "../../config/load.js";
import { runRender } from "../../render/runner.js";

export interface RenderCliOptions {
  cwd?: string;
  configFile?: string;
  templateFilter?: string;
  headed?: boolean;
}

/**
 * CLI entry for `shotcraft render [template-id]`. Loads the user's config
 * and runs only the render phase against existing raw captures. Resolves
 * relative `outputDir` paths against the config file's directory.
 */
export async function runRenderCommand(options: RenderCliOptions = {}): Promise<void> {
  const { path, config } = await loadConfig({
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.configFile !== undefined ? { configFile: options.configFile } : {}),
  });
  await runRender(config, {
    cwd: dirname(path),
    headed: options.headed ?? false,
    ...(options.templateFilter !== undefined ? { templateFilter: options.templateFilter } : {}),
  });
}
