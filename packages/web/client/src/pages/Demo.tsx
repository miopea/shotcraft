import { useEffect, useState } from "react";
import type { HealthResponse, TemplateInfo, TemplatesResponse } from "../types.js";

type AuthMode = "none" | "api" | "form" | "session";

interface RenderState {
  status: "idle" | "loading" | "success" | "error";
  url?: string;
  pngObjectUrl?: string;
  error?: string;
}

interface AuthState {
  mode: AuthMode;
  // Shared.
  email: string;
  password: string;
  // API login.
  apiUrl: string;
  apiBodyJson: string;
  // Form login.
  formLoginUrl: string;
  emailField: string;
  passwordField: string;
  submitButton: string;
  waitForUrl: string;
  // Session.
  cookiesJson: string;
  localStorageJson: string;
}

const DEFAULT_AUTH: AuthState = {
  mode: "none",
  email: "",
  password: "",
  apiUrl: "/api/auth/login",
  apiBodyJson: `{\n  "email": "demo@example.com",\n  "password": "..."\n}`,
  formLoginUrl: "/login",
  emailField: "input[name=email]",
  passwordField: "input[name=password]",
  submitButton: "button[type=submit]",
  waitForUrl: "",
  cookiesJson: `[\n  { "name": "session", "value": "...", "domain": "your.app" }\n]`,
  localStorageJson: `{\n  "onboarding-completed": "true"\n}`,
};

export function Demo() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [templates, setTemplates] = useState<ReadonlyArray<TemplateInfo>>([]);
  const [targetUrl, setTargetUrl] = useState("https://shotcraft.bfgsolutions.net");
  const [caption, setCaption] = useState("Capture your live app");
  const [subtitle, setSubtitle] = useState("");
  const [templateId, setTemplateId] = useState("readme-hero");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [token, setToken] = useState("");
  const [auth, setAuth] = useState<AuthState>(DEFAULT_AUTH);
  const [render, setRender] = useState<RenderState>({ status: "idle" });

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json() as Promise<HealthResponse>)
      .then(setHealth)
      .catch(() => setHealth(null));
    fetch("/api/templates")
      .then((r) => r.json() as Promise<TemplatesResponse>)
      .then((d) => setTemplates(d.templates))
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    return () => {
      if (render.pngObjectUrl) URL.revokeObjectURL(render.pngObjectUrl);
    };
  }, [render.pngObjectUrl]);

  const activeTemplate = templates.find((t) => t.id === templateId) ?? null;
  const themeOptions = activeTemplate?.themes ?? ["dark"];
  const isDisabled = health !== null && !health.liveDemoEnabled;

  useEffect(() => {
    if (activeTemplate && !activeTemplate.themes.includes(theme)) {
      setTheme(activeTemplate.themes[0] ?? "dark");
    }
  }, [activeTemplate, theme]);

  const updateAuth = <K extends keyof AuthState>(key: K, value: AuthState[K]) => {
    setAuth((s) => ({ ...s, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (render.pngObjectUrl) URL.revokeObjectURL(render.pngObjectUrl);
    setRender({ status: "loading" });

    let authPayload: Record<string, unknown> | undefined;
    try {
      if (auth.mode === "api") {
        authPayload = {
          type: "api",
          url: auth.apiUrl,
          body: JSON.parse(auth.apiBodyJson),
        };
      } else if (auth.mode === "form") {
        authPayload = {
          type: "form",
          url: auth.formLoginUrl,
          emailField: auth.emailField,
          passwordField: auth.passwordField,
          submitButton: auth.submitButton,
          email: auth.email,
          password: auth.password,
          ...(auth.waitForUrl ? { waitForUrl: auth.waitForUrl } : {}),
        };
      } else if (auth.mode === "session") {
        const session: Record<string, unknown> = { type: "session" };
        const trimmedCookies = auth.cookiesJson.trim();
        if (trimmedCookies.length > 0) session.cookies = JSON.parse(trimmedCookies);
        const trimmedLocal = auth.localStorageJson.trim();
        if (trimmedLocal.length > 0) session.localStorage = JSON.parse(trimmedLocal);
        authPayload = session;
      }
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      setRender({ status: "error", error: `Auth JSON parse failed: ${msg}` });
      return;
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token.trim().length > 0) {
        headers.Authorization = `Bearer ${token.trim()}`;
      }
      const res = await fetch("/api/render-demo", {
        method: "POST",
        headers,
        body: JSON.stringify({
          url: targetUrl,
          caption,
          subtitle: subtitle || undefined,
          templateId,
          theme,
          ...(authPayload ? { auth: authPayload } : {}),
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setRender({ status: "error", error: data.error ?? `HTTP ${res.status}` });
        return;
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      setRender({ status: "success", pngObjectUrl: objectUrl, url: targetUrl });
    } catch (err) {
      setRender({ status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <section className="container">
      <h1>Live demo</h1>
      <p className="lede">
        Paste any URL, pick a template, and Shotcraft renders a real composite from this server.
        Want screenshots of a private app? Add a target-app login below — Shotcraft signs in before
        capturing.
      </p>

      {isDisabled && (
        <div className="demo-disabled">
          <strong>Live demo is disabled in this deployment.</strong>
          <p>
            Set <code>SHOTCRAFT_LIVE_DEMO=1</code> in the App Service environment to enable, or run{" "}
            <code>pnpm shotcraft web</code> locally to use it on your own machine.
          </p>
        </div>
      )}

      <div className="demo-grid">
        <form
          className="builder-form"
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
        >
          <fieldset>
            <legend>Target</legend>
            <div className="field">
              <label htmlFor="demo-url">URL</label>
              <input
                id="demo-url"
                type="url"
                required
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://your-public-app.com"
                disabled={isDisabled}
              />
              <p className="field-hint">
                Public HTTP(S). Localhost / private IPs blocked server-side.
              </p>
            </div>
          </fieldset>

          <fieldset>
            <legend>Composite</legend>
            <div className="field">
              <label htmlFor="demo-template">Template</label>
              <select
                id="demo-template"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                disabled={isDisabled || templates.length === 0}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName} — {t.output.width}×{t.output.height}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Theme</label>
              <div className="theme-tabs" role="tablist" style={{ marginTop: 0 }}>
                {themeOptions.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={theme === t}
                    className={theme === t ? "active" : ""}
                    onClick={() => setTheme(t)}
                    disabled={isDisabled}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="demo-caption">Caption</label>
              <input
                id="demo-caption"
                type="text"
                required
                maxLength={240}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                disabled={isDisabled}
              />
            </div>
            <div className="field">
              <label htmlFor="demo-subtitle">Subtitle (optional)</label>
              <input
                id="demo-subtitle"
                type="text"
                maxLength={480}
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                disabled={isDisabled}
              />
            </div>
          </fieldset>

          <fieldset>
            <legend>Target-app login (optional)</legend>
            <p className="field-hint" style={{ marginTop: 0, marginBottom: "0.75rem" }}>
              Use this to render screens that need authentication. Credentials stay server-side and
              are never logged. The deployment must have <code>SHOTCRAFT_LIVE_DEMO_TOKEN</code> set
              — otherwise this field is refused.
            </p>
            <div className="field">
              <label>Login flow</label>
              <div className="theme-tabs" role="tablist" style={{ marginTop: 0 }}>
                {(["none", "api", "form", "session"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={auth.mode === m}
                    className={auth.mode === m ? "active" : ""}
                    onClick={() => updateAuth("mode", m)}
                    disabled={isDisabled}
                  >
                    {m === "none" ? "none" : m}
                  </button>
                ))}
              </div>
            </div>

            {auth.mode === "api" && (
              <>
                <div className="field">
                  <label htmlFor="auth-api-url">Login endpoint</label>
                  <input
                    id="auth-api-url"
                    type="text"
                    value={auth.apiUrl}
                    onChange={(e) => updateAuth("apiUrl", e.target.value)}
                    placeholder="/api/auth/login"
                    disabled={isDisabled}
                  />
                  <p className="field-hint">Relative to the target URL or an absolute URL.</p>
                </div>
                <div className="field">
                  <label htmlFor="auth-api-body">JSON body</label>
                  <textarea
                    id="auth-api-body"
                    rows={5}
                    value={auth.apiBodyJson}
                    onChange={(e) => updateAuth("apiBodyJson", e.target.value)}
                    disabled={isDisabled}
                    spellCheck={false}
                  />
                  <p className="field-hint">
                    Sent as <code>POST</code> with <code>Content-Type: application/json</code>.
                  </p>
                </div>
              </>
            )}

            {auth.mode === "form" && (
              <>
                <div className="field">
                  <label htmlFor="auth-form-url">Login page URL</label>
                  <input
                    id="auth-form-url"
                    type="text"
                    value={auth.formLoginUrl}
                    onChange={(e) => updateAuth("formLoginUrl", e.target.value)}
                    placeholder="/login"
                    disabled={isDisabled}
                  />
                </div>
                <div className="field">
                  <label htmlFor="auth-form-email-field">Email/username selector</label>
                  <input
                    id="auth-form-email-field"
                    type="text"
                    value={auth.emailField}
                    onChange={(e) => updateAuth("emailField", e.target.value)}
                    disabled={isDisabled}
                  />
                </div>
                <div className="field">
                  <label htmlFor="auth-form-password-field">Password selector</label>
                  <input
                    id="auth-form-password-field"
                    type="text"
                    value={auth.passwordField}
                    onChange={(e) => updateAuth("passwordField", e.target.value)}
                    disabled={isDisabled}
                  />
                </div>
                <div className="field">
                  <label htmlFor="auth-form-submit">Submit selector</label>
                  <input
                    id="auth-form-submit"
                    type="text"
                    value={auth.submitButton}
                    onChange={(e) => updateAuth("submitButton", e.target.value)}
                    disabled={isDisabled}
                  />
                </div>
                <div className="field">
                  <label htmlFor="auth-form-email">Email / username</label>
                  <input
                    id="auth-form-email"
                    type="text"
                    value={auth.email}
                    onChange={(e) => updateAuth("email", e.target.value)}
                    disabled={isDisabled}
                    autoComplete="username"
                  />
                </div>
                <div className="field">
                  <label htmlFor="auth-form-password">Password</label>
                  <input
                    id="auth-form-password"
                    type="password"
                    value={auth.password}
                    onChange={(e) => updateAuth("password", e.target.value)}
                    disabled={isDisabled}
                    autoComplete="current-password"
                  />
                </div>
                <div className="field">
                  <label htmlFor="auth-form-wait-url">Wait for URL after submit (optional)</label>
                  <input
                    id="auth-form-wait-url"
                    type="text"
                    value={auth.waitForUrl}
                    onChange={(e) => updateAuth("waitForUrl", e.target.value)}
                    placeholder="**/dashboard"
                    disabled={isDisabled}
                  />
                </div>
              </>
            )}

            {auth.mode === "session" && (
              <>
                <div className="field">
                  <label htmlFor="auth-session-cookies">Cookies (JSON array)</label>
                  <textarea
                    id="auth-session-cookies"
                    rows={5}
                    value={auth.cookiesJson}
                    onChange={(e) => updateAuth("cookiesJson", e.target.value)}
                    disabled={isDisabled}
                    spellCheck={false}
                  />
                </div>
                <div className="field">
                  <label htmlFor="auth-session-local">localStorage (JSON object, optional)</label>
                  <textarea
                    id="auth-session-local"
                    rows={4}
                    value={auth.localStorageJson}
                    onChange={(e) => updateAuth("localStorageJson", e.target.value)}
                    disabled={isDisabled}
                    spellCheck={false}
                  />
                </div>
              </>
            )}
          </fieldset>

          <fieldset>
            <legend>Demo gate (optional)</legend>
            <div className="field">
              <label htmlFor="demo-token">Bearer token</label>
              <input
                id="demo-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Required if SHOTCRAFT_LIVE_DEMO_TOKEN is set"
                disabled={isDisabled}
                autoComplete="off"
              />
            </div>
          </fieldset>

          <button
            type="submit"
            className="btn-primary"
            disabled={isDisabled || render.status === "loading"}
          >
            {render.status === "loading" ? "Rendering…" : "Render"}
          </button>
        </form>

        <aside className="demo-output">
          <h2>Output</h2>
          {render.status === "idle" && (
            <p style={{ color: "var(--text-muted)" }}>
              Submit the form to render. Captures + composites take 5–15 seconds (longer if a login
              flow runs first).
            </p>
          )}
          {render.status === "loading" && (
            <p style={{ color: "var(--text-muted)" }}>
              {auth.mode !== "none"
                ? `Logging in (${auth.mode}) → capturing → composing through ${
                    activeTemplate?.displayName ?? templateId
                  }…`
                : `Capturing → composing through ${activeTemplate?.displayName ?? templateId}…`}
            </p>
          )}
          {render.status === "error" && (
            <p style={{ color: "#fda4af" }}>
              <strong>Render failed:</strong> {render.error}
            </p>
          )}
          {render.status === "success" && render.pngObjectUrl && (
            <>
              <img src={render.pngObjectUrl} alt="Rendered composite" className="demo-result" />
              <a href={render.pngObjectUrl} download={`shotcraft-${templateId}-${theme}.png`}>
                Download PNG
              </a>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
