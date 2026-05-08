import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright";
import { apiLogin, chain, formLogin, injectSession } from "../auth/index.js";

/**
 * Build a minimal Playwright `Page` mock that records calls and lets
 * tests stub return values. We only mock the methods the helpers
 * actually call — the rest are no-ops that throw if hit, so any
 * accidental dependency on a different Page method surfaces loudly.
 */
function makeMockPage(overrides: Partial<MockPage> = {}): MockPage {
  const ctx = {
    addCookies: vi.fn().mockResolvedValue(undefined),
  };
  const page: MockPage = {
    goto: vi.fn().mockResolvedValue(null),
    fill: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue({
      status: 200,
      statusText: "OK",
      body: "{}",
    }),
    waitForSelector: vi.fn().mockResolvedValue({}),
    waitForURL: vi.fn().mockResolvedValue(null),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    context: vi.fn(() => ctx),
    _ctx: ctx,
    ...overrides,
  };
  return page;
}

interface MockPage {
  goto: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  click: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
  waitForSelector: ReturnType<typeof vi.fn>;
  waitForURL: ReturnType<typeof vi.fn>;
  waitForLoadState: ReturnType<typeof vi.fn>;
  context: ReturnType<typeof vi.fn>;
  _ctx: { addCookies: ReturnType<typeof vi.fn> };
}

const asPage = (p: MockPage) => p as unknown as Page;

describe("formLogin", () => {
  it("navigates, fills email + password, clicks submit, waits for networkidle", async () => {
    const page = makeMockPage();
    const setup = formLogin({
      url: "/login",
      emailField: "input[name=email]",
      passwordField: "input[name=password]",
      submitButton: "button[type=submit]",
      email: "demo@example.com",
      password: "hunter2",
    });
    await setup(asPage(page));

    expect(page.goto).toHaveBeenCalledWith(
      "/login",
      expect.objectContaining({ waitUntil: "domcontentloaded" }),
    );
    expect(page.fill).toHaveBeenNthCalledWith(
      1,
      "input[name=email]",
      "demo@example.com",
      expect.any(Object),
    );
    expect(page.fill).toHaveBeenNthCalledWith(
      2,
      "input[name=password]",
      "hunter2",
      expect.any(Object),
    );
    expect(page.click).toHaveBeenCalledWith("button[type=submit]", expect.any(Object));
    expect(page.waitForLoadState).toHaveBeenCalledWith("networkidle", expect.any(Object));
    expect(page.waitForSelector).not.toHaveBeenCalled();
    expect(page.waitForURL).not.toHaveBeenCalled();
  });

  it("uses waitForUrl when provided", async () => {
    const page = makeMockPage();
    await formLogin({
      url: "/login",
      emailField: "#email",
      passwordField: "#password",
      submitButton: "#submit",
      email: "x",
      password: "y",
      waitForUrl: /\/dashboard$/,
    })(asPage(page));
    expect(page.waitForURL).toHaveBeenCalledWith(/\/dashboard$/, expect.any(Object));
    expect(page.waitForLoadState).not.toHaveBeenCalled();
  });

  it("uses waitForSelector when provided (no waitForUrl)", async () => {
    const page = makeMockPage();
    await formLogin({
      url: "/login",
      emailField: "#email",
      passwordField: "#password",
      submitButton: "#submit",
      email: "x",
      password: "y",
      waitForSelector: "[data-testid=greeting]",
    })(asPage(page));
    expect(page.waitForSelector).toHaveBeenCalledWith("[data-testid=greeting]", expect.any(Object));
    expect(page.waitForLoadState).not.toHaveBeenCalled();
  });
});

describe("apiLogin", () => {
  it("invokes page.evaluate with POST + JSON body and returns silently on 200", async () => {
    const page = makeMockPage();
    await apiLogin({
      url: "/api/auth/login",
      body: { email: "demo@example.com", password: "hunter2" },
    })(asPage(page));

    expect(page.evaluate).toHaveBeenCalledTimes(1);
    const arg = page.evaluate.mock.calls[0]?.[1] as {
      url: string;
      method: string;
      body: string | undefined;
      headers: Record<string, string>;
      credentialsInclude: boolean;
    };
    expect(arg.url).toBe("/api/auth/login");
    expect(arg.method).toBe("POST");
    expect(arg.body).toBe('{"email":"demo@example.com","password":"hunter2"}');
    expect(arg.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(arg.credentialsInclude).toBe(true);
  });

  it("throws on non-2xx status by default", async () => {
    const page = makeMockPage({
      evaluate: vi.fn().mockResolvedValue({
        status: 401,
        statusText: "Unauthorized",
        body: '{"error":"bad creds"}',
      }),
    });
    await expect(
      apiLogin({ url: "/api/auth/login", body: { email: "a", password: "b" } })(asPage(page)),
    ).rejects.toThrow(/401 Unauthorized/);
  });

  it("respects expectStatus as a function", async () => {
    const page = makeMockPage({
      evaluate: vi.fn().mockResolvedValue({ status: 204, statusText: "No Content", body: "" }),
    });
    await expect(
      apiLogin({
        url: "/api/auth/login",
        body: {},
        expectStatus: (s) => s >= 200 && s < 300,
      })(asPage(page)),
    ).resolves.toBeUndefined();
  });
});

describe("injectSession", () => {
  it("calls context.addCookies with defaults filled in", async () => {
    const page = makeMockPage();
    await injectSession({
      cookies: [{ name: "auth", value: "abc", domain: "localhost" }],
    })(asPage(page));

    expect(page._ctx.addCookies).toHaveBeenCalledWith([
      expect.objectContaining({
        name: "auth",
        value: "abc",
        domain: "localhost",
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      }),
    ]);
  });

  it("writes localStorage + sessionStorage entries via page.evaluate", async () => {
    const page = makeMockPage();
    await injectSession({
      localStorage: { foo: "bar", onboarding: "done" },
      sessionStorage: { tab: "1" },
    })(asPage(page));

    // 2 evaluate calls, one per storage type.
    expect(page.evaluate).toHaveBeenCalledTimes(2);
    expect(page.evaluate.mock.calls[0]?.[1]).toEqual([
      ["foo", "bar"],
      ["onboarding", "done"],
    ]);
    expect(page.evaluate.mock.calls[1]?.[1]).toEqual([["tab", "1"]]);
  });

  it("navigates to origin first when provided", async () => {
    const page = makeMockPage();
    await injectSession({
      origin: "https://other-domain.example",
      localStorage: { tour: "done" },
    })(asPage(page));
    expect(page.goto).toHaveBeenCalledWith(
      "https://other-domain.example",
      expect.objectContaining({ waitUntil: "domcontentloaded" }),
    );
  });
});

describe("chain", () => {
  it("invokes setup functions in order and awaits each", async () => {
    const order: string[] = [];
    const a = vi.fn(async () => {
      await Promise.resolve();
      order.push("a");
    });
    const b = vi.fn(async () => {
      await Promise.resolve();
      order.push("b");
    });
    const c = vi.fn(() => {
      order.push("c");
      return Promise.resolve();
    });

    const page = makeMockPage();
    await chain(a, b, c)(asPage(page));
    expect(order).toEqual(["a", "b", "c"]);
    expect(a).toHaveBeenCalledWith(asPage(page));
  });

  it("propagates the first throw", async () => {
    const a = vi.fn(async () => {
      await Promise.resolve();
    });
    const b = vi.fn(() => {
      return Promise.reject(new Error("boom"));
    });
    const c = vi.fn(async () => {
      await Promise.resolve();
    });

    const page = makeMockPage();
    await expect(chain(a, b, c)(asPage(page))).rejects.toThrow("boom");
    expect(a).toHaveBeenCalledOnce();
    expect(c).not.toHaveBeenCalled();
  });
});
