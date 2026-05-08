import { Link } from "react-router-dom";

export function Home() {
  return (
    <>
      <section className="hero">
        <h1>Capture your live app, ship every screenshot</h1>
        <p className="lede">
          Open-source CLI that turns your running web app into App Store, Play Store, GitHub README,
          and Open Graph composites in one command.
        </p>
        <div className="actions">
          <Link to="/templates" className="btn btn-primary">
            Browse templates
          </Link>
          <Link to="/builder" className="btn">
            Build a config
          </Link>
        </div>
      </section>
      <section className="container">
        <div className="feature-grid">
          <div className="feature">
            <h3>Captures from your live app</h3>
            <p>
              Existing tools (screenshots.pro, Bannerbear, Placid) require uploaded screenshots.
              Shotcraft drives a real Chromium against your dev server, staging URL, or production.
            </p>
          </div>
          <div className="feature">
            <h3>Six first-party templates</h3>
            <p>
              App Store iPhone + iPad, Play Store phone + tablet, GitHub README hero, and Open Graph
              / Twitter cards. Apple's, Google's, and GitHub's exact target dimensions, out of the
              box.
            </p>
          </div>
          <div className="feature">
            <h3>Templates as code</h3>
            <p>
              Visual brand lives in HTML/CSS files in your repo. Diff-able in PRs. No vendor
              lock-in, no SaaS subscription, no monthly render quotas.
            </p>
          </div>
          <div className="feature">
            <h3>Authentic auth</h3>
            <p>
              Pass a <code>setup(page)</code> function with full Playwright access. Handles OAuth,
              email + password, magic link, JWT — anything you can script.
            </p>
          </div>
        </div>

        <h2>Quickstart</h2>
        <pre>
          <code>{`pnpm add -D shotcraft \\
  @shotcraft/template-app-store-iphone \\
  @shotcraft/template-readme-hero
pnpm shotcraft init       # scaffold shotcraft.config.ts
pnpm shotcraft doctor     # sanity-check
pnpm shotcraft            # capture + render end-to-end`}</code>
        </pre>
        <p>
          Full docs at{" "}
          <a href="https://shotcraft.dev" target="_blank" rel="noreferrer">
            shotcraft.dev
          </a>
          .
        </p>
      </section>
    </>
  );
}
