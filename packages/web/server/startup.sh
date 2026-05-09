#!/usr/bin/env bash
# Custom App Service startup. Azure's Node 22 Linux image doesn't ship the
# system libs Chromium needs (libglib, libnss, libpango, fonts-liberation,
# etc.), so the live-demo render pipeline fails with `libglib-2.0.so.0:
# cannot open shared object file` until those land. We install them once
# per container boot before handing off to the server.
#
# Skipped automatically when the deps are already present (`apt-get install`
# is idempotent + cached). On a cold start the install adds ~30–60s to the
# first request.

set -e

NEEDED_LIB="/usr/lib/x86_64-linux-gnu/libglib-2.0.so.0"
INTER_FONT="/usr/share/fonts/truetype/inter/Inter-Regular.otf"

if [ -f "$NEEDED_LIB" ] && [ -f "$INTER_FONT" ]; then
  echo "[startup] Chromium system deps + fonts already installed."
else
  echo "[startup] Installing Chromium system dependencies + UI fonts..."
  apt-get update -qq
  # Chromium runtime libs.
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
    libxshmfence1
  # Quality UI fonts. Most modern web apps (BudgetBug included) use
  # Tailwind's `font-sans` stack: `ui-sans-serif, system-ui,
  # sans-serif, ...`. On Linux without good fonts installed,
  # Chromium falls back to Liberation/DejaVu and the result looks
  # generic-monospace-ish. Inter + Roboto + Noto give us the same
  # rendering quality web apps target on macOS / iOS.
  apt-get install -y --no-install-recommends \
    fonts-liberation \
    fonts-inter \
    fonts-roboto \
    fonts-noto-core \
    fonts-noto-color-emoji \
    fontconfig
  # Refresh Chromium's font cache so the new fonts are usable
  # immediately without a process restart.
  fc-cache -f >/dev/null 2>&1 || true
  echo "[startup] System deps + fonts installed."
fi

echo "[startup] Starting server..."
exec node server/dist/index.js
