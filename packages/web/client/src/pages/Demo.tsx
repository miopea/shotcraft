import { useEffect, useState } from "react";
import type { HealthResponse, TemplateInfo, TemplatesResponse } from "../types.js";

interface RenderState {
  status: "idle" | "loading" | "success" | "error";
  url?: string;
  pngObjectUrl?: string;
  error?: string;
}

export function Demo() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [templates, setTemplates] = useState<ReadonlyArray<TemplateInfo>>([]);
  const [targetUrl, setTargetUrl] = useState("https://shotcraft.bfgsolutions.net");
  const [caption, setCaption] = useState("Capture your live app");
  const [subtitle, setSubtitle] = useState("");
  const [templateId, setTemplateId] = useState("readme-hero");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [token, setToken] = useState("");
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

  // Cache previously created blob URL so we revoke when a new render lands.
  useEffect(() => {
    return () => {
      if (render.pngObjectUrl) URL.revokeObjectURL(render.pngObjectUrl);
    };
  }, [render.pngObjectUrl]);

  const activeTemplate = templates.find((t) => t.id === templateId) ?? null;
  const themeOptions = activeTemplate?.themes ?? ["dark"];
  const isDisabled = health !== null && !health.liveDemoEnabled;

  // Keep theme valid for the picked template.
  useEffect(() => {
    if (activeTemplate && !activeTemplate.themes.includes(theme)) {
      setTheme(activeTemplate.themes[0] ?? "dark");
    }
  }, [activeTemplate, theme]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (render.pngObjectUrl) URL.revokeObjectURL(render.pngObjectUrl);
    setRender({ status: "loading" });

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
        Paste any public URL, pick a template, and Shotcraft renders a real composite from this
        server. Same engine the CLI runs locally — no install required.
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
                Must be publicly reachable HTTP(S). Localhost / private IPs blocked server-side.
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
            <legend>Auth (optional)</legend>
            <div className="field">
              <label htmlFor="demo-token">Bearer token</label>
              <input
                id="demo-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Only required if SHOTCRAFT_LIVE_DEMO_TOKEN is set"
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
              Submit the form to render. Captures + composites take 5–15 seconds.
            </p>
          )}
          {render.status === "loading" && (
            <p style={{ color: "var(--text-muted)" }}>
              Capturing {targetUrl} → composing through {activeTemplate?.displayName ?? templateId}…
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
