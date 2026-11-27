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

/*
 * Nav reset: tapping a tab in the bottom menu (or Home from an editor) lands on that screen's
 * default state — Money on Overview, Priorities on its default view, no search or filter.
 * A screen that is being opened peeks the flag in its first render (it remembers sub-views
 * otherwise); a screen that is already open hears the 'hisaab:reset' event instead.
 */
let resetFor: string | null = null;
export const NAV_RESET = 'hisaab:reset';
export function markNavReset(route: string) { resetFor = route; }
/** True when this screen was just opened from the nav (so it should show its default view). */
export function peekNavReset(route: string): boolean { return resetFor === route; }
export function clearNavReset() { resetFor = null; }
