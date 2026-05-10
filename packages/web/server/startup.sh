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
FC_ALIASES="/etc/fonts/conf.d/99-shotcraft-aliases.conf"

if [ -f "$NEEDED_LIB" ] && [ -f "$INTER_FONT" ] && [ -f "$FC_ALIASES" ]; then
  echo "[startup] Chromium system deps + fonts + fontconfig aliases already installed."
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
  # generic.
  #
  # We install fontconfig (needed to read aliases below) but DON'T
  # rely on apt for the main UI fonts:
  #   - `fonts-inter` doesn't exist in Debian Bookworm.
  #   - `fonts-roboto` / `fonts-noto-core` apt-installs were flaky
  #     when the deploy ran in restricted contexts — we'd see them
  #     succeed-then-vanish across container restarts.
  # Solution: ship Inter .otf files in the deploy bundle itself
  # (server/fonts/) and copy them into /usr/share/fonts at startup.
  # Pure file copy, no apt dependency, no network call.
  apt-get install -y --no-install-recommends fontconfig
  # Copy bundled Inter into the system font dir.
  if [ -d "/home/site/wwwroot/server/fonts" ]; then
    mkdir -p /usr/share/fonts/truetype/inter
    cp /home/site/wwwroot/server/fonts/*.otf /usr/share/fonts/truetype/inter/ 2>/dev/null || true
    cp /home/site/wwwroot/server/fonts/*.ttf /usr/share/fonts/truetype/inter/ 2>/dev/null || true
    echo "[startup] Inter installed from deploy bundle:"
    ls /usr/share/fonts/truetype/inter/
  else
    echo "[startup] WARN: server/fonts/ not in deploy bundle — captures will use generic Linux fallback."
  fi
  # Map Tailwind's abstract font-family names (`system-ui`,
  # `ui-sans-serif`, `sans-serif`) to Inter so BudgetBug-style
  # CSS resolves to a quality font on Linux. Without this, Linux
  # fontconfig falls through to DejaVu / Liberation regardless of
  # Inter being installed — those families have no implicit alias.
  cat > /etc/fonts/conf.d/99-shotcraft-aliases.conf <<'CONF'
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <alias binding="strong"><family>system-ui</family><prefer><family>Inter</family><family>Roboto</family><family>Noto Sans</family></prefer></alias>
  <alias binding="strong"><family>ui-sans-serif</family><prefer><family>Inter</family><family>Roboto</family><family>Noto Sans</family></prefer></alias>
  <alias binding="strong"><family>-apple-system</family><prefer><family>Inter</family><family>Roboto</family><family>Noto Sans</family></prefer></alias>
  <alias binding="strong"><family>BlinkMacSystemFont</family><prefer><family>Inter</family><family>Roboto</family><family>Noto Sans</family></prefer></alias>
  <alias binding="strong"><family>SF Pro</family><prefer><family>Inter</family></prefer></alias>
  <alias binding="strong"><family>SF Pro Display</family><prefer><family>Inter</family></prefer></alias>
  <alias binding="strong"><family>SF Pro Text</family><prefer><family>Inter</family></prefer></alias>
  <alias binding="strong"><family>-apple-system-body</family><prefer><family>Inter</family></prefer></alias>
  <alias binding="weak"><family>sans-serif</family><prefer><family>Inter</family><family>Roboto</family><family>Noto Sans</family></prefer></alias>
</fontconfig>
CONF
  # Refresh Chromium's font cache so the new fonts + aliases are
  # usable immediately without a process restart.
  fc-cache -f >/dev/null 2>&1 || true
  echo "[startup] System deps + fonts + fontconfig aliases installed."
fi

echo "[startup] Starting server..."
exec node server/dist/index.js
