/** Note → shareable text (WhatsApp formatting or plain). Pure helpers. */
import type { ChecklistItem } from '../../lib/types';
import { inr } from '../../lib/format';
import { lineAmount } from '../../lib/parse';
import { parseNote, type Span } from './md-lite';
import { calcByLine, fmtCalc } from './calc';

export interface ShareSource {
  title: string;
  body: string;
  checklist?: ChecklistItem[];
}

type Style = 'whatsapp' | 'plain';

const spansText = (spans: Span[], style: Style) =>
  spans.map(s => (s.bold && style === 'whatsapp' ? `*${s.text.trim()}*` : s.text)).join('');

/**
 * Builds the text: *Title* (bold in WhatsApp), body with "☐ / ☑" checkboxes and "•" bullets,
 * calc results after their "=", checklist items, then a ₹ total when the list has amounts.
 */
export function noteToText(n: ShareSource, style: Style = 'whatsapp'): string {
  const out: string[] = [];
  const title = n.title.trim();
  if (title) out.push(style === 'whatsapp' ? `*${title}*` : title);

  let total = 0, open = 0, found = false;
  const count = (text: string, done: boolean) => {
    const a = lineAmount(text);
    if (a === null) return;
    found = true; total += a; if (!done) open += a;
  };

  const body = n.body ?? '';
  const calc = calcByLine(body);
  const bodyLines: string[] = [];
  for (const b of parseNote(body)) {
    const c = calc.get(b.line);
    const tail = c ? (c.kind === 'result' ? ` ${fmtCalc(c.value)}` : c.literal ? '' : ` (${fmtCalc(c.value)})`) : '';
    switch (b.kind) {
      case 'blank': bodyLines.push(''); break;
      case 'hr': bodyLines.push('———'); break;
      case 'h': {
        const t = spansText(b.spans, 'plain').trim();
        bodyLines.push((style === 'whatsapp' ? `*${t}*` : t) + tail);
        break;
      }
      case 'li': {
        const t = spansText(b.spans, style);
        bodyLines.push(`• ${t}${tail}`);
        if (!c) count(t, false);
        break;
      }
      case 'todo': {
        const t = spansText(b.spans, style);
        bodyLines.push(`${b.done ? '☑' : '☐'} ${t}${tail}`);
        if (!c) count(t, b.done);
        break;
      }
      case 'p': bodyLines.push(spansText(b.spans, style) + tail); break;
    }
  }
  while (bodyLines.length && !bodyLines[bodyLines.length - 1].trim()) bodyLines.pop();
  while (bodyLines.length && !bodyLines[0].trim()) bodyLines.shift();
  if (bodyLines.length) out.push(...bodyLines);

  const items = (n.checklist ?? []).filter(i => i.text.trim());
  if (items.length) {
    if (bodyLines.length) out.push('');
    for (const i of items) {
      out.push(`${i.done ? '☑' : '☐'} ${i.text.trim()}`);
      count(i.text, i.done);
    }
  }

  if (found) {
    const line = `Total ${inr(total)}${open !== total ? ` · ${inr(open)} left` : ''}`;
    out.push('', style === 'whatsapp' ? `*${line}*` : line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export const noteToWhatsApp = (n: ShareSource) => noteToText(n, 'whatsapp');
export const noteToPlain = (n: ShareSource) => noteToText(n, 'plain');

/** wa.me link that opens WhatsApp with the text ready to send (the user picks the chat). */
export const whatsAppLink = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
