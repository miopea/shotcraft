import { describe, expect, it } from "vitest";
import { captureFilename, deriveCaptureSpecs, resolveDefaults } from "../capture/spec.js";
import type { ShotcraftConfig } from "../config/types.js";

describe("resolveDefaults", () => {
  it("falls back to a 1280x800 desktop profile and dark theme when nothing set", () => {
    const { viewport, themes } = resolveDefaults(undefined);
    expect(viewport).toMatchObject({
      id: "default",
      width: 1280,
      height: 800,
      dpr: 2,
      isMobile: false,
    });
    expect(themes).toEqual(["dark"]);
  });

  it("respects user overrides", () => {
    const { viewport, themes } = resolveDefaults({
      viewport: { width: 428, height: 926, dpr: 3 },
      themes: ["light", "dark"],
      isMobile: true,
    });
    expect(viewport.width).toBe(428);
    expect(viewport.height).toBe(926);
    expect(viewport.dpr).toBe(3);
    expect(viewport.isMobile).toBe(true);
    expect(themes).toEqual(["light", "dark"]);
  });

  it("ignores empty theme arrays and falls back to the default", () => {
    const { themes } = resolveDefaults({ themes: [] });
    expect(themes).toEqual(["dark"]);
  });
});

describe("deriveCaptureSpecs", () => {
  const baseConfig: ShotcraftConfig = {
    target: "http://localhost:5173",
    screens: [
      { route: "/", name: "home", caption: "Home" },
      { route: "/about", name: "about", caption: "About" },
    ],
  };

  it("emits one spec per (screen × theme) when no templates configured", () => {
    const specs = deriveCaptureSpecs(
      { ...baseConfig, defaults: { themes: ["dark", "light"] } },
      "/tmp/raw",
    );
    expect(specs).toHaveLength(4);
    expect(specs.map((s) => s.outputPath)).toEqual([
      "/tmp/raw/home-default-dark.png",
      "/tmp/raw/home-default-light.png",
      "/tmp/raw/about-default-dark.png",
      "/tmp/raw/about-default-light.png",
    ]);
  });
});

describe("captureFilename", () => {
  it("formats name-viewportId-theme.png", () => {
    const out = captureFilename(
      { route: "/", name: "dashboard", caption: "" },
      {
        id: "iphone-6.5",
        width: 428,
        height: 926,
        dpr: 3,
        isMobile: true,
        userAgent: undefined,
      },
      "dark",
    );
    expect(out).toBe("dashboard-iphone-6.5-dark.png");
  });
});
