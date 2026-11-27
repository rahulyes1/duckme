/**
 * Small pure helpers that keep long notes (10,000+ words) smooth: a word count for the editor footer,
 * a debounce for heavy per-keystroke work, and the clipped text a grid tile renders.
 */

/** Words in a note: runs of letters/digits (any script), so "₹1,200" and "don't" count once. */
export function countWords(text: string): number {
  if (!text) return 0;
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}'’.,_-]*/gu);
  return m ? m.length : 0;
}

/** "1 word", "1,240 words" (Indian grouping, like the rest of the app). */
export function fmtWords(n: number): string {
  return `${n.toLocaleString('en-IN')} ${n === 1 ? 'word' : 'words'}`;
}

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Run a pending call now (if any). */
  flush: () => void;
  /** Drop a pending call. */
  cancel: () => void;
}

/**
 * Trailing-edge debounce with an optional maxWait, so a long typing burst still runs at least every
 * `maxWait` ms. Timers are injectable for tests.
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
  opts: { maxWait?: number; now?: () => number; setT?: (f: () => void, ms: number) => unknown; clearT?: (h: unknown) => void } = {},
): Debounced<A> {
  const now = opts.now ?? (() => Date.now());
  const setT = opts.setT ?? ((f, ms) => setTimeout(f, ms));
  const clearT = opts.clearT ?? (h => clearTimeout(h as ReturnType<typeof setTimeout>));
  let handle: unknown = null;
  let args: A | null = null;
  let first = 0;
  const run = () => {
    if (handle !== null) clearT(handle);
    handle = null;
    const a = args;
    args = null;
    if (a) fn(...a);
  };
  const d = ((...a: A) => {
    if (!args) first = now();
    args = a;
    if (handle !== null) clearT(handle);
    const left = opts.maxWait != null ? Math.max(0, Math.min(wait, first + opts.maxWait - now())) : wait;
    handle = setT(run, left);
  }) as Debounced<A>;
  d.flush = run;
  d.cancel = () => { if (handle !== null) clearT(handle); handle = null; args = null; };
  return d;
}

/**
 * The part of a note a grid tile actually renders. A tile shows ~9 lines, so rendering a 10,000-word
 * body there is wasted work on every save. Cuts at whole lines and says whether more text follows,
 * so the tile can fade out and show "…". `cols` is a rough count of characters per tile line.
 */
export function tileText(text: string, maxLines = 9, cols = 24): { text: string; more: boolean } {
  const lines = text.replace(/\s+$/, '').split('\n');
  let used = 0;
  const out: string[] = [];
  for (const l of lines) {
    const rows = Math.max(1, Math.ceil(l.length / cols));
    if (used + rows > maxLines) {
      // Keep a slice of the line that starts past the limit so the tile is filled to the bottom.
      const room = maxLines - used;
      if (room > 0) out.push(l.slice(0, room * cols + cols));
      return { text: out.join('\n'), more: true };
    }
    out.push(l);
    used += rows;
  }
  return { text: out.join('\n'), more: false };
}
