#!/usr/bin/env bash
# Custom App Service startup. Azure's Node 22 Linux image doesn't ship the
# system libs Chromium needs (libglib, libnss, libpango, fonts-liberation,
# etc.), so the live-demo render pipeline fails with `libglib-2.0.so.0:
# cannot open shared object file` until those land. We install them once
# per container boot before handing off to the server.
#
# Skipped automatically when the deps are already present (`apt-get install`
# is idempotent + cached). On a cold start the install adds ~30-60s to the
# first request.
#
# Fonts are NOT installed here. They're shipped in the deploy bundle at
# `server/fonts/` (Inter .otf/.ttf), and `server/fonts/fonts.conf` is a
# fontconfig config that registers the dir + aliases system-ui / ui-sans-serif
# / etc. to Inter. The App Service env var
# `FONTCONFIG_FILE=/home/site/wwwroot/server/fonts/fonts.conf` points
# fontconfig at it. Earlier attempts to write fonts to `/usr/share/fonts`
# at boot were silently failing with EACCES — App Service's container user
# isn't root.

set -e

NEEDED_LIB="/usr/lib/x86_64-linux-gnu/libglib-2.0.so.0"

if [ -f "$NEEDED_LIB" ]; then
  echo "[startup] Chromium system deps already installed."
else
  echo "[startup] Installing Chromium system dependencies..."
  apt-get update -qq
  apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libdbus-1-3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    libxshmfence1 \
    fontconfig
  echo "[startup] Chromium system deps installed."
fi

# Pre-warm fontconfig cache against the bundled config so the first
# Chromium launch doesn't pay the scan cost. Best-effort — failures are
# fine (the Node process can launch Chromium without fc-cache having run).
mkdir -p /tmp/fontconfig-cache 2>/dev/null || true
FONTCONFIG_FILE=/home/site/wwwroot/server/fonts/fonts.conf fc-cache -f /home/site/wwwroot/server/fonts >/dev/null 2>&1 || true
echo "[startup] fc-match system-ui (with bundled conf): $(FONTCONFIG_FILE=/home/site/wwwroot/server/fonts/fonts.conf fc-match system-ui 2>&1 || echo 'unavailable')"

echo "[startup] Starting server..."
exec node server/dist/index.js
