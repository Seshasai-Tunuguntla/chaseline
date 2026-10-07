import { useId, useMemo, useRef, useState } from "react";

import { rank, type Option } from "../lib/search";

/** Accessible combobox (ARIA 1.2 list autocomplete): arrow keys, Enter, Escape, mouse, and a live result count. */
export default function Autocomplete(props: {
  label: string;
  options: Option[];
  onSelect: (o: Option) => void;
  placeholder?: string;
  initial?: string;
  limit?: number;
}) {
  const { label, options, onSelect, placeholder, initial = "", limit = 8 } = props;
  const uid = useId();
  const [q, setQ] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => rank(options, q, limit), [options, q, limit]);
  const listId = `${uid}-list`;
  const pick = (o: Option) => {
    setQ(o.label);
    setOpen(false);
    onSelect(o);
  };
  const showList = open && q.trim().length > 0;
  return (
    <div className="combo">
      <label htmlFor={`${uid}-in`}><span>{label}</span></label>
      <input
        ref={inputRef}
        id={`${uid}-in`}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `${uid}-o${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && showList && results[active]) {
            e.preventDefault();
            pick(results[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      <ul id={listId} role="listbox" aria-label={`${label} suggestions`} hidden={!showList} className="combo-list">
        {results.map((o, i) => (
          <li
            key={o.id}
            id={`${uid}-o${i}`}
            role="option"
            aria-selected={i === active}
            className={i === active ? "on" : undefined}
            onMouseDown={(e) => {
              e.preventDefault(); // keep focus so blur does not close the list before the click lands
              pick(o);
            }}
            onMouseEnter={() => setActive(i)}
          >
            <span>{o.label}</span>
            {o.hint && <span className="muted small">{o.hint}</span>}
          </li>
        ))}
      </ul>
      <span className="sr" role="status" aria-live="polite">
        {showList ? (results.length ? `${results.length} suggestion${results.length === 1 ? "" : "s"}` : "No matches") : ""}
      </span>
      {showList && results.length === 0 && <p className="muted small combo-none">No player matches “{q.trim()}”. Check the spelling; names look like “V Kohli”.</p>}
    </div>
  );
}
