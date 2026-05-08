/**
 * Pure-logic tests for engine helpers — every function here would
 * have caught a real bug we shipped this week if the test had
 * existed first.
 */
import { describe, expect, it } from "vitest";
import {
  clampInt,
  normalizeUrl,
  parseSameOriginHref,
  pathForResult,
  pickShellLength,
  validateActions,
} from "../render-demo-engine.js";

describe("clampInt", () => {
  it("returns fallback when input isn't a number", () => {
    expect(clampInt("nope", 5, 1, 10)).toBe(5);
    expect(clampInt(undefined, 5, 1, 10)).toBe(5);
    expect(clampInt(null, 5, 1, 10)).toBe(5);
    expect(clampInt(NaN, 5, 1, 10)).toBe(5);
    expect(clampInt(Infinity, 5, 1, 10)).toBe(5);
  });
  it("clamps to range", () => {
    expect(clampInt(0, 5, 1, 10)).toBe(1);
    expect(clampInt(99, 5, 1, 10)).toBe(10);
    expect(clampInt(7, 5, 1, 10)).toBe(7);
  });
  it("floors decimals", () => {
    expect(clampInt(3.9, 5, 1, 10)).toBe(3);
  });
});

describe("normalizeUrl", () => {
  it("strips fragment", () => {
    expect(normalizeUrl("https://x.com/about#team")).toBe("https://x.com/about");
  });
  it("strips trailing slash on non-root paths so /about/ === /about", () => {
    expect(normalizeUrl("https://x.com/about/")).toBe("https://x.com/about");
  });
  it("preserves single root slash", () => {
    expect(normalizeUrl("https://x.com/")).toBe("https://x.com/");
  });
  it("returns null for invalid URLs", () => {
    expect(normalizeUrl("not a url")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
  });
});

describe("parseSameOriginHref", () => {
  const origin = "https://x.com";
  it("accepts same-origin http(s) hrefs", () => {
    expect(parseSameOriginHref("https://x.com/about", origin)).toBe("https://x.com/about");
  });
  it("rejects cross-origin", () => {
    expect(parseSameOriginHref("https://other.com/x", origin)).toBeNull();
  });
  it("rejects mailto:, tel:, javascript:", () => {
    expect(parseSameOriginHref("mailto:hi@x.com", origin)).toBeNull();
    expect(parseSameOriginHref("tel:555-1234", origin)).toBeNull();
    expect(parseSameOriginHref("javascript:void(0)", origin)).toBeNull();
  });
  it("strips fragments", () => {
    expect(parseSameOriginHref("https://x.com/about#team", origin)).toBe("https://x.com/about");
  });
  it("returns null for malformed URLs", () => {
    expect(parseSameOriginHref("not a url at all", origin)).toBeNull();
  });
});

describe("pathForResult", () => {
  const origin = "https://x.com";
  it("returns just pathname + search for same origin", () => {
    expect(pathForResult(new URL("https://x.com/about"), origin)).toBe("/about");
    expect(pathForResult(new URL("https://x.com/items?id=42"), origin)).toBe("/items?id=42");
  });
  it("returns root for /", () => {
    expect(pathForResult(new URL("https://x.com/"), origin)).toBe("/");
  });
  it("falls back to full URL when origins disagree", () => {
    expect(pathForResult(new URL("https://other.com/x"), origin)).toBe("https://other.com/x");
  });
});

describe("pickShellLength (SPA-shell filter)", () => {
  it("returns null when fewer than 3 probes (not enough signal)", () => {
    const counts = new Map([[100, 2]]);
    expect(pickShellLength(counts, 2)).toBeNull();
  });
  it("identifies the shell length when ≥50% of probes share it", () => {
    // 5 of 8 probes returned the same body length → SPA shell
    const counts = new Map([
      [1234, 5],
      [2200, 1],
      [3300, 1],
      [4400, 1],
    ]);
    expect(pickShellLength(counts, 8)).toBe(1234);
  });
  it("returns null when no length dominates", () => {
    // All distinct → real multi-page site, keep all
    const counts = new Map([
      [100, 1],
      [200, 1],
      [300, 1],
      [400, 1],
    ]);
    expect(pickShellLength(counts, 4)).toBeNull();
  });
  it("uses ceil(total/2) as threshold (avoids off-by-one)", () => {
    // total=5 → threshold=3. Length with 3 wins; length with 2 doesn't.
    expect(pickShellLength(new Map([[100, 3]]), 5)).toBe(100);
    expect(pickShellLength(new Map([[100, 2]]), 5)).toBeNull();
  });
});

describe("validateActions", () => {
  it("accepts an empty array", () => {
    expect(validateActions([])).toBeNull();
  });
  it("rejects non-object entries", () => {
    const r = validateActions([null]);
    expect(r?.error).toMatch(/must be an object/);
  });
  it("rejects unknown action type", () => {
    const r = validateActions([{ type: "fly" }]);
    expect(r?.error).toMatch(/not supported/);
  });
  it("requires selector for click", () => {
    expect(validateActions([{ type: "click" }])?.error).toMatch(/selector/);
    expect(validateActions([{ type: "click", selector: "" }])?.error).toMatch(/selector/);
    expect(validateActions([{ type: "click", selector: "#go" }])).toBeNull();
  });
  it("requires selector + value for fill", () => {
    expect(validateActions([{ type: "fill", selector: "#in" }])?.error).toMatch(/value/);
    expect(validateActions([{ type: "fill", selector: "#in", value: "x" }])).toBeNull();
  });
  it("requires selector + key for press", () => {
    expect(validateActions([{ type: "press", selector: "#in" }])?.error).toMatch(/key/);
    expect(validateActions([{ type: "press", selector: "#in", key: "Enter" }])).toBeNull();
  });
  it("clamps wait ms to 0..30000", () => {
    expect(validateActions([{ type: "wait", ms: -1 }])?.error).toMatch(/0..30000/);
    expect(validateActions([{ type: "wait", ms: 30001 }])?.error).toMatch(/0..30000/);
    expect(validateActions([{ type: "wait", ms: 1000 }])).toBeNull();
  });
  it("requires selector for waitForSelector", () => {
    expect(validateActions([{ type: "waitForSelector" }])?.error).toMatch(/selector/);
  });
  it("requires url for waitForUrl", () => {
    expect(validateActions([{ type: "waitForUrl" }])?.error).toMatch(/url/);
    expect(validateActions([{ type: "waitForUrl", url: "**/dashboard" }])).toBeNull();
  });
  it("scroll accepts selector OR y (or neither — engine treats as no-op)", () => {
    // Note: current engine accepts empty scroll. Arguably should reject it,
    // but matching current behavior here so the test reflects reality.
    expect(validateActions([{ type: "scroll" }])).toBeNull();
    expect(validateActions([{ type: "scroll", y: 100 }])).toBeNull();
    expect(validateActions([{ type: "scroll", selector: ".hero" }])).toBeNull();
  });
  it("scroll rejects wrong-type selector or y", () => {
    expect(validateActions([{ type: "scroll", y: "100" }])?.error).toMatch(/scroll/);
    expect(validateActions([{ type: "scroll", selector: 42 }])?.error).toMatch(/scroll/);
  });
  it("rejects more than MAX_ACTIONS", () => {
    const tooMany = Array.from({ length: 21 }, () => ({ type: "wait", ms: 1 }));
    expect(validateActions(tooMany)?.error).toMatch(/Too many actions/);
  });
  it("error message names the failing index", () => {
    const r = validateActions([{ type: "click", selector: "#a" }, { type: "click" }]);
    expect(r?.error).toMatch(/actions\[1\]/);
  });
});
