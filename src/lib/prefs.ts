/** Small UI preferences in localStorage. Kept tiny so any screen can use it without pulling in Money. */

/** Reads/writes a small UI preference; storage can be blocked, so every access is guarded. */
export function readPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch { return fallback; }
}
export function writePref(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* storage blocked */ }
}
