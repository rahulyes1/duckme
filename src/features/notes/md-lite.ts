/**
 * Markdown-lite for note bodies. The note stays plain text (the textarea is the source of truth);
 * these pure helpers parse it for display and help the editor with lists and "/" commands.
 *
 * Supported: "# " / "## " headings, "- " / "* " bullets, "[ ] " / "[x] " checkboxes, "---" dividers, **bold**.
 */

export interface Span { text: string; bold: boolean }

export type Block =
  | { kind: 'h'; level: 1 | 2; spans: Span[]; line: number }
  | { kind: 'li'; spans: Span[]; line: number }
  | { kind: 'todo'; done: boolean; spans: Span[]; line: number }
  | { kind: 'hr'; line: number }
  | { kind: 'p'; spans: Span[]; line: number }
  | { kind: 'blank'; line: number };

const RE_H = /^(#{1,2})\s+(.*)$/;
const RE_LI = /^\s*[-*•]\s+(.*)$/;
const RE_TODO = /^\s*\[( |x|X)?\]\s?(.*)$/;
const RE_HR = /^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/;

/** "**bold** text" → spans. An unmatched "**" stays as literal text. */
export function inline(text: string): Span[] {
  const out: Span[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('**', i);
    if (open < 0) break;
    const close = text.indexOf('**', open + 2);
    if (close < 0) break;
    if (close === open + 2) { // "****" — nothing to bold; keep literally
      out.push({ text: text.slice(i, close + 2), bold: false });
      i = close + 2;
      continue;
    }
    if (open > i) out.push({ text: text.slice(i, open), bold: false });
    out.push({ text: text.slice(open + 2, close), bold: true });
    i = close + 2;
  }
  if (i < text.length) out.push({ text: text.slice(i), bold: false });
  // merge neighbouring plain spans
  return out.reduce<Span[]>((acc, s) => {
    const last = acc[acc.length - 1];
    if (last && !last.bold && !s.bold) last.text += s.text; else acc.push({ ...s });
    return acc;
  }, []);
}

/** Parses one line. Order matters: divider before bullet ("---" is not a bullet). */
function parseLine(raw: string, line: number): Block {
  if (!raw.trim()) return { kind: 'blank', line };
  if (RE_HR.test(raw)) return { kind: 'hr', line };
  const todo = raw.match(RE_TODO);
  if (todo) return { kind: 'todo', done: (todo[1] ?? ' ').toLowerCase() === 'x', spans: inline(todo[2]), line };
  const h = raw.match(RE_H);
  if (h) return { kind: 'h', level: h[1].length as 1 | 2, spans: inline(h[2]), line };
  const li = raw.match(RE_LI);
  if (li) return { kind: 'li', spans: inline(li[1]), line };
  return { kind: 'p', spans: inline(raw), line };
}

export function parseNote(text: string): Block[] {
  if (!text) return [];
  return text.replace(/\r\n?/g, '\n').split('\n').map(parseLine);
}

/** True when the text uses any markup worth rendering. */
export function hasMarkup(text: string): boolean {
  return parseNote(text).some(b => b.kind !== 'p' && b.kind !== 'blank' || (b.kind === 'p' && b.spans.some(s => s.bold)));
}

/** Flips "[ ]" ↔ "[x]" on one line. Other lines are untouched. */
export function toggleTodoLine(text: string, line: number): string {
  const lines = text.split('\n');
  const l = lines[line];
  if (l === undefined) return text;
  const m = l.match(/^(\s*)\[( |x|X)?\](.*)$/);
  if (!m) return text;
  const done = (m[2] ?? ' ').toLowerCase() === 'x';
  lines[line] = `${m[1]}[${done ? ' ' : 'x'}]${m[3]}`;
  return lines.join('\n');
}

/** Unticked "[ ] item" lines in a body. */
export function openTodos(text: string): string[] {
  return parseNote(text)
    .filter((b): b is Extract<Block, { kind: 'todo' }> => b.kind === 'todo' && !b.done)
    .map(b => b.spans.map(s => (s.bold ? `**${s.text}**` : s.text)).join('').trim())
    .filter(Boolean);
}

export interface Edit { value: string; selStart: number; selEnd: number }

const LIST_PREFIX = /^(\s*)(- |\* |• |\[ \] |\[[xX]\] |(\d+)\. )(.*)$/;

/**
 * Called after the textarea's value changed. If exactly one newline was just typed at `caret - 1`
 * and the line before it is a list line, continues the list ("- ", "[ ] ", "2. ").
 * Enter on an EMPTY list line ends the list: the marker is removed and no new line is added.
 * Returns null when nothing should change. Works from onChange, so it also works on phone
 * keyboards that do not send a usable Enter keydown.
 */
export function continueList(prev: string, next: string, caret: number): Edit | null {
  if (next.length !== prev.length + 1 || caret < 1 || next[caret - 1] !== '\n') return null;
  if (next.slice(0, caret - 1) + next.slice(caret) !== prev) return null;
  const lineStart = next.lastIndexOf('\n', caret - 2) + 1;
  const line = next.slice(lineStart, caret - 1);
  const m = line.match(LIST_PREFIX);
  if (!m) return null;
  const [, indent, marker, num, rest] = m;
  if (!rest.trim()) {
    // empty item: end the list — drop the marker and the newline just typed
    const value = next.slice(0, lineStart) + next.slice(caret);
    return { value, selStart: lineStart, selEnd: lineStart };
  }
  const nextMarker = num ? `${Number(num) + 1}. ` : marker.startsWith('[') ? '[ ] ' : marker;
  const ins = indent + nextMarker;
  const value = next.slice(0, caret) + ins + next.slice(caret);
  const p = caret + ins.length;
  return { value, selStart: p, selEnd: p };
}

// ---------------- "/" commands ----------------

export type SlashId = 'h' | 'li' | 'todo' | 'hr' | 'date' | 'bold';
export const SLASH_COMMANDS: { id: SlashId; label: string; hint: string; keys: string }[] = [
  { id: 'h', label: 'Heading', hint: '# ', keys: 'heading title h1' },
  { id: 'li', label: 'Bullet list', hint: '- ', keys: 'bullet list ul dash' },
  { id: 'todo', label: 'Checkbox', hint: '[ ] ', keys: 'checkbox todo task check' },
  { id: 'hr', label: 'Divider', hint: '---', keys: 'divider line hr rule' },
  { id: 'date', label: 'Date', hint: 'DD-MM-YYYY', keys: 'date today aaj' },
  { id: 'bold', label: 'Bold', hint: '**…**', keys: 'bold strong b' },
];

/** If the caret sits right after "/word" at the START of a line, returns where it starts and the word. */
export function slashQuery(text: string, caret: number): { start: number; query: string } | null {
  const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
  const before = text.slice(lineStart, caret);
  const m = before.match(/^\/([a-zA-Z0-9]{0,12})$/);
  if (!m) return null;
  return { start: lineStart, query: m[1].toLowerCase() };
}

export function filterCommands(query: string) {
  if (!query) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(c => c.label.toLowerCase().startsWith(query) || c.keys.split(' ').some(k => k.startsWith(query)));
}

/** Replaces "/query" (from `start` to `caret`) with the command's markup. `dateText` is the DD-MM-YYYY to insert. */
export function applyCommand(text: string, start: number, caret: number, id: SlashId, dateText: string): Edit {
  const head = text.slice(0, start), tail = text.slice(caret);
  const put = (ins: string, selFrom = ins.length, selTo = selFrom): Edit =>
    ({ value: head + ins + tail, selStart: start + selFrom, selEnd: start + selTo });
  switch (id) {
    case 'h': return put('# ');
    case 'li': return put('- ');
    case 'todo': return put('[ ] ');
    case 'date': return put(dateText);
    case 'bold': return put('**bold**', 2, 6);
    case 'hr': {
      const nl = tail.startsWith('\n') ? '' : '\n';
      return put(`---${nl}`, 3 + nl.length);
    }
  }
}
