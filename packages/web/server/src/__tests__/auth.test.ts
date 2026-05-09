/**
 * Tests for the auth helpers that have been the source of several
 * silent-failure bugs:
 *   - fillFirstMatch / clickFirstMatch fallback chains
 *   - scrapeVisibleAuthError login-error scraping
 *
 * Pattern: mock the small slice of Playwright's Page that each helper
 * actually touches. Same approach as `packages/core/src/__tests__/auth.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { clickFirstMatch, fillFirstMatch, scrapeVisibleAuthError } from "../render-demo-engine.js";

interface FakeLocator {
  click: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  pressSequentially: ReturnType<typeof vi.fn>;
  first: () => FakeLocator;
}

interface FakePage {
  click: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
  locator: ReturnType<typeof vi.fn>;
  /** Selectors whose .click() should reject (simulates "not found"). */
  rejectFillFor?: Set<string>;
}

/**
 * Builds a page mock + locator factory. fillFirstMatch's "find a
 * matching field" loop uses `locator(sel).first().click()` as the
 * existence probe, so we drive resolution by configuring which
 * selectors should reject the click.
 */
function makePage(opts: { rejectFillFor?: Set<string> } = {}): FakePage {
  const page: FakePage = {
    click: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(null),
    locator: vi.fn(),
    ...(opts.rejectFillFor ? { rejectFillFor: opts.rejectFillFor } : {}),
  };
  page.locator = vi.fn((selector: string) => {
    const reject = page.rejectFillFor?.has(selector) ?? false;
    const loc: FakeLocator = {
      click: vi.fn(reject ? () => Promise.reject(new Error("nope")) : () => Promise.resolve()),
      fill: vi.fn().mockResolvedValue(undefined),
      pressSequentially: vi.fn().mockResolvedValue(undefined),
      first: () => loc,
    };
    return loc;
  });
  return page;
}

describe("fillFirstMatch", () => {
  it("uses the primary selector when it succeeds", async () => {
    const page = makePage();
    await fillFirstMatch(page as unknown as Page, "email", "input#email", "x@y.com", []);
    expect(page.locator).toHaveBeenCalledTimes(1);
    expect(page.locator).toHaveBeenCalledWith("input#email");
  });

  it("falls through to fallbacks when primary doesn't match", async () => {
    const page = makePage({ rejectFillFor: new Set(["input[name=email]"]) });
    await fillFirstMatch(page as unknown as Page, "email", "input[name=email]", "x@y.com", [
      "input[type=email]",
    ]);
    expect(page.locator).toHaveBeenNthCalledWith(1, "input[name=email]");
    expect(page.locator).toHaveBeenNthCalledWith(2, "input[type=email]");
    expect(page.locator).toHaveBeenCalledTimes(2);
  });

  it("dedupes fallbacks that match the primary", async () => {
    const page = makePage({ rejectFillFor: new Set(["input[name=email]"]) });
    // Primary AND first fallback are the same selector — second fallback resolves
    await fillFirstMatch(page as unknown as Page, "email", "input[name=email]", "x@y.com", [
      "input[name=email]",
      "input[type=email]",
    ]);
    // Only "input[name=email]" (once) and "input[type=email]" tried.
    expect(page.locator).toHaveBeenCalledTimes(2);
  });

  it("throws an error naming every selector tried when all fail", async () => {
    const page = makePage({
      rejectFillFor: new Set(["input[name=email]", "input[type=email]", "input#email"]),
    });
    await expect(
      fillFirstMatch(page as unknown as Page, "email", "input[name=email]", "x", [
        "input[type=email]",
        "input#email",
      ]),
    ).rejects.toThrow(
      /email field not found.*input\[name=email\].*input\[type=email\].*input#email/,
    );
  });

  it("types the value via pressSequentially (real keystrokes)", async () => {
    // Real keystrokes are required for React controlled-input forms
    // where page.fill alone leaves React state empty. Verify we go
    // through pressSequentially, not just .fill.
    const page = makePage();
    await fillFirstMatch(page as unknown as Page, "email", "input#email", "demo@x.com", []);
    // The locator() factory inside makePage returns a fresh mock per
    // call. To inspect what got typed, capture the locator return
    // value via the factory. Easier: re-run the call with a custom
    // factory that records.
    const calls: Array<{ value: string }> = [];
    interface RecordingLoc {
      click: ReturnType<typeof vi.fn>;
      fill: ReturnType<typeof vi.fn>;
      pressSequentially: ReturnType<typeof vi.fn>;
      first(): RecordingLoc;
    }
    page.locator = vi.fn(() => {
      const loc: RecordingLoc = {
        click: vi.fn().mockResolvedValue(undefined),
        fill: vi.fn().mockResolvedValue(undefined),
        pressSequentially: vi.fn((value: string) => {
          calls.push({ value });
          return Promise.resolve();
        }),
        first: () => loc,
      };
      return loc;
    });
    await fillFirstMatch(page as unknown as Page, "email", "input#email", "demo@x.com", []);
    expect(calls).toEqual([{ value: "demo@x.com" }]);
  });
});

describe("clickFirstMatch", () => {
  it("falls through to fallbacks when primary throws", async () => {
    const page = makePage();
    page.click = vi.fn().mockRejectedValueOnce(new Error("nope")).mockResolvedValueOnce(undefined);
    await clickFirstMatch(page as unknown as Page, "submit", "button[type=submit]", [
      'button:has-text("Sign in")',
    ]);
    expect(page.click).toHaveBeenCalledTimes(2);
  });

  it("error names every tried selector", async () => {
    const page = makePage();
    page.click = vi.fn().mockRejectedValue(new Error("nope"));
    await expect(
      clickFirstMatch(page as unknown as Page, "submit", "button.go", [
        "button[type=submit]",
        'button:has-text("Login")',
      ]),
    ).rejects.toThrow(/submit button not found.*button\.go.*button\[type=submit\].*Login/);
  });
});

describe("scrapeVisibleAuthError", () => {
  it("returns the error string when page.evaluate yields one", async () => {
    const page = makePage();
    page.evaluate = vi.fn().mockResolvedValue("Invalid email or password");
    expect(await scrapeVisibleAuthError(page as unknown as Page)).toBe("Invalid email or password");
  });
  it("returns null when no error visible", async () => {
    const page = makePage();
    page.evaluate = vi.fn().mockResolvedValue(null);
    expect(await scrapeVisibleAuthError(page as unknown as Page)).toBeNull();
  });
  it("returns null when page.evaluate throws", async () => {
    const page = makePage();
    page.evaluate = vi.fn().mockRejectedValue(new Error("page closed"));
    expect(await scrapeVisibleAuthError(page as unknown as Page)).toBeNull();
  });
  it("returns null on non-string evaluate results", async () => {
    const page = makePage();
    page.evaluate = vi.fn().mockResolvedValue(42);
    expect(await scrapeVisibleAuthError(page as unknown as Page)).toBeNull();
  });
});
