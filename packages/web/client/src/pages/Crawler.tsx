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

/**
 * Per-screen action — runs in the captured page after `goto()` and
 * before the screenshot. Mirrors the small subset of Playwright the
 * server's engine knows how to drive safely.
 */
export type ScreenAction =
  | { id: string; type: "click"; selector: string; timeoutMs?: number }
  | { id: string; type: "fill"; selector: string; value: string; timeoutMs?: number }
  | { id: string; type: "press"; selector: string; key: string; timeoutMs?: number }
  | { id: string; type: "wait"; ms: number }
  | { id: string; type: "waitForSelector"; selector: string; timeoutMs?: number }
  | { id: string; type: "waitForUrl"; url: string; timeoutMs?: number }
  | { id: string; type: "scroll"; selector?: string; y?: number };

interface ScreenInput {
  id: string;
  route: string;
  name: string;
  caption: string;
  subtitle: string;
  actions: ScreenAction[];
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

type DiscoverSource = "link" | "sitemap" | "common" | "nav";

interface DiscoveredRoute {
  path: string;
  title: string;
  depth: number;
  source: DiscoverSource;
}

interface DiscoverTechniques {
  linkCrawl: boolean;
  sitemap: boolean;
  commonRoutes: boolean;
  navClick: boolean;
}

const DEFAULT_TECHNIQUES: DiscoverTechniques = {
  linkCrawl: true,
  sitemap: true,
  commonRoutes: false,
  navClick: false,
};

type DiscoverState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; message: string }
  | { status: "ready"; routes: ReadonlyArray<DiscoveredRoute>; selected: Set<string> };

function rid(): string {
  return Math.random().toString(36).slice(2, 10);
}

const DEFAULT_SCREENS: ReadonlyArray<ScreenInput> = [
  { id: rid(), route: "/", name: "01-home", caption: "Welcome", subtitle: "", actions: [] },
];

/**
 * Persisted session — what we keep in localStorage so reopening the
 * Crawler doesn't mean re-pasting the token + form-login + screens.
 *
 * Captured raw images and rendered composites do NOT live here (too
 * big for localStorage); they'll move to IndexedDB in Phase D.
 *
 * Passwords and credentials persist alongside everything else: this is
 * an individual-use tool against the user's own browser profile, and
 * the explicit "Forget saved" link is the safety valve.
 */
const PERSIST_KEY = "shotcraft.crawler.session.v1";

interface PersistedSession {
  token: string;
  target: string;
  screens: ScreenInput[];
  captureTemplateId: string;
  captureTheme: "dark" | "light";
  auth: AuthState;
  renderTemplateIds: string[];
  techniques: DiscoverTechniques;
}

function loadPersisted(): Partial<PersistedSession> {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<PersistedSession> | null;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

export function Crawler() {
  // Hydrate persisted state once on mount. After this, every state
  // change re-serializes via the effect below.
  const initial = useMemo(() => loadPersisted(), []);

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [templates, setTemplates] = useState<ReadonlyArray<TemplateInfo>>([]);
  const [token, setToken] = useState(initial.token ?? "");

  const [target, setTarget] = useState(initial.target ?? "https://shotcraft.bfgsolutions.net");
  const [screens, setScreens] = useState<ScreenInput[]>(
    initial.screens && initial.screens.length > 0 ? initial.screens : DEFAULT_SCREENS.slice(),
  );
  const [captureTemplateId, setCaptureTemplateId] = useState(
    initial.captureTemplateId ?? "readme-hero",
  );
  const [captureTheme, setCaptureTheme] = useState<"dark" | "light">(
    initial.captureTheme === "light" ? "light" : "dark",
  );
  const [auth, setAuth] = useState<AuthState>(initial.auth ?? DEFAULT_AUTH);

  const [captures, setCaptures] = useState<Record<string, ScreenCapture>>({});
  const [progress, setProgress] = useState<Record<string, CaptureProgress>>({});
  const [composites, setComposites] = useState<ScreenComposite[]>([]);

  const [renderTemplateIds, setRenderTemplateIds] = useState<Set<string>>(
    () => new Set(initial.renderTemplateIds ?? ["readme-hero"]),
  );
  const [renderingAll, setRenderingAll] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [discoverState, setDiscoverState] = useState<DiscoverState>({ status: "idle" });
  const [techniques, setTechniques] = useState<DiscoverTechniques>(
    initial.techniques ?? DEFAULT_TECHNIQUES,
  );

  // Persist on change. Debounced 500ms so typing into a caption field
  // doesn't write 30 times.
  //
  // Hosted: localStorage is the only persistence (browser-local).
  // Local mode (shotcraft web): PUT to /api/local/config which writes
  // shotcraft.config.json on disk. We also still write localStorage as
  // a fallback so dev/server reloads don't lose work.
  useEffect(() => {
    const handle = setTimeout(() => {
      const session: PersistedSession = {
        token,
        target,
        screens,
        captureTemplateId,
        captureTheme,
        auth,
        renderTemplateIds: Array.from(renderTemplateIds),
        techniques,
      };
      try {
        localStorage.setItem(PERSIST_KEY, JSON.stringify(session));
      } catch {
        // localStorage throws when full or in some private-browsing modes.
      }
      if (health?.localMode) {
        void fetch("/api/local/config", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: session }),
        }).catch(() => {
          // Quiet — the next debounce will retry. The user sees no
          // dialog because every keystroke would otherwise spam errors.
        });
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [
    token,
    target,
    screens,
    captureTemplateId,
    captureTheme,
    auth,
    renderTemplateIds,
    techniques,
    health?.localMode,
  ]);

  const forgetAll = (): void => {
    if (!window.confirm("Forget all saved settings (token, target, auth, screens)?")) return;
    try {
      localStorage.removeItem(PERSIST_KEY);
    } catch {
      // Best-effort.
    }
    setToken("");
    setTarget("https://shotcraft.bfgsolutions.net");
    setScreens(DEFAULT_SCREENS.slice());
    setCaptureTemplateId("readme-hero");
    setCaptureTheme("dark");
    setAuth(DEFAULT_AUTH);
    setRenderTemplateIds(new Set(["readme-hero"]));
    setTechniques(DEFAULT_TECHNIQUES);
  };

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json() as Promise<HealthResponse>)
      .then((h) => {
        setHealth(h);
        // Local mode (`shotcraft web` launched the server) — the server
        // owns persistence via shotcraft.config.json on disk. Hydrate
        // from the file once; subsequent state changes PUT back.
        if (h.localMode) {
          fetch("/api/local/config")
            .then((r) => r.json() as Promise<{ config: PersistedSession | null }>)
            .then((d) => {
              if (d.config && typeof d.config === "object") {
                applyPersisted(d.config);
              }
            })
            .catch(() => {
              // File missing on first run is fine — Crawler keeps the
              // localStorage-hydrated defaults until the user edits
              // something, then saves to disk.
            });
        }
      })
      .catch(() => setHealth(null));
    fetch("/api/templates")
      .then((r) => r.json() as Promise<TemplatesResponse>)
      .then((d) => setTemplates(d.templates))
      .catch(() => setTemplates([]));
  }, []);

  const applyPersisted = (s: Partial<PersistedSession>): void => {
    if (typeof s.token === "string") setToken(s.token);
    if (typeof s.target === "string") setTarget(s.target);
    if (Array.isArray(s.screens) && s.screens.length > 0) setScreens(s.screens);
    if (typeof s.captureTemplateId === "string") setCaptureTemplateId(s.captureTemplateId);
    if (s.captureTheme === "dark" || s.captureTheme === "light") setCaptureTheme(s.captureTheme);
    if (s.auth) setAuth(s.auth);
    if (Array.isArray(s.renderTemplateIds)) setRenderTemplateIds(new Set(s.renderTemplateIds));
    if (s.techniques) setTechniques(s.techniques);
  };

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
        actions: [],
      },
    ]);
  };

  const runDiscover = async (): Promise<void> => {
    setDiscoverState({ status: "running" });
    try {
      let authPayload: Record<string, unknown> | null = null;
      try {
        authPayload = buildAuthPayload();
      } catch (err) {
        throw err instanceof Error ? err : new Error(String(err));
      }
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token.trim().length > 0) headers.Authorization = `Bearer ${token.trim()}`;
      const res = await fetch("/api/discover", {
        method: "POST",
        headers,
        body: JSON.stringify({
          url: target,
          techniques,
          ...(authPayload ? { auth: authPayload } : {}),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { routes: DiscoveredRoute[] };
      const existing = new Set(screens.map((s) => normalizeRoute(s.route)));
      const selected = new Set<string>();
      for (const r of data.routes) {
        if (!existing.has(normalizeRoute(r.path))) selected.add(r.path);
      }
      setDiscoverState({ status: "ready", routes: data.routes, selected });
    } catch (err) {
      setDiscoverState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const toggleDiscoverPick = (path: string): void => {
    setDiscoverState((prev) => {
      if (prev.status !== "ready") return prev;
      const next = new Set(prev.selected);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { status: "ready", routes: prev.routes, selected: next };
    });
  };

  const setDiscoverPickAll = (pick: boolean): void => {
    setDiscoverState((prev) => {
      if (prev.status !== "ready") return prev;
      const next = new Set<string>();
      if (pick) for (const r of prev.routes) next.add(r.path);
      return { status: "ready", routes: prev.routes, selected: next };
    });
  };

  const addSelectedDiscovered = (): void => {
    if (discoverState.status !== "ready") return;
    const picked = discoverState.routes.filter((r) => discoverState.selected.has(r.path));
    if (picked.length === 0) return;
    setScreens((prev) => {
      const existing = new Set(prev.map((s) => normalizeRoute(s.route)));
      const additions: ScreenInput[] = [];
      for (const r of picked) {
        const norm = normalizeRoute(r.path);
        if (existing.has(norm)) continue;
        existing.add(norm);
        additions.push({
          id: rid(),
          route: r.path,
          name: routeToScreenName(r.path, prev.length + additions.length + 1),
          caption: r.title,
          subtitle: "",
          actions: [],
        });
      }
      return [...prev, ...additions];
    });
    setDiscoverState({ status: "idle" });
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

    // Strip per-action client `id` before sending — server doesn't need it.
    const wireActions = screen.actions.map(({ id: _id, ...rest }) => rest);
    const res = await fetch("/api/capture", {
      method: "POST",
      headers,
      body: JSON.stringify({
        url,
        viewport: captureTemplate.viewport,
        isMobile: captureTemplate.isMobile,
        theme: captureTheme,
        ...(authPayload ? { auth: authPayload } : {}),
        ...(wireActions.length > 0 ? { actions: wireActions } : {}),
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
      <div className="crawler-header">
        <h1>Crawler</h1>
        {health?.localMode && health.configPath && (
          <span className="local-mode-badge" title="shotcraft web is running locally">
            ⟳ {health.configPath.split("/").slice(-2).join("/")}
          </span>
        )}
        <button
          type="button"
          className="link-btn"
          onClick={forgetAll}
          title="Clear the saved token, target URL, auth, and screens"
        >
          Forget saved settings
        </button>
      </div>
      <p className="lede">
        Define your screens, capture them all in one go (with target-app login if you have one),
        tweak captions in place, then render through whichever templates you want.{" "}
        {health?.localMode ? (
          <>
            <strong>Local mode:</strong> changes save to <code>shotcraft.config.json</code> on disk.
          </>
        ) : (
          <>Settings persist in this browser; captures and renders stay in this tab only.</>
        )}
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

          <fieldset className="discovery-techniques">
            <legend>Discovery techniques</legend>
            <p className="field-hint" style={{ marginTop: 0, marginBottom: "0.5rem" }}>
              Which methods should "🔍 Discover routes" use? Login (above) runs first if configured.
            </p>
            <label className="discover-tech-row">
              <input
                type="checkbox"
                checked={techniques.linkCrawl}
                onChange={(e) => setTechniques((t) => ({ ...t, linkCrawl: e.target.checked }))}
                disabled={isDisabled}
              />
              <span className="discover-tech-name">Link crawl</span>
              <span className="discover-tech-desc">
                BFS <code>&lt;a href&gt;</code> from start URL. Original v0.1 behavior.
              </span>
            </label>
            <label className="discover-tech-row">
              <input
                type="checkbox"
                checked={techniques.sitemap}
                onChange={(e) => setTechniques((t) => ({ ...t, sitemap: e.target.checked }))}
                disabled={isDisabled}
              />
              <span className="discover-tech-name">Sitemap.xml</span>
              <span className="discover-tech-desc">
                Fetch <code>/sitemap.xml</code>; parse <code>&lt;loc&gt;</code> entries. Cheap, huge
                yield for content sites.
              </span>
            </label>
            <label className="discover-tech-row">
              <input
                type="checkbox"
                checked={techniques.commonRoutes}
                onChange={(e) => setTechniques((t) => ({ ...t, commonRoutes: e.target.checked }))}
                disabled={isDisabled}
              />
              <span className="discover-tech-name">Common routes</span>
              <span className="discover-tech-desc">
                Probe a list of standard SaaS paths (<code>/dashboard</code>, <code>/settings</code>
                , <code>/billing</code>, …). Filters 404s.
              </span>
            </label>
            <label className="discover-tech-row discover-tech-disabled">
              <input
                type="checkbox"
                checked={false}
                disabled={true}
                aria-disabled="true"
                onChange={() => undefined}
              />
              <span className="discover-tech-name">Nav-click</span>
              <span className="discover-tech-desc">
                <em>Coming in v0.2.x</em> — click buttons inside <code>&lt;nav&gt;</code> / header
                to surface React-Router routes that aren't real anchors.
              </span>
            </label>
          </fieldset>
        </div>
      </section>

      {/* ── Step 2: Screens ────────────────────────────────────────────── */}
      <section className="crawler-step">
        <h2>2. Screens</h2>
        <p className="field-hint" style={{ marginTop: 0 }}>
          One card per screen to capture. <code>name</code> is the file-name stem;{" "}
          <code>route</code> is joined onto the base URL. Captions / subtitles can be edited before
          or after capturing. Need to click into a modal or fill a form before the screenshot? Use
          the actions list at the bottom of each card.
        </p>

        <DiscoverPanel
          state={discoverState}
          onTogglePath={toggleDiscoverPick}
          onSelectAll={() => setDiscoverPickAll(true)}
          onSelectNone={() => setDiscoverPickAll(false)}
          onAddSelected={addSelectedDiscovered}
          onDismiss={() => setDiscoverState({ status: "idle" })}
        />

        <div className="screen-cards">
          {screens.map((s) => {
            const status = progress[s.id]?.status ?? "queued";
            const error = progress[s.id]?.error;
            const cap = captures[s.id];
            return (
              <article key={s.id} className="screen-card">
                <header className="screen-card-header">
                  <div className="screen-card-title">
                    <input
                      type="text"
                      className="screen-name-input"
                      value={s.name}
                      onChange={(e) => updateScreen(s.id, { name: e.target.value })}
                      placeholder="01-home"
                      disabled={isDisabled}
                      aria-label="Screen name"
                    />
                    <span className={`status status-${status}`}>{status}</span>
                  </div>
                  <div className="screen-card-actions">
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
                </header>

                <div className="screen-card-grid">
                  <div className="field">
                    <label>Route</label>
                    <input
                      type="text"
                      value={s.route}
                      onChange={(e) => updateScreen(s.id, { route: e.target.value })}
                      placeholder="/"
                      disabled={isDisabled}
                    />
                  </div>
                  <div className="field">
                    <label>Caption</label>
                    <input
                      type="text"
                      value={s.caption}
                      onChange={(e) => updateScreen(s.id, { caption: e.target.value })}
                      placeholder="Headline shown over the device frame"
                      disabled={isDisabled}
                    />
                  </div>
                  <div className="field">
                    <label>Subtitle (optional)</label>
                    <input
                      type="text"
                      value={s.subtitle}
                      onChange={(e) => updateScreen(s.id, { subtitle: e.target.value })}
                      placeholder=""
                      disabled={isDisabled}
                    />
                  </div>
                </div>

                <ScreenActionsEditor
                  actions={s.actions}
                  disabled={isDisabled}
                  onChange={(next) => updateScreen(s.id, { actions: next })}
                />

                {error && (
                  <div className="screen-card-error" role="alert">
                    {error}
                  </div>
                )}
                {cap && (
                  <div className="screen-card-preview">
                    <img src={cap.rawBlobUrl} alt={`${s.name} raw capture`} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
        <div
          style={{
            marginTop: "0.75rem",
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <button type="button" onClick={addScreen} disabled={isDisabled}>
            + Add screen
          </button>
          <button
            type="button"
            onClick={() => void runDiscover()}
            disabled={isDisabled || discoverState.status === "running"}
            title="Crawl the target site (with login if configured) and pick which routes to capture"
          >
            {discoverState.status === "running" ? "Discovering…" : "🔍 Discover routes"}
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

interface ScreenActionsEditorProps {
  actions: ScreenAction[];
  disabled: boolean;
  onChange: (next: ScreenAction[]) => void;
}

const ACTION_LABELS: Record<ScreenAction["type"], string> = {
  click: "click(selector)",
  fill: "fill(selector, value)",
  press: "press(selector, key)",
  wait: "wait(ms)",
  waitForSelector: "waitForSelector(selector)",
  waitForUrl: "waitForUrl(url)",
  scroll: "scroll(selector? | y?)",
};

function newAction(type: ScreenAction["type"]): ScreenAction {
  const id = rid();
  switch (type) {
    case "click":
      return { id, type, selector: "" };
    case "fill":
      return { id, type, selector: "", value: "" };
    case "press":
      return { id, type, selector: "", key: "Enter" };
    case "wait":
      return { id, type, ms: 1000 };
    case "waitForSelector":
      return { id, type, selector: "" };
    case "waitForUrl":
      return { id, type, url: "" };
    case "scroll":
      return { id, type, y: 0 };
  }
}

function ScreenActionsEditor({ actions, disabled, onChange }: ScreenActionsEditorProps) {
  const [open, setOpen] = useState(actions.length > 0);

  const update = (id: string, patch: Partial<ScreenAction>) => {
    onChange(actions.map((a) => (a.id === id ? ({ ...a, ...patch } as ScreenAction) : a)));
  };
  const remove = (id: string) => onChange(actions.filter((a) => a.id !== id));
  const move = (id: string, dir: -1 | 1) => {
    const idx = actions.findIndex((a) => a.id === id);
    if (idx === -1) return;
    const target = idx + dir;
    if (target < 0 || target >= actions.length) return;
    const next = actions.slice();
    [next[idx], next[target]] = [next[target] as ScreenAction, next[idx] as ScreenAction];
    onChange(next);
  };
  const add = (type: ScreenAction["type"]) => {
    onChange([...actions, newAction(type)]);
    setOpen(true);
  };

  return (
    <div className="actions-editor">
      <button
        type="button"
        className="actions-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? "▾" : "▸"} Actions before screenshot
        {actions.length > 0 ? ` (${actions.length})` : ""}
      </button>
      {open && (
        <div className="actions-body">
          {actions.length === 0 && (
            <p className="field-hint" style={{ marginTop: 0 }}>
              Add steps that run after navigation, before the screenshot. Useful for clicking into
              modals, filling search inputs, dismissing tooltips, etc.
            </p>
          )}
          {actions.map((action, i) => (
            <div key={action.id} className="action-row">
              <span className="action-index">{i + 1}.</span>
              <span className="action-type">{ACTION_LABELS[action.type]}</span>
              <ActionFields action={action} update={update} disabled={disabled} />
              <div className="action-row-tools">
                <button
                  type="button"
                  aria-label="Move up"
                  onClick={() => move(action.id, -1)}
                  disabled={disabled || i === 0}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  onClick={() => move(action.id, 1)}
                  disabled={disabled || i === actions.length - 1}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label="Remove action"
                  className="remove"
                  onClick={() => remove(action.id)}
                  disabled={disabled}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}

          <div className="action-add">
            <span className="field-hint" style={{ margin: 0 }}>
              Add:
            </span>
            {(Object.keys(ACTION_LABELS) as ScreenAction["type"][]).map((t) => (
              <button
                key={t}
                type="button"
                className="action-add-btn"
                onClick={() => add(t)}
                disabled={disabled}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ActionFieldsProps {
  action: ScreenAction;
  update: (id: string, patch: Partial<ScreenAction>) => void;
  disabled: boolean;
}

function ActionFields({ action, update, disabled }: ActionFieldsProps) {
  if (action.type === "click" || action.type === "waitForSelector") {
    return (
      <input
        type="text"
        className="action-input"
        value={action.selector}
        placeholder='button[aria-label="Open menu"]'
        onChange={(e) => update(action.id, { selector: e.target.value })}
        disabled={disabled}
      />
    );
  }
  if (action.type === "fill") {
    return (
      <>
        <input
          type="text"
          className="action-input"
          value={action.selector}
          placeholder="input[name=q]"
          onChange={(e) => update(action.id, { selector: e.target.value })}
          disabled={disabled}
        />
        <input
          type="text"
          className="action-input"
          value={action.value}
          placeholder="value"
          onChange={(e) => update(action.id, { value: e.target.value })}
          disabled={disabled}
        />
      </>
    );
  }
  if (action.type === "press") {
    return (
      <>
        <input
          type="text"
          className="action-input"
          value={action.selector}
          placeholder="input[name=q]"
          onChange={(e) => update(action.id, { selector: e.target.value })}
          disabled={disabled}
        />
        <input
          type="text"
          className="action-input"
          value={action.key}
          placeholder="Enter"
          onChange={(e) => update(action.id, { key: e.target.value })}
          disabled={disabled}
        />
      </>
    );
  }
  if (action.type === "wait") {
    return (
      <input
        type="number"
        min={0}
        max={10000}
        className="action-input action-input-num"
        value={action.ms}
        onChange={(e) => update(action.id, { ms: Number(e.target.value) || 0 })}
        disabled={disabled}
      />
    );
  }
  if (action.type === "waitForUrl") {
    return (
      <input
        type="text"
        className="action-input"
        value={action.url}
        placeholder="**/dashboard"
        onChange={(e) => update(action.id, { url: e.target.value })}
        disabled={disabled}
      />
    );
  }
  if (action.type === "scroll") {
    return (
      <>
        <input
          type="text"
          className="action-input"
          value={action.selector ?? ""}
          placeholder="(selector — optional)"
          onChange={(e) => update(action.id, { selector: e.target.value })}
          disabled={disabled}
        />
        <input
          type="number"
          className="action-input action-input-num"
          value={action.y ?? 0}
          placeholder="y"
          onChange={(e) => update(action.id, { y: Number(e.target.value) || 0 })}
          disabled={disabled}
        />
      </>
    );
  }
  return null;
}

interface DiscoverPanelProps {
  state: DiscoverState;
  onTogglePath: (path: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onAddSelected: () => void;
  onDismiss: () => void;
}

function DiscoverPanel({
  state,
  onTogglePath,
  onSelectAll,
  onSelectNone,
  onAddSelected,
  onDismiss,
}: DiscoverPanelProps) {
  if (state.status === "idle") return null;
  if (state.status === "running") {
    return (
      <div className="discover-panel discover-panel-running" role="status">
        <span className="discover-spinner" aria-hidden="true" />
        Crawling… (one page at a time, 60s budget)
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="discover-panel discover-panel-error" role="alert">
        <strong>Discover failed:</strong> {state.message}
        <button type="button" className="discover-dismiss" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
    );
  }
  const total = state.routes.length;
  const picked = state.selected.size;
  return (
    <div className="discover-panel discover-panel-ready">
      <header className="discover-panel-header">
        <strong>
          Discovered {total} route{total === 1 ? "" : "s"}
        </strong>
        <span className="discover-panel-meta">{picked} selected</span>
        <div className="discover-panel-tools">
          <button type="button" onClick={onSelectAll}>
            All
          </button>
          <button type="button" onClick={onSelectNone}>
            None
          </button>
          <button
            type="button"
            className="discover-dismiss"
            onClick={onDismiss}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </header>
      <ul className="discover-list">
        {state.routes.map((r) => (
          <li key={r.path}>
            <label className="discover-row">
              <input
                type="checkbox"
                checked={state.selected.has(r.path)}
                onChange={() => onTogglePath(r.path)}
              />
              <span className="discover-path">{r.path}</span>
              {r.title && <span className="discover-title">{r.title}</span>}
              <span className={`discover-source discover-source-${r.source}`}>
                {SOURCE_LABELS[r.source] ?? r.source}
              </span>
              {r.source === "link" && <span className="discover-depth">d{r.depth}</span>}
            </label>
          </li>
        ))}
      </ul>
      <div className="discover-panel-footer">
        <button
          type="button"
          className="btn-primary"
          onClick={onAddSelected}
          disabled={picked === 0}
        >
          Add {picked} as screen{picked === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}

const SOURCE_LABELS: Record<DiscoverSource, string> = {
  link: "link",
  sitemap: "sitemap",
  common: "common",
  nav: "nav",
};

function normalizeRoute(r: string): string {
  let s = r.trim();
  if (!s.startsWith("/")) s = "/" + s;
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s.toLowerCase();
}

function routeToScreenName(path: string, idx: number): string {
  const cleaned = path
    .split("?")[0]!
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const slug = cleaned.length > 0 ? cleaned.slice(0, 40) : "screen";
  return `${String(idx).padStart(2, "0")}-${slug}`;
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
