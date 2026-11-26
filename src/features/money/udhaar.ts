/**
 * Udhaar: money lent to or borrowed from people directly (not a shared bill). Pure; tested in udhaar.test.ts.
 * Entries live in settings.udhaar so they sync with everything else.
 */
import type { UdhaarEntry } from '../../lib/types';
import { fmtDate, inr } from '../../lib/format';
import { cleanName, sameName, upiLink } from './split';

export interface UdhaarPerson {
  name: string;
  /** Positive = they owe me, negative = I owe them. Open entries only. */
  net: number;
  open: UdhaarEntry[];
  settled: UdhaarEntry[];
  /** Oldest open entry date (YYYY-MM-DD), for "since 12-10". */
  since: string | null;
}

const signed = (e: UdhaarEntry) => (e.dir === 'lent' ? e.amount : -e.amount);

export function udhaarPeople(entries: UdhaarEntry[]): UdhaarPerson[] {
  const map = new Map<string, UdhaarPerson>();
  for (const e of entries) {
    const key = cleanName(e.name).toLowerCase();
    const p = map.get(key) ?? { name: cleanName(e.name), net: 0, open: [], settled: [], since: null };
    if (e.settled) p.settled.push(e);
    else {
      p.open.push(e);
      p.net = Math.round((p.net + signed(e)) * 100) / 100;
      if (!p.since || e.date < p.since) p.since = e.date;
    }
    map.set(key, p);
  }
  return [...map.values()].sort((a, b) => (b.open.length ? 1 : 0) - (a.open.length ? 1 : 0) || Math.abs(b.net) - Math.abs(a.net));
}

export function udhaarTotals(people: UdhaarPerson[]): { owedToMe: number; iOwe: number } {
  return {
    owedToMe: people.reduce((s, p) => s + Math.max(0, p.net), 0),
    iOwe: people.reduce((s, p) => s + Math.max(0, -p.net), 0),
  };
}

/** Mark every open entry with this person settled (when you've squared up). */
export function settleAll(entries: UdhaarEntry[], name: string, at: number): UdhaarEntry[] {
  return entries.map(e => (sameName(e.name, name) && !e.settled ? { ...e, settled: true, settledAt: at } : e));
}

/** A polite WhatsApp reminder, with a UPI pay link when they owe you and your UPI ID is saved. */
export function udhaarMessage(p: UdhaarPerson, upi?: { id?: string; name?: string }): string {
  const lines = [`Hi ${p.name}, a quick note on our hisaab:`];
  for (const e of p.open) {
    lines.push(`- ${fmtDate(e.date)}: ${e.dir === 'lent' ? 'I lent you' : 'you lent me'} ${inr(e.amount)}${e.note ? ` (${e.note})` : ''}`);
  }
  if (p.net > 0) {
    lines.push('', `Total: ${inr(p.net)} to me. No rush, whenever it works for you 🙂`);
    if (upi?.id) lines.push(`UPI: ${upiLink(upi.id, upi.name, p.net)}`);
  } else if (p.net < 0) {
    lines.push('', `Total: I owe you ${inr(-p.net)}. Sending it soon.`);
  } else {
    lines.push('', 'It evens out, nothing to pay.');
  }
  lines.push('', 'Sent from Hisaab');
  return lines.join('\n');
}
