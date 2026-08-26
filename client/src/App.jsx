import { Activity, Mic2, Music2 } from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";

// Pages are lazy-loaded so the initial bundle stays small; recharts and the
// page code load per route.
const HarmoniumPage = lazy(() =>
  import("./pages/HarmoniumPage.jsx").then((module) => ({ default: module.HarmoniumPage }))
);
const PracticePage = lazy(() =>
  import("./pages/PracticePage.jsx").then((module) => ({ default: module.PracticePage }))
);
const SargamPage = lazy(() =>
  import("./pages/SargamPage.jsx").then((module) => ({ default: module.SargamPage }))
);
const ProgressPage = lazy(() =>
  import("./pages/ProgressPage.jsx").then((module) => ({ default: module.ProgressPage }))
);

const ROUTES = {
  "/harmonium": HarmoniumPage,
  "/practice": PracticePage,
  "/sargam": SargamPage,
  "/progress": ProgressPage
};

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const activePath = useMemo(() => (path === "/" ? "/harmonium" : path), [path]);
  const ActivePage = ROUTES[activePath] || HarmoniumPage;

  function navigate(nextPath) {
    window.history.pushState({}, "", nextPath);
    setPath(nextPath);
  }

  useEffect(() => {
    if (window.location.pathname === "/") {
      window.history.replaceState({}, "", "/harmonium");
      setPath("/harmonium");
    }

    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Music2 size={22} aria-hidden="true" />
          </div>
          <div>
            <p className="eyebrow">SurSadhana AI</p>
            <h1>AI Vocal Pitch Trainer</h1>
          </div>
        </div>
        <div className="server-pill">
          <Activity size={16} aria-hidden="true" />
          FastAPI analysis
        </div>
      </header>

      <main>
        <section className="hero-band">
          <div>
            <p className="eyebrow">Harmonium-guided riyaz</p>
            <h2>Train pitch accuracy with live vocal feedback.</h2>
            <p>
              Calibrate your Sa, play a reference key, record a held note, and review
              frequency, cents offset, pitch movement, and vocal stability in one workflow.
            </p>
          </div>
          <div className="hero-stat" aria-label="Recording and pitch analysis">
            <Mic2 size={30} aria-hidden="true" />
            <span>Analyze</span>
            <strong>Pitch, drift, stability</strong>
          </div>
        </section>
        <nav className="mode-tabs" aria-label="Practice modes">
          <button
            className={activePath === "/harmonium" ? "active" : ""}
            type="button"
            onClick={() => navigate("/harmonium")}
          >
            Harmonium
          </button>
          <button
            className={activePath === "/practice" ? "active" : ""}
            type="button"
            onClick={() => navigate("/practice")}
          >
            Practice
          </button>
          <button
            className={activePath === "/sargam" ? "active" : ""}
            type="button"
            onClick={() => navigate("/sargam")}
          >
            Sargam
          </button>
          <button
            className={activePath === "/progress" ? "active" : ""}
            type="button"
            onClick={() => navigate("/progress")}
          >
            Progress
          </button>
        </nav>
        <Suspense fallback={<div className="page-loading">Loading page...</div>}>
          <ActivePage />
        </Suspense>
      </main>
    </div>
  );
}
