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

interface FakePage {
  fill: ReturnType<typeof vi.fn>;
  click: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
  locator: ReturnType<typeof vi.fn>;
}

function makePage(overrides: Partial<FakePage> = {}): FakePage {
  return {
    fill: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(null),
    locator: vi.fn(),
    ...overrides,
  };
}

describe("fillFirstMatch", () => {
  it("uses the primary selector when it succeeds", async () => {
    const page = makePage();
    await fillFirstMatch(page as unknown as Page, "email", "input#email", "x@y.com", []);
    expect(page.fill).toHaveBeenCalledTimes(1);
    expect(page.fill).toHaveBeenCalledWith("input#email", "x@y.com", expect.any(Object));
  });

  it("falls through to fallbacks when primary throws", async () => {
    const page = makePage({
      fill: vi.fn().mockRejectedValueOnce(new Error("not found")).mockResolvedValueOnce(undefined),
    });
    await fillFirstMatch(page as unknown as Page, "email", "input[name=email]", "x@y.com", [
      "input[type=email]",
    ]);
    expect(page.fill).toHaveBeenCalledTimes(2);
    expect(page.fill).toHaveBeenNthCalledWith(
      1,
      "input[name=email]",
      "x@y.com",
      expect.any(Object),
    );
    expect(page.fill).toHaveBeenNthCalledWith(
      2,
      "input[type=email]",
      "x@y.com",
      expect.any(Object),
    );
  });

  it("dedupes fallbacks that match the primary", async () => {
    const page = makePage({
      fill: vi.fn().mockRejectedValueOnce(new Error("not found")).mockResolvedValueOnce(undefined),
    });
    // Primary AND fallback both have the same selector — should only try twice not three times
    await fillFirstMatch(page as unknown as Page, "email", "input[name=email]", "x@y.com", [
      "input[name=email]",
      "input[type=email]",
    ]);
    expect(page.fill).toHaveBeenCalledTimes(2);
  });

  it("throws an error naming every selector tried when all fail", async () => {
    const page = makePage({
      fill: vi.fn().mockRejectedValue(new Error("not found")),
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

  it("uses tighter timeout for fallbacks than for primary", async () => {
    const page = makePage({
      fill: vi.fn().mockRejectedValueOnce(new Error("nope")).mockResolvedValueOnce(undefined),
    });
    await fillFirstMatch(page as unknown as Page, "email", "input[name=email]", "x", [
      "input[type=email]",
    ]);
    const primaryOpts = page.fill.mock.calls[0]?.[2] as { timeout?: number } | undefined;
    const fallbackOpts = page.fill.mock.calls[1]?.[2] as { timeout?: number } | undefined;
    expect(primaryOpts?.timeout ?? 0).toBeGreaterThan(fallbackOpts?.timeout ?? 0);
  });
});

describe("clickFirstMatch", () => {
  it("falls through to fallbacks when primary throws", async () => {
    const page = makePage({
      click: vi.fn().mockRejectedValueOnce(new Error("nope")).mockResolvedValueOnce(undefined),
    });
    await clickFirstMatch(page as unknown as Page, "submit", "button[type=submit]", [
      'button:has-text("Sign in")',
    ]);
    expect(page.click).toHaveBeenCalledTimes(2);
  });

  it("error names every tried selector", async () => {
    const page = makePage({ click: vi.fn().mockRejectedValue(new Error("nope")) });
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
    const page = makePage({
      evaluate: vi.fn().mockResolvedValue("Invalid email or password"),
    });
    expect(await scrapeVisibleAuthError(page as unknown as Page)).toBe("Invalid email or password");
  });
  it("returns null when no error visible", async () => {
    const page = makePage({ evaluate: vi.fn().mockResolvedValue(null) });
    expect(await scrapeVisibleAuthError(page as unknown as Page)).toBeNull();
  });
  it("returns null when page.evaluate throws", async () => {
    const page = makePage({
      evaluate: vi.fn().mockRejectedValue(new Error("page closed")),
    });
    expect(await scrapeVisibleAuthError(page as unknown as Page)).toBeNull();
  });
  it("returns null on non-string evaluate results", async () => {
    const page = makePage({ evaluate: vi.fn().mockResolvedValue(42) });
    expect(await scrapeVisibleAuthError(page as unknown as Page)).toBeNull();
  });
});
