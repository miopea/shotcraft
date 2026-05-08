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
 * NOTE: this is the v0 scaffold. Each subcommand currently exits with a
 * "not implemented" message. They land incrementally in Phase 2-7 of the
 * v1 build per .claude/plans/shotcraft-v1.md.
 */

const args = process.argv.slice(2);
const subcommand = args[0];

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
  -h, --help              Show this help
  -v, --version           Show version

DOCS
  https://shotcraft.dev
`.trim();

function notImplemented(name: string): never {
  console.error(
    `\nshotcraft ${name}: not implemented yet — v0 scaffold.\n\n` +
      `This subcommand lands in the v1 build. See:\n` +
      `  https://github.com/miopea/shotcraft/blob/main/.claude/plans/shotcraft-v1.md\n`,
  );
  process.exit(2);
}

if (args.includes("--version") || args.includes("-v")) {
  console.log(VERSION);
  process.exit(0);
}

if (args.includes("--help") || args.includes("-h") || subcommand === "help") {
  console.log(HELP);
  process.exit(0);
}

switch (subcommand) {
  case undefined:
  case "run":
    notImplemented("run");
    break;
  case "init":
    notImplemented("init");
    break;
  case "capture":
    notImplemented("capture");
    break;
  case "render":
    notImplemented("render");
    break;
  case "dev":
    notImplemented("dev");
    break;
  case "web":
    notImplemented("web");
    break;
  case "list":
    notImplemented("list");
    break;
  case "doctor":
    notImplemented("doctor");
    break;
  default:
    console.error(`\nshotcraft: unknown subcommand "${subcommand}"\n`);
    console.error(HELP);
    process.exit(1);
}
