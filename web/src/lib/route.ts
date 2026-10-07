export interface Route {
  page: "replay" | "explorer" | "player" | "model";
  arg?: string;
}

const PAGES = new Set(["replay", "explorer", "player", "model"]);

/** Parse a clean path such as /replay/1082591 (anything unknown falls back to the replay page). */
export function parsePath(pathname: string): Route {
  const [page, arg] = pathname.replace(/^\/+|\/+$/g, "").split("/");
  return { page: PAGES.has(page) ? (page as Route["page"]) : "replay", arg: arg || undefined };
}

/** Old links looked like /#/replay/ID. Returns the equivalent clean path, or null if the hash is not one. */
export function legacyHashToPath(hash: string): string | null {
  if (!hash.startsWith("#/")) return null;
  const parts = hash.slice(2).split("/").filter(Boolean);
  return parts.length && PAGES.has(parts[0]) ? `/${parts.join("/")}` : "/";
}

export function navigate(path: string): void {
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
