import { lazy, Suspense, useEffect, useState } from "react";
import { loadJson } from "./lib/data";
import type { SiteIndex } from "./lib/types";
import Replay from "./pages/Replay";

const Explorer = lazy(() => import("./pages/Explorer"));
const Players = lazy(() => import("./pages/Players"));
const Model = lazy(() => import("./pages/Model"));

function parseHash(): { page: string; arg?: string } {
  const [, page = "replay", arg] = window.location.hash.replace(/^#/, "").split("/");
  return { page: page || "replay", arg };
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 40 36" aria-hidden="true" focusable="false">
      <g fill="currentColor">
        <rect x="9" y="9" width="4" height="24" rx="1.5" />
        <rect x="18" y="9" width="4" height="24" rx="1.5" />
        <rect x="27" y="9" width="4" height="24" rx="1.5" />
      </g>
      <g fill="#f1efe4">
        <rect x="8" y="4" width="9" height="3" rx="1.5" />
        <rect x="23" y="4" width="9" height="3" rx="1.5" />
      </g>
    </svg>
  );
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [index, setIndex] = useState<SiteIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => {
    loadJson<SiteIndex>("index.json").then(setIndex, (e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [route.page]);

  const nav = [
    ["replay", "Match replay"],
    ["explorer", "Explorer"],
    ["player", "Players"],
    ["model", "The model"],
  ] as const;

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="top">
        <a className="brand" href="#/replay">
          <Logo />
          <span className="brand-name">CHASELINE</span>
        </a>
        <nav aria-label="Main">
          {nav.map(([key, label]) => (
            <a key={key} href={`#/${key}`} aria-current={route.page === key ? "page" : undefined}>
              {label}
            </a>
          ))}
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        {error && <p className="notice" role="alert">Could not load data: {error}</p>}
        {index && (
          <Suspense fallback={<p className="notice">Loading…</p>}>
            {route.page === "explorer" ? (
              <Explorer index={index} />
            ) : route.page === "player" ? (
              <Players index={index} playerId={route.arg} />
            ) : route.page === "model" ? (
              <Model index={index} />
            ) : (
              <Replay index={index} matchId={route.arg ?? index.featured} />
            )}
          </Suspense>
        )}
        {!index && !error && <p className="notice">Loading…</p>}
      </main>
      <footer className="foot">
        <p>
          Ball-by-ball data from <a href="https://cricsheet.org/">Cricsheet</a>, used under the{" "}
          <a href="https://opendatacommons.org/licenses/by/1-0/">Open Data Commons Attribution License (ODC-By 1.0)</a>.
          Chaseline modified the data: parsed, cleaned and summarised it, and added modelled win probabilities.
          {index && <> Data through {index.source.latest_match}; rebuilt {index.generated}.</>}
        </p>
        <p>
          An independent hobby project, not affiliated with or endorsed by the IPL, BCCI or any team. Team names are
          used only to identify teams; no logos are used.{" "}
          <a href="https://github.com/Seshasai-Tunuguntla/chaseline">Source on GitHub</a>.
        </p>
      </footer>
    </>
  );
}
