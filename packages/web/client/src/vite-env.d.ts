/// <reference types="vite/client" />

/**
 * Build-time constants injected via vite.config.ts `define`. Mirrors
 * the pattern used in `your project's version util`
 * and `budgetbug/client/vite.config.ts`: the version anchor lives in
 * package.json; Vite embeds it (plus the build's git SHA + ISO
 * timestamp) so the footer can show "v0.0.0 a1b2c3d" on every page.
 */
declare const __SHOTCRAFT_VERSION__: string;
declare const __SHOTCRAFT_GIT_SHA__: string;
declare const __SHOTCRAFT_BUILD_TIME__: string;
