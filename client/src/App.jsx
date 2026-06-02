import { Activity, Mic2, Music2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HarmoniumPage } from "./pages/HarmoniumPage.jsx";
import { SargamPage } from "./pages/SargamPage.jsx";

const ROUTES = {
  "/harmonium": HarmoniumPage,
  "/sargam": SargamPage
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
            <h1>Harmonium Pitch Practice</h1>
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
            <p className="eyebrow">MVP practice mode</p>
            <h2>Match your voice to a target harmonium note.</h2>
            <p>
              Select Sa, Re, Ga, Ma, Pa, Dha, Ni, or upper Sa, then record a short
              vocal sample for backend pitch analysis.
            </p>
          </div>
          <div className="hero-stat" aria-label="Recording and pitch analysis">
            <Mic2 size={30} aria-hidden="true" />
            <span>Record</span>
            <strong>Detect pitch</strong>
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
            className={activePath === "/sargam" ? "active" : ""}
            type="button"
            onClick={() => navigate("/sargam")}
          >
            Sargam
          </button>
        </nav>
        <ActivePage />
      </main>
    </div>
  );
}
