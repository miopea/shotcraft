import { describe, expect, it } from "vitest";
import { buildCompositeSpecs, buildWrapperUrl } from "../render/runner.js";
import type { LoadedTemplate } from "../template/load.js";
import type { ShotcraftConfig } from "../config/types.js";

const fakeTemplate = (
  id: string,
  themes: ReadonlyArray<"dark" | "light"> = ["dark", "light"],
): LoadedTemplate => ({
  template: {
    id,
    viewport: { width: 428, height: 926, dpr: 3 },
    output: { width: 1284, height: 2778 },
    themes,
    wrapperHtmlPath: "/abs/wrapper.html",
    isMobile: true,
  },
  themes,
  options: {},
  source: id,
});

const baseConfig: ShotcraftConfig = {
  target: "http://localhost:5173",
  screens: [
    { route: "/", name: "home", caption: "Welcome" },
    { route: "/about", name: "about", caption: "About", subtitle: "More" },
  ],
};

describe("buildCompositeSpecs", () => {
  it("produces (template × screen × theme) tuples with the right paths", () => {
    const specs = buildCompositeSpecs(baseConfig, "/raw", "/out", [
      fakeTemplate("app-store-iphone"),
    ]);
    expect(specs).toHaveLength(4);
    expect(specs[0]).toMatchObject({
      rawPath: "/raw/home-app-store-iphone-dark.png",
      outputPath: "/out/app-store-iphone/home-dark.png",
      theme: "dark",
    });
    expect(specs[3]).toMatchObject({
      rawPath: "/raw/about-app-store-iphone-light.png",
      outputPath: "/out/app-store-iphone/about-light.png",
    });
  });

  it("respects per-template theme overrides", () => {
    const specs = buildCompositeSpecs(baseConfig, "/raw", "/out", [
      fakeTemplate("app-store-iphone", ["dark"]),
    ]);
    // 2 screens × 1 theme = 2 specs
    expect(specs).toHaveLength(2);
    expect(specs.every((s) => s.theme === "dark")).toBe(true);
  });
});

describe("buildWrapperUrl", () => {
  const spec = {
    template: fakeTemplate("app-store-iphone").template,
    templateOptions: {},
    screen: { route: "/", name: "home", caption: "Hello & welcome" },
    theme: "dark" as const,
    rawPath: "/raw/home-app-store-iphone-dark.png",
    outputPath: "/out/app-store-iphone/home-dark.png",
  };

  it("URL-encodes captions and turns rawPath into a file:// URL", () => {
    const url = buildWrapperUrl(spec);
    expect(url.startsWith("file:///abs/wrapper.html?")).toBe(true);
    expect(url).toContain("caption=Hello+%26+welcome");
    expect(url).toContain("theme=dark");
    expect(url).toMatch(/imageUrl=file%3A%2F%2F.*home-app-store-iphone-dark\.png/);
  });

  it("includes subtitle only when defined on the screen", () => {
    const withSub = {
      ...spec,
      screen: { ...spec.screen, subtitle: "Subtitle here" },
    };
    const url = buildWrapperUrl(withSub);
    expect(url).toContain("subtitle=Subtitle+here");
    const withoutSub = buildWrapperUrl(spec);
    expect(withoutSub).not.toContain("subtitle=");
  });

  it("forwards primitive template options as opt.* params", () => {
    const withOpts = {
      ...spec,
      templateOptions: { accent: "#ff0000", scale: 1.25, mobile: true },
    };
    const url = buildWrapperUrl(withOpts);
    expect(url).toContain("opt.accent=%23ff0000");
    expect(url).toContain("opt.scale=1.25");
    expect(url).toContain("opt.mobile=true");
  });
});
