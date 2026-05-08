import { useEffect, useMemo, useState } from "react";
import type { HealthResponse, TemplateInfo, TemplatesResponse } from "../types.js";

type AuthMode = "none" | "api" | "form" | "session";

interface AuthState {
  mode: AuthMode;
  apiUrl: string;
  apiBodyJson: string;
  formLoginUrl: string;
  emailField: string;
  passwordField: string;
  submitButton: string;
  email: string;
  password: string;
  waitForUrl: string;
  cookiesJson: string;
  localStorageJson: string;
}

const DEFAULT_AUTH: AuthState = {
  mode: "none",
  apiUrl: "/api/auth/login",
  apiBodyJson: `{\n  "email": "demo@example.com",\n  "password": "..."\n}`,
  formLoginUrl: "/login",
  emailField: "input[name=email]",
  passwordField: "input[name=password]",
  submitButton: "button[type=submit]",
  email: "",
  password: "",
  waitForUrl: "",
  cookiesJson: "",
  localStorageJson: "",
};

interface ScreenInput {
  id: string;
  route: string;
  name: string;
  caption: string;
  subtitle: string;
}

interface ScreenCapture {
  inputId: string;
  rawBlobUrl: string;
  rawBase64: string;
  capturedAt: number;
  templateId: string;
  theme: "dark" | "light";
}

interface ScreenComposite {
  inputId: string;
  templateId: string;
  theme: "dark" | "light";
  pngBlobUrl: string;
  renderedAt: number;
}

interface CaptureProgress {
  inputId: string;
  status: "queued" | "running" | "done" | "error";
  error?: string;
}

function rid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const DEFAULT_SCREENS: ReadonlyArray<ScreenInput> = [
  { id: rid(), route: "/", name: "01-home", caption: "Welcome", subtitle: "" },
];

export function Crawler() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [templates, setTemplates] = useState<ReadonlyArray<TemplateInfo>>([]);
  const [token, setToken] = useState("");

  const [target, setTarget] = useState("https://shotcraft.bfgsolutions.net");
  const [screens, setScreens] = useState<ScreenInput[]>(DEFAULT_SCREENS.slice());
  const [captureTemplateId, setCaptureTemplateId] = useState("readme-hero");
  const [captureTheme, setCaptureTheme] = useState<"dark" | "light">("dark");
  const [auth, setAuth] = useState<AuthState>(DEFAULT_AUTH);

  const [captures, setCaptures] = useState<Record<string, ScreenCapture>>({});
  const [progress, setProgress] = useState<Record<string, CaptureProgress>>({});
  const [composites, setComposites] = useState<ScreenComposite[]>([]);

  const [renderTemplateIds, setRenderTemplateIds] = useState<Set<string>>(new Set(["readme-hero"]));
  const [renderingAll, setRenderingAll] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

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

  const isDisabled = health !== null && !health.liveDemoEnabled;

  const captureTemplate = templates.find((t) => t.id === captureTemplateId) ?? templates[0] ?? null;

  const updateScreen = (id: string, patch: Partial<ScreenInput>) => {
    setScreens((s) => s.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addScreen = () => {
    const idx = screens.length + 1;
    setScreens((s) => [
      ...s,
      {
        id: rid(),
        route: "/",
        name: `${String(idx).padStart(2, "0")}-screen`,
        caption: "",
        subtitle: "",
      },
    ]);
  };

  const removeScreen = (id: string) => {
    setScreens((s) => s.filter((row) => row.id !== id));
    setCaptures((c) => {
      const next = { ...c };
      const cap = next[id];
      if (cap) URL.revokeObjectURL(cap.rawBlobUrl);
      delete next[id];
      return next;
    });
    setProgress((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
  };

  const buildAuthPayload = (): Record<string, unknown> | null => {
    if (auth.mode === "none") return null;
    try {
      if (auth.mode === "api") {
        return {
          type: "api",
          url: auth.apiUrl,
          body: JSON.parse(auth.apiBodyJson),
        };
      }
      if (auth.mode === "form") {
        return {
          type: "form",
          url: auth.formLoginUrl,
          emailField: auth.emailField,
          passwordField: auth.passwordField,
          submitButton: auth.submitButton,
          email: auth.email,
          password: auth.password,
          ...(auth.waitForUrl ? { waitForUrl: auth.waitForUrl } : {}),
        };
      }
      const session: Record<string, unknown> = { type: "session" };
      const c = auth.cookiesJson.trim();
      if (c) session.cookies = JSON.parse(c);
      const l = auth.localStorageJson.trim();
      if (l) session.localStorage = JSON.parse(l);
      return session;
    } catch (err) {
      throw new Error(
        `Auth JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  };

  const captureOne = async (screen: ScreenInput, includeAuth: boolean): Promise<void> => {
    if (!captureTemplate) throw new Error("Pick a template for the capture viewport.");

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token.trim().length > 0) headers.Authorization = `Bearer ${token.trim()}`;

    const url = joinUrl(target, screen.route);
    const authPayload = includeAuth ? buildAuthPayload() : null;

    const res = await fetch("/api/capture", {
      method: "POST",
      headers,
      body: JSON.stringify({
        url,
        viewport: captureTemplate.viewport,
        isMobile: captureTemplate.isMobile,
        theme: captureTheme,
        ...(authPayload ? { auth: authPayload } : {}),
      }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const buf = await blob.arrayBuffer();
    const rawBase64 = bufferToBase64(buf);
    const rawBlobUrl = URL.createObjectURL(blob);

    setCaptures((cur) => {
      const prev = cur[screen.id];
      if (prev) URL.revokeObjectURL(prev.rawBlobUrl);
      return {
        ...cur,
        [screen.id]: {
          inputId: screen.id,
          rawBlobUrl,
          rawBase64,
          capturedAt: Date.now(),
          templateId: captureTemplateId,
          theme: captureTheme,
        },
      };
    });
  };

  const captureAll = async () => {
    setRenderError(null);
    // Reset progress for everyone first.
    const initial: Record<string, CaptureProgress> = {};
    for (const s of screens) initial[s.id] = { inputId: s.id, status: "queued" };
    setProgress(initial);

    // Auth runs once per session conceptually; but the engine re-runs it
    // for each capture context. That's fine — same login flow per
    // viewport group. Always include auth on every capture if mode != none.
    const includeAuth = auth.mode !== "none";

    for (const s of screens) {
      setProgress((p) => ({ ...p, [s.id]: { inputId: s.id, status: "running" } }));
      try {
        await captureOne(s, includeAuth);
        setProgress((p) => ({ ...p, [s.id]: { inputId: s.id, status: "done" } }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setProgress((p) => ({
          ...p,
          [s.id]: { inputId: s.id, status: "error", error: message },
        }));
      }
    }
  };

  const retake = async (screen: ScreenInput) => {
    setProgress((p) => ({ ...p, [screen.id]: { inputId: screen.id, status: "running" } }));
    try {
      await captureOne(screen, auth.mode !== "none");
      setProgress((p) => ({ ...p, [screen.id]: { inputId: screen.id, status: "done" } }));
    } catch (err) {
      setProgress((p) => ({
        ...p,
        [screen.id]: {
          inputId: screen.id,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  };

  const renderAll = async () => {
    setRenderError(null);
    setRenderingAll(true);
    // Drop previous composites + free their URLs.
    setComposites((prev) => {
      for (const c of prev) URL.revokeObjectURL(c.pngBlobUrl);
      return [];
    });

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token.trim().length > 0) headers.Authorization = `Bearer ${token.trim()}`;

    const targets: {
      screen: ScreenInput;
      capture: ScreenCapture;
      templateId: string;
      theme: "dark" | "light";
    }[] = [];
    for (const s of screens) {
      const cap = captures[s.id];
      if (!cap) continue;
      for (const tid of renderTemplateIds) {
        const tpl = templates.find((t) => t.id === tid);
        if (!tpl) continue;
        for (const theme of tpl.themes) {
          targets.push({ screen: s, capture: cap, templateId: tid, theme });
        }
      }
    }

    try {
      for (const t of targets) {
        const res = await fetch("/api/render", {
          method: "POST",
          headers,
          body: JSON.stringify({
            rawBase64: t.capture.rawBase64,
            templateId: t.templateId,
            caption: t.screen.caption,
            ...(t.screen.subtitle ? { subtitle: t.screen.subtitle } : {}),
            theme: t.theme,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `render HTTP ${res.status}`);
        }
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        setComposites((cur) => [
          ...cur,
          {
            inputId: t.screen.id,
            templateId: t.templateId,
            theme: t.theme,
            pngBlobUrl: blobUrl,
            renderedAt: Date.now(),
          },
        ]);
      }
    } catch (err) {
      setRenderError(err instanceof Error ? err.message : String(err));
    } finally {
      setRenderingAll(false);
    }
  };

  const updateAuth = <K extends keyof AuthState>(k: K, v: AuthState[K]) => {
    setAuth((s) => ({ ...s, [k]: v }));
  };

  const captureCount = useMemo(() => Object.keys(captures).length, [captures]);

  return (
    <section className="container">
      <h1>Crawler</h1>
      <p className="lede">
        Define your screens, capture them all in one go (with target-app login if you have one),
        tweak captions in place, then render through whichever templates you want. Everything stays
        in your browser — no server-side session.
      </p>

      {isDisabled && (
        <div className="demo-disabled">
          <strong>Crawler is disabled in this deployment.</strong>
          <p>
            Set <code>SHOTCRAFT_LIVE_DEMO=1</code> + <code>SHOTCRAFT_LIVE_DEMO_TOKEN</code> on the
            App Service. The Crawler shares the same engine as the Live demo.
          </p>
        </div>
      )}

      {/* ── Step 1: Target ─────────────────────────────────────────────── */}
      <section className="crawler-step">
        <h2>1. Target</h2>
        <div className="builder-form">
          <fieldset>
            <legend>App URL + token</legend>
            <div className="field">
              <label htmlFor="cr-target">Base URL</label>
              <input
                id="cr-target"
                type="url"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="https://your-app.com"
                disabled={isDisabled}
              />
              <p className="field-hint">
                Each screen's <code>route</code> is joined onto this. Localhost / private IPs
                blocked server-side.
              </p>
            </div>
            <div className="field">
              <label htmlFor="cr-token">Bearer token</label>
              <input
                id="cr-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="SHOTCRAFT_LIVE_DEMO_TOKEN"
                disabled={isDisabled}
                autoComplete="off"
              />
            </div>
          </fieldset>

          <fieldset>
            <legend>Capture viewport</legend>
            <p className="field-hint" style={{ marginTop: 0 }}>
              All screens are captured at this viewport. Pick the smallest mobile-class template
              you'll render through; render-time templates can override later.
            </p>
            <div className="field">
              <label htmlFor="cr-capture-template">Template (for viewport reference)</label>
              <select
                id="cr-capture-template"
                value={captureTemplateId}
                onChange={(e) => setCaptureTemplateId(e.target.value)}
                disabled={isDisabled || templates.length === 0}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.displayName} — viewport {t.viewport.width}×{t.viewport.height}@
                    {t.viewport.dpr}x
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Theme</label>
              <div className="theme-tabs" role="tablist" style={{ marginTop: 0 }}>
                {(["dark", "light"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-selected={captureTheme === t}
                    className={captureTheme === t ? "active" : ""}
                    onClick={() => setCaptureTheme(t)}
                    disabled={isDisabled}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </fieldset>

          <AuthFieldset auth={auth} update={updateAuth} disabled={isDisabled} />
        </div>
      </section>

      {/* ── Step 2: Screens ────────────────────────────────────────────── */}
      <section className="crawler-step">
        <h2>2. Screens</h2>
        <p className="field-hint" style={{ marginTop: 0 }}>
          One row per screen to capture. <code>name</code> is the file-name stem; <code>route</code>
          is appended to the base URL. Edit captions/subtitles before or after capturing — they only
          matter at render time.
        </p>

        <div className="screens-table">
          <div className="screens-row screens-row-header">
            <div>Route</div>
            <div>Name</div>
            <div>Caption</div>
            <div>Subtitle</div>
            <div>Status</div>
            <div></div>
          </div>
          {screens.map((s) => {
            const status = progress[s.id]?.status ?? "queued";
            const error = progress[s.id]?.error;
            const cap = captures[s.id];
            return (
              <div key={s.id}>
                <div className="screens-row">
                  <input
                    type="text"
                    value={s.route}
                    onChange={(e) => updateScreen(s.id, { route: e.target.value })}
                    placeholder="/"
                    disabled={isDisabled}
                  />
                  <input
                    type="text"
                    value={s.name}
                    onChange={(e) => updateScreen(s.id, { name: e.target.value })}
                    disabled={isDisabled}
                  />
                  <input
                    type="text"
                    value={s.caption}
                    onChange={(e) => updateScreen(s.id, { caption: e.target.value })}
                    placeholder="Headline"
                    disabled={isDisabled}
                  />
                  <input
                    type="text"
                    value={s.subtitle}
                    onChange={(e) => updateScreen(s.id, { subtitle: e.target.value })}
                    placeholder="(optional)"
                    disabled={isDisabled}
                  />
                  <span className={`status status-${status}`}>{status}</span>
                  <div className="screens-row-actions">
                    {cap && (
                      <button type="button" onClick={() => void retake(s)} disabled={isDisabled}>
                        Retake
                      </button>
                    )}
                    <button
                      type="button"
                      className="remove"
                      aria-label="Remove screen"
                      onClick={() => removeScreen(s.id)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {error && (
                  <div className="screens-row-error" role="alert">
                    {error}
                  </div>
                )}
                {cap && (
                  <div className="screens-row-preview">
                    <img src={cap.rawBlobUrl} alt={`${s.name} raw capture`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.75rem" }}>
          <button type="button" onClick={addScreen} disabled={isDisabled}>
            + Add screen
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void captureAll()}
            disabled={isDisabled || screens.length === 0}
          >
            Capture all ({screens.length})
          </button>
        </div>
      </section>

      {/* ── Step 3: Render ─────────────────────────────────────────────── */}
      <section className="crawler-step">
        <h2>3. Render</h2>
        <p className="field-hint" style={{ marginTop: 0 }}>
          Pick the templates you want. The render uses each captured raw + the screen's caption +
          the chosen template. Output count: screens × templates × themes per template.
        </p>

        <div className="builder-form">
          <fieldset>
            <legend>Templates</legend>
            {templates.map((tpl) => {
              const checked = renderTemplateIds.has(tpl.id);
              return (
                <label key={tpl.id} className="template-checkbox">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = new Set(renderTemplateIds);
                      if (checked) next.delete(tpl.id);
                      else next.add(tpl.id);
                      setRenderTemplateIds(next);
                    }}
                    disabled={isDisabled}
                  />
                  <span className="template-checkbox-label">
                    {tpl.displayName} — {tpl.output.width}×{tpl.output.height} × {tpl.themes.length}{" "}
                    theme{tpl.themes.length === 1 ? "" : "s"}
                    <code className="pkg">{tpl.pkg}</code>
                  </span>
                </label>
              );
            })}
          </fieldset>
        </div>

        <div style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void renderAll()}
            disabled={
              isDisabled || renderingAll || captureCount === 0 || renderTemplateIds.size === 0
            }
          >
            {renderingAll ? "Rendering…" : `Render (${captureCount} captured)`}
          </button>
          {captureCount === 0 && (
            <span style={{ marginLeft: "0.75rem", color: "var(--text-muted)" }}>
              Capture at least one screen first.
            </span>
          )}
        </div>
        {renderError && (
          <p style={{ color: "#fda4af", marginTop: "0.75rem" }}>
            <strong>Render failed:</strong> {renderError}
          </p>
        )}
      </section>

      {/* ── Step 4: Output ────────────────────────────────────────────── */}
      {composites.length > 0 && (
        <section className="crawler-step">
          <h2>4. Composites</h2>
          <div className="gallery-grid">
            {composites.map((c) => {
              const screen = screens.find((s) => s.id === c.inputId);
              const tpl = templates.find((t) => t.id === c.templateId);
              const filename = `${screen?.name ?? "screen"}-${c.templateId}-${c.theme}.png`;
              return (
                <article key={`${c.inputId}-${c.templateId}-${c.theme}`} className="gallery-card">
                  <div className="gallery-card-preview">
                    <img src={c.pngBlobUrl} alt={filename} />
                  </div>
                  <div className="gallery-card-body">
                    <h3>{filename}</h3>
                    <div className="gallery-card-meta">
                      <span>{tpl?.displayName ?? c.templateId}</span>
                      <span>{c.theme}</span>
                    </div>
                    <a href={c.pngBlobUrl} download={filename}>
                      Download PNG
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </section>
  );
}

interface AuthFieldsetProps {
  auth: AuthState;
  update: <K extends keyof AuthState>(k: K, v: AuthState[K]) => void;
  disabled: boolean;
}

function AuthFieldset({ auth, update, disabled }: AuthFieldsetProps) {
  return (
    <fieldset>
      <legend>Target-app login (optional)</legend>
      <p className="field-hint" style={{ marginTop: 0 }}>
        Skip if your app is public. Otherwise pick a flow — Shotcraft logs in inside the capture
        context before each goto.
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
              onClick={() => update("mode", m)}
              disabled={disabled}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {auth.mode === "api" && (
        <>
          <div className="field">
            <label>Login endpoint</label>
            <input
              type="text"
              value={auth.apiUrl}
              onChange={(e) => update("apiUrl", e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label>JSON body</label>
            <textarea
              rows={5}
              value={auth.apiBodyJson}
              onChange={(e) => update("apiBodyJson", e.target.value)}
              disabled={disabled}
              spellCheck={false}
            />
          </div>
        </>
      )}

      {auth.mode === "form" && (
        <>
          <div className="field">
            <label>Login URL</label>
            <input
              type="text"
              value={auth.formLoginUrl}
              onChange={(e) => update("formLoginUrl", e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label>Email selector</label>
            <input
              type="text"
              value={auth.emailField}
              onChange={(e) => update("emailField", e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label>Password selector</label>
            <input
              type="text"
              value={auth.passwordField}
              onChange={(e) => update("passwordField", e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label>Submit selector</label>
            <input
              type="text"
              value={auth.submitButton}
              onChange={(e) => update("submitButton", e.target.value)}
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label>Email / username</label>
            <input
              type="text"
              value={auth.email}
              onChange={(e) => update("email", e.target.value)}
              disabled={disabled}
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={auth.password}
              onChange={(e) => update("password", e.target.value)}
              disabled={disabled}
              autoComplete="current-password"
            />
          </div>
          <div className="field">
            <label>Wait for URL after submit (optional)</label>
            <input
              type="text"
              value={auth.waitForUrl}
              onChange={(e) => update("waitForUrl", e.target.value)}
              placeholder="**/dashboard"
              disabled={disabled}
            />
          </div>
        </>
      )}

      {auth.mode === "session" && (
        <>
          <div className="field">
            <label>Cookies (JSON array)</label>
            <textarea
              rows={4}
              value={auth.cookiesJson}
              onChange={(e) => update("cookiesJson", e.target.value)}
              disabled={disabled}
              spellCheck={false}
            />
          </div>
          <div className="field">
            <label>localStorage (JSON object)</label>
            <textarea
              rows={3}
              value={auth.localStorageJson}
              onChange={(e) => update("localStorageJson", e.target.value)}
              disabled={disabled}
              spellCheck={false}
            />
          </div>
        </>
      )}
    </fieldset>
  );
}

function joinUrl(base: string, route: string): string {
  if (/^https?:\/\//i.test(route)) return route;
  const b = base.replace(/\/+$/, "");
  const r = route.startsWith("/") ? route : `/${route}`;
  return `${b}${r}`;
}

function bufferToBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}
