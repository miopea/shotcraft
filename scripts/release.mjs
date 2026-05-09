#!/usr/bin/env node
/**
 * Shotcraft release script — drives both halves of the workspace's
 * versioning story in one shot:
 *
 *   1. **`@shotcraft/web`** (the hosted companion, private, surfaced
 *      in the Crawler footer). Bumped via conventional-commit semver
 *      based on commits since the last `release:` commit. NOT managed
 *      by Changesets because it's in `.changeset/config.json`'s
 *      `ignore` list (private packages aren't published to npm).
 *
 *   2. **The npm-published packages** (`shotcraft`, `@shotcraft/template-*`).
 *      Bumped by `pnpm changeset version`, which consumes pending
 *      `.changeset/*.md` entries and writes per-package CHANGELOGs.
 *
 * Bump kind for `@shotcraft/web` is inferred the same way budgetbug's
 * release.mjs does it:
 *   - `BREAKING CHANGE:` in body  OR  `type!:` in subject  → major
 *   - `feat:` / `feat(scope):` subject                     → minor
 *   - everything else                                      → patch
 *
 * Contract (per ~/.claude/CLAUDE.md):
 *   - Print new @shotcraft/web version to stdout (and nothing else)
 *     on success — that's the user-facing version operators care about.
 *   - Diagnostics → stderr.
 *   - Exit 0 on success, non-zero on failure.
 *   - Idempotent: with no commits or pending changesets since last
 *     release, prints the current version unchanged.
 *
 * Usage:
 *   node scripts/release.mjs           # dry-run (prints intent, no writes)
 *   node scripts/release.mjs --apply   # bump + run pnpm changeset version
 *
 * Invoked automatically by `/ship` (no manual call needed).
 */

import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_PKG_PATH = join(REPO_ROOT, "packages/web/package.json");
const CHANGESET_DIR = join(REPO_ROOT, ".changeset");

const apply = process.argv.includes("--apply");

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: REPO_ROOT, encoding: "utf8" }).trim();
}

function fail(msg) {
  process.stderr.write(`release: ${msg}\n`);
  process.exit(1);
}

/**
 * SHA of the most recent commit whose subject starts with `release:`
 * (the convention `/ship` uses for release commits). Null if no such
 * commit exists yet — indicates a never-released-before workspace.
 */
function findLastReleaseHash() {
  try {
    const out = git("log -n 1 --format=%H --grep=^release:");
    return out || null;
  } catch {
    return null;
  }
}

function commitsSince(hash) {
  const range = hash ? `${hash}..HEAD` : "HEAD";
  const raw = execSync(`git log ${range} --format=%B%x00`, {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return raw
    .split("\0")
    .map((s) => s.trim())
    .filter(Boolean);
}

function detectBump(commits) {
  let bump = "patch";
  for (const msg of commits) {
    const subject = msg.split("\n", 1)[0];
    const body = msg.slice(subject.length);
    if (/BREAKING[ -]CHANGE:/.test(body) || /^[a-z]+(\([^)]+\))?!:\s/.test(subject)) {
      return "major";
    }
    if (/^feat(\([^)]+\))?:\s/.test(subject)) {
      bump = "minor";
    }
  }
  return bump;
}

function bumpSemver(version, kind) {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`Unrecognized semver in @shotcraft/web package.json: ${version}`);
  }
  const [maj, min, pat] = parts;
  if (kind === "major") return `${maj + 1}.0.0`;
  if (kind === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

function patchJsonField(path, mutator) {
  const raw = readFileSync(path, "utf8");
  const obj = JSON.parse(raw);
  mutator(obj);
  writeFileSync(path, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

function pendingChangesets() {
  return readdirSync(CHANGESET_DIR).filter(
    (f) => f.endsWith(".md") && f !== "README.md",
  );
}

function hasOperatorChanges() {
  // Anything tracked that's staged or unstaged — not untracked files
  // (.claude/, coverage/, etc.). /ship runs us before /commit so the
  // operator's intent to ship lives in the working tree at this moment.
  const status = git("status --porcelain --untracked-files=no");
  return status.length > 0;
}

// ── Step 1: bump @shotcraft/web ───────────────────────────────────

const webPkg = JSON.parse(readFileSync(WEB_PKG_PATH, "utf8"));
const currentVersion = webPkg.version;
const lastRelease = findLastReleaseHash();
const commits = commitsSince(lastRelease);

let newVersion = currentVersion;
let bumpKind = null;

if (commits.length === 0 && !hasOperatorChanges()) {
  process.stderr.write(
    `release: no commits or working-tree changes since last release ` +
      `(${lastRelease?.slice(0, 7) ?? "init"}). @shotcraft/web stays at ${currentVersion}.\n`,
  );
} else {
  bumpKind = detectBump(commits);
  newVersion = bumpSemver(currentVersion, bumpKind);
  process.stderr.write(
    `release: @shotcraft/web ${currentVersion} → ${newVersion} (${bumpKind}, ` +
      `${commits.length} commit${commits.length === 1 ? "" : "s"} since ` +
      `${lastRelease?.slice(0, 7) ?? "init"})\n`,
  );
}

// ── Step 2: report on changesets for npm-published packages ───────

const pendingFiles = pendingChangesets();
if (pendingFiles.length > 0) {
  process.stderr.write(
    `release: ${pendingFiles.length} pending changeset${pendingFiles.length === 1 ? "" : "s"} for npm packages:\n`,
  );
  for (const f of pendingFiles) {
    process.stderr.write(`  - ${f}\n`);
  }
} else {
  process.stderr.write(`release: no pending changesets — npm packages stay at current versions\n`);
}

// ── Step 3: apply the writes (or dry-run exit) ───────────────────

if (!apply) {
  process.stderr.write(`release: dry-run — pass --apply to write changes.\n`);
  process.stdout.write(`${newVersion}\n`);
  process.exit(0);
}

if (bumpKind) {
  patchJsonField(WEB_PKG_PATH, (obj) => {
    obj.version = newVersion;
  });
  process.stderr.write(`release: wrote ${WEB_PKG_PATH}\n`);
}

if (pendingFiles.length > 0) {
  try {
    execSync("pnpm changeset version", { stdio: "inherit", cwd: REPO_ROOT });
  } catch (err) {
    fail(`pnpm changeset version failed: ${err && err.message ? err.message : err}`);
  }
}

process.stdout.write(`${newVersion}\n`);
