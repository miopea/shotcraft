import type { ShotcraftConfig } from "./config/types.js";
import { runCapture } from "./capture/runner.js";
import { runRender } from "./render/runner.js";
import { loadTemplates } from "./template/load.js";

export interface RunOptions {
  /** Run only the capture phase. */
  captureOnly?: boolean;
  /** Run only the render phase (assumes captures already exist). */
  renderOnly?: boolean;
  /** Render only this template id (skip the rest). */
  templateFilter?: string;
  /** Working directory for resolving relative `outputDir` paths. */
  cwd?: string;
  /** Run Chromium with a head — useful for visually inspecting wrappers. */
  headed?: boolean;
}

/**
 * End-to-end runner. Loads templates once, captures every screen × template
 * combination at each template's viewport, then renders each combination
 * through its template's wrapper.html to produce the final composites.
 */
export async function run(config: ShotcraftConfig, options: RunOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const templates =
    config.templates && config.templates.length > 0
      ? await loadTemplates(config.templates, { cwd })
      : [];

  if (!options.renderOnly) {
    await runCapture(config, {
      cwd,
      headed: options.headed ?? false,
      templates,
    });
  }

  if (!options.captureOnly) {
    if (templates.length === 0) {
      console.log(
        "[shotcraft] no templates configured — skipping render. Add templates to your config to compose composites.",
      );
      return;
    }
    await runRender(config, {
      cwd,
      headed: options.headed ?? false,
      templates,
      ...(options.templateFilter !== undefined ? { templateFilter: options.templateFilter } : {}),
    });
  }
}
