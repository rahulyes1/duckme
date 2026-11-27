/**
 * Incoming shares and home-screen shortcuts.
 *  - Web Share Target (manifest "share_target", GET): ./?title=…&text=…&url=…
 *  - Shortcuts: ./?new=note and ./?new=expense
 * App.tsx reads these once on start, acts, then clears them from the address bar.
 */
import type { Card } from '../../lib/types';

export type IncomingShare =
  | { kind: 'share'; title?: string; text?: string; url?: string }
  | { kind: 'new'; type: 'note' | 'expense' | 'sms' | 'search' }
  | null;

const KEYS = ['title', 'text', 'url', 'new'] as const;
const MAX = 20000;

const clean = (v: string | null): string | undefined => {
  const t = (v ?? '').replace(/\r\n?/g, '\n').trim();
  return t ? t.slice(0, MAX) : undefined;
};

/** Reads ?new= or ?title/text/url from the URL search string (defaults to location.search). */
export function readIncomingShare(search: string = typeof location !== 'undefined' ? location.search : ''): IncomingShare {
  let p: URLSearchParams;
  try { p = new URLSearchParams(search); } catch { return null; }
  const n = p.get('new');
  if (n === 'note' || n === 'expense' || n === 'sms' || n === 'search') return { kind: 'new', type: n };
  const title = clean(p.get('title'));
  const text = clean(p.get('text'));
  const url = clean(p.get('url'));
  if (!title && !text && !url) return null;
  return { kind: 'share', ...(title ? { title } : {}), ...(text ? { text } : {}), ...(url ? { url } : {}) };
}

/** Removes the share / shortcut params from the address bar, keeping any other params and the #hash. */
export function clearIncomingShare(): void {
  try {
    const u = new URL(location.href);
    let changed = false;
    for (const k of KEYS) if (u.searchParams.has(k)) { u.searchParams.delete(k); changed = true; }
    if (!changed) return;
    const q = u.searchParams.toString();
    history.replaceState(history.state, '', `${u.pathname}${q ? `?${q}` : ''}${u.hash}`);
  } catch { /* old browser: leave the URL alone */ }
}

/**
 * The note to create from shared content. The url is added on its own line unless the text already
 * contains it (many Android apps put the link inside "text"). Returns null when nothing was shared.
 */
export function shareToNote(s: { title?: string; text?: string; url?: string }): (Partial<Card> & { type: 'note' }) | null {
  const title = (s.title ?? '').trim();
  let text = (s.text ?? '').trim();
  const url = (s.url ?? '').trim();
  if (title && text === title) text = '';
  const body = [text, url && !text.includes(url) ? url : ''].filter(Boolean).join('\n');
  if (!title && !body) return null;
  return { type: 'note', title: title.replace(/\s*\n\s*/g, ' '), body };
}
