import { useEffect, useMemo, useState } from "react";
import type { TemplateInfo, TemplatesResponse } from "../types.js";

interface ScreenRow {
  id: string; // local-only React key
  route: string;
  name: string;
  caption: string;
  waitMs: number;
}

const DEFAULT_SCREENS: ReadonlyArray<ScreenRow> = [
  { id: cryptoId(), route: "/", name: "01-home", caption: "Welcome to your app", waitMs: 1500 },
];

function cryptoId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function Builder() {
  const [target, setTarget] = useState("http://localhost:5173");
  const [includeAuth, setIncludeAuth] = useState(true);
  const [screens, setScreens] = useState<ScreenRow[]>(DEFAULT_SCREENS.slice());
  const [templates, setTemplates] = useState<ReadonlyArray<TemplateInfo>>([]);
  const [pickedTemplates, setPickedTemplates] = useState<Set<string>>(
    new Set(["@shotcraft/template-app-store-iphone"]),
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json() as Promise<TemplatesResponse>)
      .then((data) => setTemplates(data.templates))
      .catch(() => setTemplates([]));
  }, []);

  const togglePicked = (pkg: string) => {
    const next = new Set(pickedTemplates);
    if (next.has(pkg)) next.delete(pkg);
    else next.add(pkg);
    setPickedTemplates(next);
  };

  const updateScreen = (id: string, patch: Partial<ScreenRow>) => {
    setScreens((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const addScreen = () => {
    const idx = screens.length + 1;
    setScreens((rows) => [
      ...rows,
      {
        id: cryptoId(),
        route: "/",
        name: `${String(idx).padStart(2, "0")}-screen`,
        caption: "",
        waitMs: 1500,
      },
    ]);
  };

  const removeScreen = (id: string) => {
    setScreens((rows) => rows.filter((r) => r.id !== id));
  };

  const snippet = useMemo(
    () => buildSnippet({ target, includeAuth, screens, pickedTemplates }),
    [target, includeAuth, screens, pickedTemplates],
  );

  const handleCopy = () => {
    void navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <section className="container">
      <h1>Config builder</h1>
      <p className="lede">
        Fill in your app, screens, and which templates to render through. Copy the resulting{" "}
        <code>shotcraft.config.ts</code> to your project's repo root and you're done.
      </p>

      <div className="builder-grid">
        <form className="builder-form" onSubmit={(e) => e.preventDefault()}>
          <fieldset>
            <legend>Target</legend>
            <div className="field">
              <label htmlFor="target">App URL</label>
              <input
                id="target"
                type="url"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="http://localhost:5173"
              />
            </div>
            <label className="template-checkbox">
              <input
                type="checkbox"
                checked={includeAuth}
                onChange={(e) => setIncludeAuth(e.target.checked)}
              />
              <span className="template-checkbox-label">
                Include a sample <code>setup(page)</code> hook with a login flow
              </span>
            </label>
          </fieldset>

          <fieldset>
            <legend>Screens</legend>
            {screens.map((row) => (
              <div className="screen-row" key={row.id}>
                <div>
                  <label>Route</label>
                  <input
                    type="text"
                    value={row.route}
                    onChange={(e) => updateScreen(row.id, { route: e.target.value })}
                  />
                </div>
                <div>
                  <label>Name</label>
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => updateScreen(row.id, { name: e.target.value })}
                  />
                </div>
                <div>
                  <label>Caption</label>
                  <input
                    type="text"
                    value={row.caption}
                    onChange={(e) => updateScreen(row.id, { caption: e.target.value })}
                  />
                </div>
                <div>
                  <label>waitMs</label>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={row.waitMs}
                    onChange={(e) => updateScreen(row.id, { waitMs: Number(e.target.value) || 0 })}
                  />
                </div>
                <button
                  type="button"
                  className="remove"
                  aria-label="Remove screen"
                  onClick={() => removeScreen(row.id)}
                >
                  ✕
                </button>
              </div>
            ))}
            <button type="button" onClick={addScreen}>
              + Add screen
            </button>
          </fieldset>

          <fieldset>
            <legend>Templates</legend>
            {templates.length === 0 ? (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Loading templates…
              </p>
            ) : (
              templates.map((tpl) => (
                <label key={tpl.id} className="template-checkbox">
                  <input
                    type="checkbox"
                    checked={pickedTemplates.has(tpl.pkg)}
                    onChange={() => togglePicked(tpl.pkg)}
                  />
                  <span className="template-checkbox-label">
                    {tpl.displayName}
                    <code className="pkg">{tpl.pkg}</code>
                  </span>
                </label>
              ))
            )}
          </fieldset>
        </form>

        <aside className="builder-output">
          <h2>
            shotcraft.config.ts
            <button type="button" className="btn-primary" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </h2>
          <pre>
            <code>{snippet}</code>
          </pre>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Paste at your project root. Then{" "}
            <code>pnpm add -D shotcraft {Array.from(pickedTemplates).join(" ")}</code> to install
            the packages, and run <code>pnpm shotcraft</code>.
          </p>
        </aside>
      </div>
    </section>
  );
}

function buildSnippet(opts: {
  target: string;
  includeAuth: boolean;
  screens: ReadonlyArray<ScreenRow>;
  pickedTemplates: ReadonlySet<string>;
}): string {
  const setupBlock = opts.includeAuth
    ? `
  setup: async (page) => {
    // Replace with your real auth flow. \`page\` is a real Playwright Page —
    // navigate, fill, fetch — anything you can script.
    await page.goto("${opts.target}/login", { waitUntil: "domcontentloaded" });
    await page.evaluate(async () => {
      await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: "demo@example.com",
          password: "...",
        }),
      });
    });
  },
`
    : "";

  const screensBlock = opts.screens
    .map(
      (s) =>
        `    {
      route: ${JSON.stringify(s.route)},
      name: ${JSON.stringify(s.name)},
      caption: ${JSON.stringify(s.caption)},
      waitMs: ${s.waitMs},
    },`,
    )
    .join("\n");

  const templatesBlock = Array.from(opts.pickedTemplates)
    .map((pkg) => `    ${JSON.stringify(pkg)},`)
    .join("\n");

  return `import { defineConfig } from "shotcraft";

export default defineConfig({
  target: ${JSON.stringify(opts.target)},
${setupBlock}
  screens: [
${screensBlock}
  ],

  templates: [
${templatesBlock}
  ],

  outputDir: "./screenshots",
});
`;
}
