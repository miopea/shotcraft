import { NavLink, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home.js";
import { Gallery } from "./pages/Gallery.js";
import { Builder } from "./pages/Builder.js";
import { Demo } from "./pages/Demo.js";
import { Crawler } from "./pages/Crawler.js";

export function App() {
  return (
    <div className="app">
      <header className="nav">
        <div className="nav-inner">
          <NavLink to="/" className="brand" end>
            <img
              className="brand-mark"
              src="/shotcraft-icon.svg"
              alt=""
              aria-hidden="true"
              width={26}
              height={26}
            />
            Shotcraft
          </NavLink>
          <nav>
            <NavLink to="/crawler" className={({ isActive }) => (isActive ? "active" : "")}>
              Crawler
            </NavLink>
            <NavLink to="/templates" className={({ isActive }) => (isActive ? "active" : "")}>
              Templates
            </NavLink>
            <NavLink to="/builder" className={({ isActive }) => (isActive ? "active" : "")}>
              Config builder
            </NavLink>
            <NavLink to="/demo" className={({ isActive }) => (isActive ? "active" : "")}>
              Live demo
            </NavLink>
            <a
              href="https://github.com/miopea/shotcraft/tree/main/docs"
              target="_blank"
              rel="noreferrer"
            >
              Docs
            </a>
            <a href="https://github.com/miopea/shotcraft" target="_blank" rel="noreferrer">
              GitHub
            </a>
          </nav>
        </div>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/crawler" element={<Crawler />} />
          <Route path="/templates" element={<Gallery />} />
          <Route path="/builder" element={<Builder />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="footer">
        Shotcraft is open source — MIT licensed. ·{" "}
        <a
          href="https://github.com/miopea/shotcraft/tree/main/docs"
          target="_blank"
          rel="noreferrer"
        >
          Docs
        </a>{" "}
        ·{" "}
        <a href="https://github.com/miopea/shotcraft" target="_blank" rel="noreferrer">
          GitHub
        </a>
        <div className="footer-version" title={`Built ${__SHOTCRAFT_BUILD_TIME__}`}>
          <code>
            v{__SHOTCRAFT_VERSION__} <span className="footer-sha">{__SHOTCRAFT_GIT_SHA__}</span>
          </code>
        </div>
      </footer>
    </div>
  );
}

function NotFound() {
  return (
    <section className="container">
      <h1>Not found</h1>
      <p>
        That route doesn't exist. Try the <NavLink to="/templates">templates gallery</NavLink> or
        the <NavLink to="/builder">config builder</NavLink>.
      </p>
    </section>
  );
}
