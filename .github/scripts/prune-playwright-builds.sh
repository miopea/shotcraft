#!/usr/bin/env bash
# Deletes the Playwright browser builds in the App Service's
# /home/site/wwwroot/ms-playwright that the deploy just made did not ship.
#
# Why: the deploy (OneDeploy, no `clean`) adds files to wwwroot but never
# removes any, so every Playwright upgrade left another ~700 MB browser set
# behind. By 2026-11-17 that was 4.8 GB on the plan's shared 10 GiB /home.
# `clean: true` is not the fix: it would also wipe wwwroot files the bundle
# doesn't contain (Oryx's node_modules.tar.zst and oryx-manifest.toml, ...).
#
# Deletes only ms-playwright entries named like a Playwright build
# (<name>-<revision>, e.g. chromium-1254) that are absent from the shipped
# set. Everything else there (.links, anything unrecognised) is left alone,
# and nothing outside ms-playwright is touched. It refuses to delete
# anything unless the shipped set has a chromium build and every shipped
# build is already on the server.
#
# Usage: prune-playwright-builds.sh <app-name> <shipped ms-playwright dir> [--dry-run]
# Needs an az login that can reach the app's Kudu (SCM) site. --dry-run
# makes GET requests only.
set -euo pipefail
export LC_ALL=C

if [ $# -lt 2 ] || [ $# -gt 3 ] || { [ $# -eq 3 ] && [ "$3" != "--dry-run" ]; }; then
  echo "usage: $0 <app-name> <shipped ms-playwright dir> [--dry-run]" >&2
  exit 2
fi
APP="$1"
SHIPPED_DIR="$2"
DRY_RUN="${3:-}"

VFS="https://$APP.scm.azurewebsites.net/api/vfs/site/wwwroot/ms-playwright"
RESOURCE="https://management.azure.com/"
BUILD_RE='^[a-z][a-z_-]*-[0-9]+$'

indent() { sed 's/^/  /'; }

# Names in a newline list that look like a Playwright build, sorted.
builds() { grep -E "$BUILD_RE" | sort || true; }

remote_entries() {
  az rest --method get --url "$VFS/" --resource "$RESOURCE" -o json | jq -r '.[].name' | sort
}

[ -d "$SHIPPED_DIR" ] || { echo "::error::$SHIPPED_DIR does not exist; refusing to prune" >&2; exit 1; }
shipped=$(find "$SHIPPED_DIR" -mindepth 1 -maxdepth 1 -printf '%f\n' | builds)
if ! grep -qE '^chromium-[0-9]+$' <<<"$shipped"; then
  echo "::error::no chromium-<rev> build in $SHIPPED_DIR; refusing to prune" >&2
  exit 1
fi
echo "Shipped by this deploy:"
indent <<<"$shipped"

before=$(remote_entries)
echo "On $APP before prune:"
indent <<<"$before"

missing=$(comm -23 <(echo "$shipped") <(echo "$before"))
if [ -n "$missing" ]; then
  echo "::error::shipped builds are not on the server, so the deploy did not land them; refusing to prune:" >&2
  indent <<<"$missing" >&2
  exit 1
fi

stale=$(comm -13 <(echo "$shipped") <(builds <<<"$before"))
if [ -z "$stale" ]; then
  echo "Nothing to prune."
  exit 0
fi

while IFS= read -r name; do
  if [ "$DRY_RUN" = "--dry-run" ]; then
    echo "Would delete ms-playwright/$name"
    continue
  fi
  echo "Deleting ms-playwright/$name"
  az rest --method delete --url "$VFS/$name/?recursive=true" \
    --headers "If-Match=*" --resource "$RESOURCE" -o none
done <<<"$stale"

[ "$DRY_RUN" = "--dry-run" ] && exit 0

after=$(remote_entries)
echo "On $APP after prune:"
indent <<<"$after"

left=$(comm -13 <(echo "$shipped") <(builds <<<"$after"))
lost=$(comm -23 <(echo "$shipped") <(echo "$after"))
if [ -n "$left" ] || [ -n "$lost" ]; then
  [ -z "$left" ] || { echo "::error::still on the server after prune:" >&2; indent <<<"$left" >&2; }
  [ -z "$lost" ] || { echo "::error::shipped builds missing after prune:" >&2; indent <<<"$lost" >&2; }
  exit 1
fi
echo "Pruned. ms-playwright holds only the builds this deploy shipped."
