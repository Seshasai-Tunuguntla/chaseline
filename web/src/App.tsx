import { lazy, Suspense, useEffect, useState } from "react";
import { loadJson } from "./lib/data";
import type { SiteIndex } from "./lib/types";
import { legacyHashToPath, navigate, parsePath, type Route } from "./lib/route";
import { ErrorBoundary, Skeleton, EmptyState } from "./components/Feedback";
import Replay from "./pages/Replay";

const Explorer = lazy(() => import("./pages/Explorer"));
const Players = lazy(() => import("./pages/Players"));
const WhatIf = lazy(() => import("./pages/WhatIf"));
const Model = lazy(() => import("./pages/Model"));

function currentRoute(): Route {
  const legacy = legacyHashToPath(window.location.hash);
  if (legacy) window.history.replaceState(null, "", legacy); // old /#/replay/ID links keep working
  return parsePath(window.location.pathname);
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
  const [route, setRoute] = useState(currentRoute);
  const [index, setIndex] = useState<SiteIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const on = () => setRoute(currentRoute());
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest("a");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target || a.origin !== window.location.origin || a.pathname.startsWith("/data/")) return;
      e.preventDefault();
      navigate(a.pathname);
    };
    window.addEventListener("popstate", on);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("popstate", on);
      document.removeEventListener("click", onClick);
    };
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
    ["whatif", "What if?"],
    ["model", "The model"],
  ] as const;

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="top">
        <a className="brand" href="/replay">
          <Logo />
          <span className="brand-name">CHASELINE</span>
        </a>
        <nav aria-label="Main">
          {nav.map(([key, label]) => (
            <a key={key} href={`/${key}`} aria-current={route.page === key ? "page" : undefined}>
              {label}
            </a>
          ))}
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        {error && (
          <EmptyState level={1} tone="error" title="Could not load the data" action={{ label: "Try again", onClick: () => window.location.reload() }}>
            The site’s data files did not load ({error}). Check your connection and try again.
          </EmptyState>
        )}
        {index && (
          <ErrorBoundary resetKey={`${route.page}/${route.arg ?? ""}`}>
          <Suspense fallback={<Skeleton kind="board" />}>
            {route.page === "explorer" ? (
              <Explorer index={index} />
            ) : route.page === "player" ? (
              <Players index={index} playerId={route.arg} />
            ) : route.page === "whatif" ? (
              <WhatIf />
            ) : route.page === "model" ? (
              <Model index={index} />
            ) : (
              <Replay index={index} matchId={route.arg ?? index.featured} />
            )}
          </Suspense>
          </ErrorBoundary>
        )}
        {!index && !error && <Skeleton kind="board" />}
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
