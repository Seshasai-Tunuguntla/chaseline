export interface Option {
  id: string;
  label: string;
  hint?: string;
}

/** Rank options for a query: label starts with it, then a word starts with it, then it appears anywhere. */
export function rank(options: Option[], q: string, limit: number): Option[] {
  const s = q.trim().toLowerCase();
  if (!s) return options.slice(0, limit);
  const starts: Option[] = [];
  const word: Option[] = [];
  const inside: Option[] = [];
  for (const o of options) {
    const l = o.label.toLowerCase();
    if (l.startsWith(s)) starts.push(o);
    else if (l.split(/\s+/).some((w) => w.startsWith(s))) word.push(o);
    else if (l.includes(s)) inside.push(o);
  }
  return [...starts, ...word, ...inside].slice(0, limit);
}
