import { Component, type ReactNode } from "react";

/** Grey placeholder shapes shown while data loads. `kind` picks a layout that matches the real content. */
export function Skeleton({ kind, label = "Loading" }: { kind: "board" | "table" | "chart" | "profile" | "text"; label?: string }) {
  const bar = (w: string, h = 14) => <span className="sk" style={{ width: w, height: h }} />;
  return (
    <div className="skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr">{label}…</span>
      {kind === "board" && (
        <div className="sk-board">
          <span className="sk" style={{ height: 96 }} /><span className="sk" style={{ height: 96 }} />
        </div>
      )}
      {kind === "chart" && <span className="sk" style={{ height: 300 }} />}
      {kind === "table" && (
        <div className="sk-rows">
          {bar("40%", 16)}
          {Array.from({ length: 8 }, (_, i) => <span key={i} className="sk" style={{ height: 22 }} />)}
        </div>
      )}
      {kind === "profile" && (
        <div className="sk-rows">
          {bar("45%", 30)}
          <div className="sk-board">{Array.from({ length: 3 }, (_, i) => <span key={i} className="sk" style={{ height: 64 }} />)}</div>
          {Array.from({ length: 5 }, (_, i) => <span key={i} className="sk" style={{ height: 22 }} />)}
        </div>
      )}
      {kind === "text" && <div className="sk-rows">{bar("90%")}{bar("75%")}{bar("60%")}</div>}
    </div>
  );
}

/** A friendly empty or error state with an optional action. */
export function EmptyState(props: { title: string; children?: ReactNode; action?: { label: string; onClick: () => void }; tone?: "empty" | "error"; level?: 1 | 2 }) {
  const { title, children, action, tone = "empty", level = 2 } = props;
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className={`empty ${tone}`} role={tone === "error" ? "alert" : undefined}>
      <svg className="empty-icon" viewBox="0 0 48 40" aria-hidden="true" focusable="false">
        <g fill="currentColor"><rect x="14" y="10" width="4" height="26" rx="1.5" /><rect x="22" y="10" width="4" height="26" rx="1.5" /><rect x="30" y="10" width="4" height="26" rx="1.5" /></g>
        <g fill="#f1efe4">{tone === "error" ? <><rect x="10" y="3" width="12" height="3" rx="1.5" transform="rotate(-18 16 4)" /><rect x="26" y="4" width="12" height="3" rx="1.5" /></> : <><rect x="12" y="4" width="10" height="3" rx="1.5" /><rect x="26" y="4" width="10" height="3" rx="1.5" /></>}</g>
      </svg>
      <Heading>{title}</Heading>
      {children && <p>{children}</p>}
      {action && <button type="button" onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}

/** Catches render errors and failed lazy chunks so one broken page never blanks the app. Resets when `resetKey` changes. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  static getDerivedStateFromProps(props: { resetKey: string }, state: { error: Error | null; key: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <EmptyState level={1} tone="error" title="This page hit a snag" action={{ label: "Reload the page", onClick: () => window.location.reload() }}>
        Something went wrong while showing this page ({this.state.error.message}). Reloading usually fixes it, or{" "}
        <a href="/replay">go back to the match replay</a>.
      </EmptyState>
    );
  }
}
