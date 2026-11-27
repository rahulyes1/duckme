import { useEffect, useState } from 'react';

/**
 * `value`, but only after it has stopped changing for `ms`. Heavy derived work (calc lines, smart
 * chips, word count) reads this so typing in a long note stays instant. Short values update at once.
 */
export function useDebounced<T>(value: T, ms: number, immediate = false): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (immediate) { setV(value); return; }
    const t = window.setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms, immediate]);
  return immediate ? value : v;
}
