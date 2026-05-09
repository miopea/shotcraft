import { useEffect, useMemo, useState } from "react";
import type { HealthResponse, TemplateInfo, TemplatesResponse } from "../types.js";
import {
  STORE_CAPTURES,
  STORE_COMPOSITES,
  clearStore,
  deleteByPrefix,
  getAllEntries,
  putBlob,
  mediaKey,
} from "../persistence/idb.js";

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
  /**
   * JSON array of post-login actions (click/fill/wait/etc.) to run
   * once after auth completes, before discovery / capture techniques.
   * Common use: dismiss a tour modal or cookie banner that's covering
   * the UI we want to crawl.
   */
  setupActionsJson: string;
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
  setupActionsJson: "",
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
  /** key = mediaKey(screenId, templateId, theme) */
  status: "queued" | "running" | "done" | "error";
  error?: string;
}

/**
 * A matrix cell — the (template, theme) coordinate the user wants
 * captures for. The full matrix is `screens × cells` raws; `cells` is
 * stored as a Set of `${templateId}::${theme}` strings.
 */
function cellKey(templateId: string, theme: "dark" | "light"): string {
  return `${templateId}::${theme}`;
}
function parseCellKey(key: string): { templateId: string; theme: "dark" | "light" } | null {
  const idx = key.lastIndexOf("::");
  if (idx <= 0) return null;
  const templateId = key.slice(0, idx);
  const theme = key.slice(idx + 2);
  if (theme !== "dark" && theme !== "light") return null;
  return { templateId, theme };
}

/**
 * Parses a `${screenId}::${templateId}::${theme}` media key into its
 * three parts. Mirrors mediaKey() in persistence/idb.ts. Used during
 * IDB hydration to rebuild in-memory state from blobs alone.
 */
function parseMediaKey(
  key: string,
): { screenId: string; templateId: string; theme: "dark" | "light" } | null {
  const parts = key.split("::");
  if (parts.length < 3) return null;
  const theme = parts[parts.length - 1];
  if (theme !== "dark" && theme !== "light") return null;
  const screenId = parts[0]!;
  const templateId = parts.slice(1, -1).join("::");
  if (!screenId || !templateId) return null;
  return { screenId, templateId, theme };
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

interface DiscoverSummary {
  startUrl: string;
  perTechnique: { link: number; sitemap: number; common: number; nav: number };
  finalCount: number;
  finalScreenshot?: string;
}

type DiscoverState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "error"; message: string; errorScreenshot?: string }
  | {
      status: "ready";
      routes: ReadonlyArray<DiscoveredRoute>;
      selected: Set<string>;
      summary?: DiscoverSummary;
    };

function rid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Start empty — Discover routes or "+ Add screen" populates the list.
// No placeholder screen so a fresh "Forget saved" doesn't leave junk
// behind and discovered results aren't muddled by a leftover "/" entry.
const DEFAULT_SCREENS: ReadonlyArray<ScreenInput> = [];

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
  /** Matrix cells, e.g. ["app-store-iphone::dark", "readme-hero::dark"]. */
  matrix: string[];
  auth: AuthState;
  techniques: DiscoverTechniques;
  /** v1.x compat — older sessions stored these. */
  captureTemplateId?: string;
  captureTheme?: "dark" | "light";
  renderTemplateIds?: string[];
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
    Array.isArray(initial.screens) ? initial.screens : DEFAULT_SCREENS.slice(),
  );
  const [matrix, setMatrix] = useState<Set<string>>(() => {
    if (Array.isArray(initial.matrix) && initial.matrix.length > 0) {
      return new Set(initial.matrix);
    }
    // v1 compat: migrate captureTemplateId + captureTheme to a single cell.
    if (
      initial.captureTemplateId &&
      (initial.captureTheme === "dark" || initial.captureTheme === "light")
    ) {
      return new Set([cellKey(initial.captureTemplateId, initial.captureTheme)]);
    }
    return new Set([cellKey("readme-hero", "dark")]);
  });
  const [auth, setAuth] = useState<AuthState>(initial.auth ?? DEFAULT_AUTH);

  // Captures + composites keyed by mediaKey(screenId, templateId, theme).
  const [captures, setCaptures] = useState<Record<string, ScreenCapture>>({});
  const [progress, setProgress] = useState<Record<string, CaptureProgress>>({});
  const [composites, setComposites] = useState<Record<string, ScreenComposite>>({});

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
        matrix: Array.from(matrix),
        auth,
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
  }, [token, target, screens, matrix, auth, techniques, health?.localMode]);

  const forgetAll = (): void => {
    if (!window.confirm("Forget all saved settings, captures, and composites?")) return;
    try {
      localStorage.removeItem(PERSIST_KEY);
    } catch {
      // Best-effort.
    }
    // Drop in-memory blob URLs to free memory.
    for (const c of Object.values(captures)) URL.revokeObjectURL(c.rawBlobUrl);
    for (const c of Object.values(composites)) URL.revokeObjectURL(c.pngBlobUrl);
    void clearStore(STORE_CAPTURES);
    void clearStore(STORE_COMPOSITES);
    setToken("");
    setTarget("https://shotcraft.bfgsolutions.net");
    setScreens(DEFAULT_SCREENS.slice());
    setMatrix(new Set([cellKey("readme-hero", "dark")]));
    setAuth(DEFAULT_AUTH);
    setTechniques(DEFAULT_TECHNIQUES);
    setCaptures({});
    setComposites({});
    setProgress({});
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

  // Hydrate captures + composites from IndexedDB once on mount. The
  // composite key tells us screenId / templateId / theme, so we can
  // rebuild the in-memory state from blobs alone.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [capEntries, compEntries] = await Promise.all([
          getAllEntries(STORE_CAPTURES),
          getAllEntries(STORE_COMPOSITES),
        ]);
        if (cancelled) return;

        const capMap: Record<string, ScreenCapture> = {};
        for (const [key, blob] of capEntries) {
          const parsed = parseMediaKey(key);
          if (!parsed) continue;
          const buf = await blob.arrayBuffer();
          if (cancelled) return;
          capMap[key] = {
            inputId: parsed.screenId,
            rawBlobUrl: URL.createObjectURL(blob),
            rawBase64: bufferToBase64(buf),
            capturedAt: 0,
            templateId: parsed.templateId,
            theme: parsed.theme,
          };
        }
        const compMap: Record<string, ScreenComposite> = {};
        for (const [key, blob] of compEntries) {
          const parsed = parseMediaKey(key);
          if (!parsed) continue;
          compMap[key] = {
            inputId: parsed.screenId,
            templateId: parsed.templateId,
            theme: parsed.theme,
            pngBlobUrl: URL.createObjectURL(blob),
            renderedAt: 0,
          };
        }
        if (cancelled) return;
        if (Object.keys(capMap).length > 0) setCaptures(capMap);
        if (Object.keys(compMap).length > 0) setComposites(compMap);
      } catch {
        // IDB unavailable (private browsing, quota error). Crawler
        // still works — it just won't survive reload.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyPersisted = (s: Partial<PersistedSession>): void => {
    if (typeof s.token === "string") setToken(s.token);
    if (typeof s.target === "string") setTarget(s.target);
    if (Array.isArray(s.screens)) setScreens(s.screens);
    if (Array.isArray(s.matrix)) setMatrix(new Set(s.matrix));
    if (s.auth) setAuth(s.auth);
    if (s.techniques) setTechniques(s.techniques);
  };

  const isDisabled = health !== null && !health.liveDemoEnabled;

  const toggleMatrixCell = (templateId: string, theme: "dark" | "light"): void => {
    const k = cellKey(templateId, theme);
    setMatrix((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

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
      // Parse post-login setup actions if user provided any. JSON
      // parse failure is fatal (better to stop than send invalid body).
      let setupActions: unknown = undefined;
      const setupRaw = auth.setupActionsJson.trim();
      if (setupRaw.length > 0) {
        try {
          setupActions = JSON.parse(setupRaw);
        } catch (err) {
          throw new Error(
            `Setup actions JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
            { cause: err },
          );
        }
      }

      const res = await fetch("/api/discover", {
        method: "POST",
        headers,
        body: JSON.stringify({
          url: target,
          techniques,
          ...(authPayload ? { auth: authPayload } : {}),
          ...(setupActions !== undefined ? { setupActions } : {}),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          errorScreenshot?: string;
        };
        const e = new Error(data.error ?? `HTTP ${res.status}`) as Error & {
          errorScreenshot?: string;
        };
        if (typeof data.errorScreenshot === "string") {
          e.errorScreenshot = data.errorScreenshot;
        }
        throw e;
      }
      const data = (await res.json()) as {
        routes: DiscoveredRoute[];
        summary?: DiscoverSummary;
      };
      const existing = new Set(screens.map((s) => normalizeRoute(s.route)));
      const selected = new Set<string>();
      for (const r of data.routes) {
        if (!existing.has(normalizeRoute(r.path))) selected.add(r.path);
      }
      setDiscoverState({
        status: "ready",
        routes: data.routes,
        selected,
        ...(data.summary ? { summary: data.summary } : {}),
      });
    } catch (err) {
      const screenshot =
        err instanceof Error && "errorScreenshot" in err && typeof err.errorScreenshot === "string"
          ? err.errorScreenshot
          : undefined;
      setDiscoverState({
        status: "error",
        message: err instanceof Error ? err.message : String(err),
        ...(screenshot ? { errorScreenshot: screenshot } : {}),
      });
    }
  };

  const toggleDiscoverPick = (path: string): void => {
    setDiscoverState((prev) => {
      if (prev.status !== "ready") return prev;
      const next = new Set(prev.selected);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return {
        status: "ready",
        routes: prev.routes,
        selected: next,
        ...(prev.summary ? { summary: prev.summary } : {}),
      };
    });
  };

  const setDiscoverPickAll = (pick: boolean): void => {
    setDiscoverState((prev) => {
      if (prev.status !== "ready") return prev;
      const next = new Set<string>();
      if (pick) for (const r of prev.routes) next.add(r.path);
      return {
        status: "ready",
        routes: prev.routes,
        selected: next,
        ...(prev.summary ? { summary: prev.summary } : {}),
      };
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
      const next: Record<string, ScreenCapture> = {};
      for (const [k, v] of Object.entries(c)) {
        if (k.startsWith(`${id}::`)) {
          URL.revokeObjectURL(v.rawBlobUrl);
        } else {
          next[k] = v;
        }
      }
      return next;
    });
    setComposites((c) => {
      const next: Record<string, ScreenComposite> = {};
      for (const [k, v] of Object.entries(c)) {
        if (k.startsWith(`${id}::`)) {
          URL.revokeObjectURL(v.pngBlobUrl);
        } else {
          next[k] = v;
        }
      }
      return next;
    });
    setProgress((p) => {
      const next: Record<string, CaptureProgress> = {};
      for (const [k, v] of Object.entries(p)) {
        if (!k.startsWith(`${id}::`)) next[k] = v;
      }
      return next;
    });
    void deleteByPrefix(STORE_CAPTURES, `${id}::`);
    void deleteByPrefix(STORE_COMPOSITES, `${id}::`);
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

  const captureOneCell = async (
    screen: ScreenInput,
    template: TemplateInfo,
    theme: "dark" | "light",
    includeAuth: boolean,
  ): Promise<void> => {
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
        viewport: template.viewport,
        isMobile: template.isMobile,
        theme,
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
    const key = mediaKey(screen.id, template.id, theme);

    setCaptures((cur) => {
      const prev = cur[key];
      if (prev) URL.revokeObjectURL(prev.rawBlobUrl);
      return {
        ...cur,
        [key]: {
          inputId: screen.id,
          rawBlobUrl,
          rawBase64,
          capturedAt: Date.now(),
          templateId: template.id,
          theme,
        },
      };
    });
    void putBlob(STORE_CAPTURES, key, blob);
  };

  const captureAll = async () => {
    setRenderError(null);
    const cells = matrixCells();
    if (cells.length === 0) {
      setRenderError("Pick at least one cell in the capture matrix.");
      return;
    }

    // Reset progress for every (screen, cell) we're about to run.
    const initial: Record<string, CaptureProgress> = {};
    for (const s of screens) {
      for (const c of cells) {
        initial[mediaKey(s.id, c.template.id, c.theme)] = { status: "queued" };
      }
    }
    setProgress(initial);

    const includeAuth = auth.mode !== "none";

    for (const s of screens) {
      for (const c of cells) {
        const key = mediaKey(s.id, c.template.id, c.theme);
        setProgress((p) => ({ ...p, [key]: { status: "running" } }));
        try {
          await captureOneCell(s, c.template, c.theme, includeAuth);
          setProgress((p) => ({ ...p, [key]: { status: "done" } }));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setProgress((p) => ({ ...p, [key]: { status: "error", error: message } }));
        }
      }
    }
  };

  const retake = async (screen: ScreenInput) => {
    const cells = matrixCells();
    if (cells.length === 0) return;
    for (const c of cells) {
      const key = mediaKey(screen.id, c.template.id, c.theme);
      setProgress((p) => ({ ...p, [key]: { status: "running" } }));
      try {
        await captureOneCell(screen, c.template, c.theme, auth.mode !== "none");
        setProgress((p) => ({ ...p, [key]: { status: "done" } }));
      } catch (err) {
        setProgress((p) => ({
          ...p,
          [key]: {
            status: "error",
            error: err instanceof Error ? err.message : String(err),
          },
        }));
      }
    }
  };

  /** Resolves the matrix Set into an ordered list of (template, theme) pairs. */
  const matrixCells = (): Array<{ template: TemplateInfo; theme: "dark" | "light" }> => {
    const out: Array<{ template: TemplateInfo; theme: "dark" | "light" }> = [];
    for (const k of matrix) {
      const parsed = parseCellKey(k);
      if (!parsed) continue;
      const tpl = templates.find((t) => t.id === parsed.templateId);
      if (!tpl) continue;
      // Skip themes the template doesn't actually support
      // (e.g. social-og-card is dark-only).
      if (!tpl.themes.includes(parsed.theme)) continue;
      out.push({ template: tpl, theme: parsed.theme });
    }
    return out;
  };

  const renderAll = async () => {
    setRenderError(null);
    setRenderingAll(true);
    // Drop previous composites + free their URLs.
    setComposites((prev) => {
      for (const c of Object.values(prev)) URL.revokeObjectURL(c.pngBlobUrl);
      return {};
    });

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token.trim().length > 0) headers.Authorization = `Bearer ${token.trim()}`;

    // Each capture in `captures` knows its own templateId + theme. One
    // capture → one composite, rendered through that same template.
    const targets: {
      screen: ScreenInput;
      capture: ScreenCapture;
      templateId: string;
      theme: "dark" | "light";
    }[] = [];
    const screenById = new Map(screens.map((s) => [s.id, s]));
    for (const cap of Object.values(captures)) {
      const screen = screenById.get(cap.inputId);
      if (!screen) continue;
      const tpl = templates.find((t) => t.id === cap.templateId);
      if (!tpl) continue;
      targets.push({ screen, capture: cap, templateId: cap.templateId, theme: cap.theme });
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
        const key = mediaKey(t.screen.id, t.templateId, t.theme);
        setComposites((cur) => {
          const prev = cur[key];
          if (prev) URL.revokeObjectURL(prev.pngBlobUrl);
          return {
            ...cur,
            [key]: {
              inputId: t.screen.id,
              templateId: t.templateId,
              theme: t.theme,
              pngBlobUrl: blobUrl,
              renderedAt: Date.now(),
            },
          };
        });
        void putBlob(STORE_COMPOSITES, key, blob);
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

          <fieldset className="capture-matrix">
            <legend>Capture matrix</legend>
            <p className="field-hint" style={{ marginTop: 0 }}>
              Check each <code>(template × theme)</code> cell you want captures for. Every screen
              gets captured once per checked cell. Render reuses the same matrix — one capture, one
              composite.
            </p>
            {templates.length === 0 ? (
              <p className="field-hint">No templates installed yet.</p>
            ) : (
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>dark</th>
                    <th>light</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id}>
                      <th scope="row">
                        {t.displayName}
                        <span className="matrix-template-meta">
                          {t.viewport.width}×{t.viewport.height}@{t.viewport.dpr}x
                        </span>
                      </th>
                      {(["dark", "light"] as const).map((theme) => {
                        const supported = t.themes.includes(theme);
                        const k = cellKey(t.id, theme);
                        return (
                          <td key={theme}>
                            <input
                              type="checkbox"
                              checked={supported && matrix.has(k)}
                              disabled={isDisabled || !supported}
                              onChange={() => toggleMatrixCell(t.id, theme)}
                              aria-label={`Capture ${t.displayName} ${theme}`}
                              title={
                                supported
                                  ? undefined
                                  : `${t.displayName} doesn't support ${theme} theme`
                              }
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="field-hint" style={{ marginBottom: 0 }}>
              {matrix.size} cell{matrix.size === 1 ? "" : "s"} selected. {screens.length} screen
              {screens.length === 1 ? "" : "s"} = <strong>{matrix.size * screens.length}</strong>{" "}
              captures total.
            </p>
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
            <label className="discover-tech-row">
              <input
                type="checkbox"
                checked={techniques.navClick}
                onChange={(e) => setTechniques((t) => ({ ...t, navClick: e.target.checked }))}
                disabled={isDisabled}
              />
              <span className="discover-tech-name">Nav-click</span>
              <span className="discover-tech-desc">
                Click buttons inside <code>&lt;nav&gt;</code> / header / sidebar to surface
                React-Router routes that aren't real anchors. Slow (reloads between clicks); skips
                destructive labels (sign out, delete, …).
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
          authMode={auth.mode}
          authHasCredentials={
            auth.email.trim().length > 0 ||
            auth.password.length > 0 ||
            auth.cookiesJson.trim().length > 0
          }
          onTogglePath={toggleDiscoverPick}
          onSelectAll={() => setDiscoverPickAll(true)}
          onSelectNone={() => setDiscoverPickAll(false)}
          onAddSelected={addSelectedDiscovered}
          onDismiss={() => setDiscoverState({ status: "idle" })}
        />

        <div className="screen-cards">
          {screens.map((s) => {
            const cells = matrixCells();
            // Aggregate per-screen status: error wins, then running, then done, else queued.
            const cellStatuses = cells.map((c) => {
              const k = mediaKey(s.id, c.template.id, c.theme);
              return { cell: c, key: k, prog: progress[k], cap: captures[k] };
            });
            const summary: "queued" | "running" | "done" | "error" = cellStatuses.some(
              (cs) => cs.prog?.status === "error",
            )
              ? "error"
              : cellStatuses.some((cs) => cs.prog?.status === "running")
                ? "running"
                : cellStatuses.length > 0 && cellStatuses.every((cs) => cs.cap)
                  ? "done"
                  : "queued";
            const firstError = cellStatuses.find((cs) => cs.prog?.error)?.prog?.error;
            const anyCaptured = cellStatuses.some((cs) => cs.cap);
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
                    <span className={`status status-${summary}`}>{summary}</span>
                    {cells.length > 0 && (
                      <span className="cell-progress" aria-label="Matrix cell progress">
                        {cellStatuses.map((cs) => (
                          <span
                            key={cs.key}
                            className={`cell-dot cell-dot-${cs.prog?.status ?? (cs.cap ? "done" : "queued")}`}
                            title={`${cs.cell.template.displayName} / ${cs.cell.theme}: ${cs.prog?.status ?? (cs.cap ? "done" : "queued")}${cs.prog?.error ? ` — ${cs.prog.error}` : ""}`}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                  <div className="screen-card-actions">
                    {anyCaptured && (
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

                {firstError && (
                  <div className="screen-card-error" role="alert">
                    {firstError}
                  </div>
                )}
                {cellStatuses.some((cs) => cs.cap) && (
                  <div className="screen-card-cells">
                    {cellStatuses
                      .filter((cs) => cs.cap)
                      .map((cs) => (
                        <figure key={cs.key} className="screen-cell-preview">
                          <img
                            src={cs.cap?.rawBlobUrl}
                            alt={`${s.name} ${cs.cell.template.displayName} ${cs.cell.theme}`}
                          />
                          <figcaption>
                            {cs.cell.template.displayName} / {cs.cell.theme}
                          </figcaption>
                        </figure>
                      ))}
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
          Each capture renders through its own template + theme. To change the matrix, edit the grid
          in Step 1.
        </p>

        <div style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void renderAll()}
            disabled={isDisabled || renderingAll || captureCount === 0}
          >
            {renderingAll
              ? "Rendering…"
              : `Render all (${captureCount} capture${captureCount === 1 ? "" : "s"})`}
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

      {/* ── Step 4: Composites ────────────────────────────────────────── */}
      {Object.keys(composites).length > 0 && (
        <section className="crawler-step">
          <h2>4. Composites</h2>
          <div className="gallery-grid">
            {Object.values(composites).map((c) => {
              const screen = screens.find((s) => s.id === c.inputId);
              const tpl = templates.find((t) => t.id === c.templateId);
              const filename = `${screen?.name ?? "screen"}-${c.templateId}-${c.theme}.png`;
              return (
                <article key={mediaKey(c.inputId, c.templateId, c.theme)} className="gallery-card">
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

      <div className="field">
        <label>Post-login setup actions (JSON array, optional)</label>
        <textarea
          rows={4}
          value={auth.setupActionsJson}
          onChange={(e) => update("setupActionsJson", e.target.value)}
          disabled={disabled}
          spellCheck={false}
          placeholder={`[\n  { "type": "click", "selector": "button:has-text(\\"Skip tour\\")" }\n]`}
        />
        <p className="field-hint">
          Run once after login (or initial nav) before discovery / capture techniques. Use this to
          dismiss tour modals, accept cookie banners, or click past onboarding. Same shape as
          per-screen actions: <code>click</code>, <code>fill</code>, <code>press</code>,{" "}
          <code>wait</code>, <code>waitForSelector</code>, <code>waitForUrl</code>,{" "}
          <code>scroll</code>.
        </p>
      </div>
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
  authMode: AuthMode;
  authHasCredentials: boolean;
  onTogglePath: (path: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onAddSelected: () => void;
  onDismiss: () => void;
}

function DiscoverPanel({
  state,
  authMode,
  authHasCredentials,
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
        <header className="discover-panel-error-header">
          <div>
            <strong>Discover failed:</strong>{" "}
            <span style={{ whiteSpace: "pre-wrap" }}>{state.message}</span>
          </div>
          <button
            type="button"
            className="discover-dismiss"
            onClick={onDismiss}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </header>
        {state.errorScreenshot && (
          <figure className="discover-error-screenshot">
            <img
              src={`data:image/png;base64,${state.errorScreenshot}`}
              alt="Page state at the moment auth failed"
            />
            <figcaption>Page state at failure (live screenshot from the engine).</figcaption>
          </figure>
        )}
      </div>
    );
  }
  const total = state.routes.length;
  const picked = state.selected.size;

  // Detect "stuck on the public landing" — if discover only found a
  // login page + maybe the landing root, the user probably hit auth
  // they didn't (or couldn't) solve. Surface a specific hint.
  const looksStuckOnLogin =
    total > 0 && total <= 3 && state.routes.some((r) => /[/?]login|signin|sign-in/i.test(r.path));
  const authNoneButCredsFilled = authMode === "none" && authHasCredentials;
  const hint = looksStuckOnLogin
    ? authNoneButCredsFilled
      ? "Credentials are filled but Auth mode is set to “None”. Switch to “form” in Step 1's auth section so login runs before discovery."
      : authMode === "none"
        ? "Discovery hit a login wall. Configure form auth in Step 1 (URL, email, password, selectors) so discovery can log in and crawl the authenticated UI."
        : null
    : null;

  const summary = state.status === "ready" ? state.summary : undefined;

  return (
    <div className="discover-panel discover-panel-ready">
      {hint && (
        <div className="discover-panel-hint" role="note">
          <strong>Tip:</strong> {hint}
        </div>
      )}
      <header className="discover-panel-header">
        <strong>
          Discovered {total} route{total === 1 ? "" : "s"}
        </strong>
        <span className="discover-panel-meta">{picked} selected</span>
        {summary && (
          <span className="discover-panel-meta">
            {`from ${summary.startUrl}`} • {`link:${summary.perTechnique.link}`} •{" "}
            {`sitemap:${summary.perTechnique.sitemap}`} • {`common:${summary.perTechnique.common}`}{" "}
            • {`nav:${summary.perTechnique.nav}`}
          </span>
        )}
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
      {summary?.finalScreenshot && (
        <details className="discover-final-screenshot">
          <summary>Final page state (what the engine was crawling)</summary>
          <img
            src={`data:image/png;base64,${summary.finalScreenshot}`}
            alt="Page state at end of discovery"
          />
        </details>
      )}
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
