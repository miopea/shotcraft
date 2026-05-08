import type { ShotcraftConfig } from "./config/types.js";

export interface RunOptions {
  /** Run only the capture phase. */
  captureOnly?: boolean;
  /** Run only the render phase (assumes captures already exist). */
  renderOnly?: boolean;
  /** Render only this template id (skip the rest). */
  templateFilter?: string;
}

/**
 * End-to-end runner. Captures every screen × template combination then runs
 * the render phase against each template to produce final composites.
 *
 * This is the same code path as `npx shotcraft` (no subcommand). The CLI
 * subcommands `capture` and `render` reuse the underlying `runCapture` /
 * `runRender` exports for fine-grained control.
 *
 * NOTE: implementation lands in Phase 2/3. v0 stub validates that the public
 * surface compiles end-to-end.
 */
export async function run(
  _config: ShotcraftConfig,
  _options: RunOptions = {},
): Promise<void> {
  throw new Error(
    "shotcraft.run() is not yet implemented — this is the v0 scaffold. " +
      "Capture + render orchestration lands in Phase 2/3 of the v1 build.",
  );
}
