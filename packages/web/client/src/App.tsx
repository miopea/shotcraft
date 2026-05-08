import { useEffect, useState } from "react";

interface HealthResponse {
  status: string;
  liveDemoEnabled: boolean;
  version: string;
}

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json() as Promise<HealthResponse>)
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  return (
    <main
      style={{
        fontFamily:
          "-apple-system, 'Segoe UI', Inter, system-ui, sans-serif",
        padding: "4rem 2rem",
        maxWidth: 720,
        margin: "0 auto",
        lineHeight: 1.6,
      }}
    >
      <h1>Shotcraft</h1>
      <p>
        Capture your live app and ship App Store-ready screenshots, README hero
        images, and social cards in one command.
      </p>
      <p>
        🚧 <strong>v0 scaffold.</strong> Templates gallery, config builder,
        docs, and live demo land in Phase 8 of the v1 plan.
      </p>
      {health ? (
        <pre
          style={{
            background: "#f4f4f5",
            padding: "1rem",
            borderRadius: 8,
            overflowX: "auto",
          }}
        >
{JSON.stringify(health, null, 2)}
        </pre>
      ) : (
        <p style={{ color: "#888" }}>(server unreachable — start it with <code>pnpm --filter @shotcraft/web dev</code>)</p>
      )}
    </main>
  );
}
