#!/usr/bin/env node
/**
 * Shotcraft CLI entry point.
 *
 * Subcommands:
 *   shotcraft               — capture + render end-to-end (default)
 *   shotcraft init          — scaffold a shotcraft.config.ts
 *   shotcraft capture       — run only the capture phase
 *   shotcraft render [id]   — run only the render phase, optionally for one template
 *   shotcraft dev           — hot-reload preview for template authors
 *   shotcraft list          — list discovered templates from package.json
 *   shotcraft doctor        — sanity-check config + reach target + login works
 *   shotcraft --version
 *   shotcraft --help
 *
 * Phases 2–8 implement: init, capture, render, doctor, web, plus the no-arg
 * run path (capture → render). Future phases fill in list, dev.
 */

import { runInit } from "./commands/init.js";
import { runCaptureCommand } from "./commands/capture.js";
import { runRenderCommand } from "./commands/render.js";
import { runDoctor } from "./commands/doctor.js";
import { runWebCommand } from "./commands/web.js";
import { run } from "../run.js";
import { loadConfig } from "../config/load.js";
import { dirname } from "node:path";

const VERSION = "0.0.0";

const HELP = `
shotcraft — capture your live app, ship every screenshot you need

USAGE
  shotcraft [subcommand] [options]

SUBCOMMANDS
  (no subcommand)         Run capture + render end-to-end
  init                    Scaffold a shotcraft.config.ts in the current directory
  capture                 Run only the capture phase
  render [template-id]    Run only the render phase, optionally for one template
  dev                     Hot-reload preview for template authors
  web                     Launch the local web companion (gallery, config builder, live demo)
  list                    List installed templates
  doctor                  Sanity-check config + target reachability

OPTIONS
  -c, --config <path>     Path to a shotcraft.config.{ts,js} (default: search cwd)
  -f, --force             Allow init to overwrite an existing config
  --headed                Run capture with a visible browser (debugging)
  -h, --help              Show this help
  -v, --version           Show version

DOCS
  https://shotcraft.dev
`.trim();

interface ParsedArgs {
  subcommand: string | undefined;
  flags: {
    help: boolean;
    version: boolean;
    force: boolean;
    headed: boolean;
    configFile: string | undefined;
  };
  positional: string[];
}

function parseArgs(argv: ReadonlyArray<string>): ParsedArgs {
  const flags: ParsedArgs["flags"] = {
    help: false,
    version: false,
    force: false,
    headed: false,
    configFile: undefined,
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--version" || a === "-v") flags.version = true;
    else if (a === "--force" || a === "-f") flags.force = true;
    else if (a === "--headed") flags.headed = true;
    else if (a === "--config" || a === "-c") {
      const next = argv[i + 1];
      if (!next) {
        process.stderr.write(`shotcraft: --config requires a path\n`);
        process.exit(1);
      }
      flags.configFile = next;
      i++;
    } else if (typeof a === "string" && a.startsWith("--config=")) {
      flags.configFile = a.slice("--config=".length);
    } else if (typeof a === "string") {
      positional.push(a);
    }
  }
  return {
    subcommand: positional[0],
    positional: positional.slice(1),
    flags,
  };
}

function notImplemented(name: string): never {
  process.stderr.write(
    `\nshotcraft ${name}: not implemented yet — lands in a later phase.\n` +
      `See https://github.com/miopea/shotcraft/blob/main/.claude/plans/shotcraft-v1.md\n`,
  );
  process.exit(2);
}

async function dispatch(args: ParsedArgs): Promise<void> {
  if (args.flags.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (args.flags.help || args.subcommand === "help") {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  switch (args.subcommand) {
    case undefined:
    case "run": {
      // End-to-end: load config once, do capture then render in a single browser-spanning pass.
      const { path, config } = await loadConfig(
        args.flags.configFile !== undefined ? { configFile: args.flags.configFile } : {},
      );
      await run(config, { cwd: dirname(path), headed: args.flags.headed });
      process.stdout.write("\nshotcraft: capture + render complete.\n");
      return;
    }
    case "init": {
      const result = await runInit({ force: args.flags.force });
      if (result.written) {
        process.stdout.write(
          `Wrote ${result.path}\nNext: edit it and run \`shotcraft capture\`.\n`,
        );
      } else {
        process.stderr.write(
          `Refusing to overwrite ${result.path}. Re-run with --force to replace it.\n`,
        );
        process.exit(1);
      }
      return;
    }
    case "capture":
      await runCaptureCommand({
        ...(args.flags.configFile !== undefined ? { configFile: args.flags.configFile } : {}),
        headed: args.flags.headed,
      });
      return;
    case "doctor": {
      const report = await runDoctor(
        args.flags.configFile !== undefined ? { configFile: args.flags.configFile } : {},
      );
      if (report.warnings.length > 0) {
        for (const w of report.warnings) process.stdout.write(`! ${w}\n`);
      }
      if (!report.ok) {
        process.stderr.write(`\nshotcraft doctor: ${report.problems.length} problem(s):\n`);
        for (const p of report.problems) process.stderr.write(`  - ${p}\n`);
        process.exit(1);
      }
      process.stdout.write("\nshotcraft doctor: all checks passed.\n");
      return;
    }
    case "render": {
      const filter = args.positional[0];
      await runRenderCommand({
        ...(args.flags.configFile !== undefined ? { configFile: args.flags.configFile } : {}),
        ...(filter !== undefined ? { templateFilter: filter } : {}),
        headed: args.flags.headed,
      });
      return;
    }
    case "web": {
      await runWebCommand();
      return;
    }
    case "dev":
    case "list":
      notImplemented(args.subcommand);
    // eslint-disable-next-line no-fallthrough
    default:
      process.stderr.write(`\nshotcraft: unknown subcommand "${args.subcommand}"\n\n`);
      process.stderr.write(`${HELP}\n`);
      process.exit(1);
  }
}

const args = parseArgs(process.argv.slice(2));
dispatch(args).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\nshotcraft: ${message}\n`);
  process.exit(1);
});
