import { describe, expect, it } from "vitest";
import { defineConfig } from "../config/defineConfig.js";

describe("defineConfig", () => {
  it("returns its input unchanged", () => {
    const cfg = {
      target: "http://localhost:5173",
      screens: [{ route: "/", name: "home", caption: "Hello" }],
    } as const;
    const result = defineConfig({ ...cfg });
    expect(result).toEqual(cfg);
  });
});
