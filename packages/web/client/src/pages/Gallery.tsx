import { useEffect, useState } from "react";
import type { TemplateInfo, TemplatesResponse, Theme, TemplateCategory } from "../types.js";

const CATEGORY_LABELS: Record<TemplateCategory | "all", string> = {
  all: "All",
  "app-store": "App Store",
  "play-store": "Play Store",
  readme: "README",
  social: "Social",
};

const CATEGORY_ORDER: ReadonlyArray<TemplateCategory | "all"> = [
  "all",
  "app-store",
  "play-store",
  "readme",
  "social",
];

export function Gallery() {
  const [templates, setTemplates] = useState<ReadonlyArray<TemplateInfo> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TemplateCategory | "all">("all");

  useEffect(() => {
    fetch("/api/templates")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as TemplatesResponse;
      })
      .then((data) => setTemplates(data.templates))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const visible = templates?.filter((t) => filter === "all" || t.category === filter) ?? null;

  return (
    <section className="container">
      <h1>Templates gallery</h1>
      <p className="lede">
        Six first-party templates ship with Shotcraft. Each is its own npm package — install only
        what you need. Sample composites below were rendered by Shotcraft against the BudgetBug
        example app.
      </p>

      <div className="gallery-controls" role="tablist" aria-label="Filter by category">
        {CATEGORY_ORDER.map((cat) => (
          <button
            key={cat}
            role="tab"
            type="button"
            aria-selected={filter === cat}
            className={filter === cat ? "active" : ""}
            onClick={() => setFilter(cat)}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {error && (
        <p style={{ color: "#fda4af" }}>
          Couldn't load /api/templates: {error}. Start the server with{" "}
          <code>pnpm --filter @shotcraft/web dev</code>.
        </p>
      )}
      {!templates && !error && <p>Loading…</p>}

      {visible && (
        <div className="gallery-grid">
          {visible.map((tpl) => (
            <TemplateCard key={tpl.id} template={tpl} />
          ))}
        </div>
      )}
    </section>
  );
}

function TemplateCard({ template }: { template: TemplateInfo }) {
  const [activeTheme, setActiveTheme] = useState<Theme>(
    template.themes.includes("dark") ? "dark" : (template.themes[0] ?? "dark"),
  );

  const sample = template.samples.find((s) => s.theme === activeTheme) ?? template.samples[0];
  const installSnippet = `pnpm add -D ${template.pkg}`;

  return (
    <article className="gallery-card">
      <div className="gallery-card-preview">
        {sample ? (
          <img src={sample.url} alt={`${template.displayName} (${activeTheme}) sample`} />
        ) : (
          <span style={{ color: "rgba(241,245,249,0.4)" }}>No sample yet</span>
        )}
      </div>
      <div className="gallery-card-body">
        <h3>{template.displayName}</h3>
        <div className="gallery-card-meta">
          <span>
            {template.output.width} × {template.output.height}
          </span>
          <span className="pkg">{template.pkg}</span>
        </div>
        {template.themes.length > 1 && (
          <div className="theme-tabs" role="tablist" aria-label="Theme">
            {template.themes.map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={activeTheme === t}
                className={activeTheme === t ? "active" : ""}
                onClick={() => setActiveTheme(t)}
              >
                {t}
              </button>
            ))}
          </div>
        )}
        <pre style={{ marginTop: "0.5rem" }}>
          <code>{installSnippet}</code>
        </pre>
      </div>
    </article>
  );
}
