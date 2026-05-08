import type { ShotcraftConfig } from "./config/types.js";
import { runCapture } from "./capture/runner.js";

export interface RunOptions {
  /** Run only the capture phase. */
  captureOnly?: boolean;
  /** Run only the render phase (assumes captures already exist). */
  renderOnly?: boolean;
  /** Render only this template id (skip the rest). */
  templateFilter?: string;
  /** Working directory for resolving relative `outputDir` paths. */
  cwd?: string;
}

/**
 * End-to-end runner. Captures every screen × template combination then runs
 * the render phase against each template to produce final composites.
 *
 * Phase 2 ships only the capture half. Calls with `renderOnly` (or the
 * default end-to-end path) currently throw — render lands in Phase 3.
 */
export async function run(config: ShotcraftConfig, options: RunOptions = {}): Promise<void> {
  if (options.renderOnly) {
    throw new Error(
      "shotcraft.run({ renderOnly: true }) — render is not yet implemented (Phase 3).",
    );
  }
  await runCapture(config, options.cwd !== undefined ? { cwd: options.cwd } : {});
  if (!options.captureOnly) {
    // The end-to-end path will compose render in Phase 3; for now we run
    // capture and emit a clear notice rather than silently no-op.
    console.log("[shotcraft] capture complete; render phase will run in Phase 3 of the v1 build.");
  }
}
