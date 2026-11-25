import { describe, expect, it } from 'vitest';
import {
  applyCommand, continueList, filterCommands, hasMarkup, inline, openTodos, parseNote, slashQuery, toggleTodoLine,
} from './md-lite';

describe('inline bold', () => {
  it('splits **bold** spans', () => {
    expect(inline('pay **rent** today')).toEqual([
      { text: 'pay ', bold: false }, { text: 'rent', bold: true }, { text: ' today', bold: false },
    ]);
  });
  it('keeps an unmatched ** as text', () => {
    expect(inline('2 ** 3')).toEqual([{ text: '2 ** 3', bold: false }]);
  });
  it('keeps **** literally', () => {
    expect(inline('a****b')).toEqual([{ text: 'a****b', bold: false }]);
  });
  it('handles several bold runs', () => {
    expect(inline('**a** and **b**').filter(s => s.bold).map(s => s.text)).toEqual(['a', 'b']);
  });
});

describe('parseNote', () => {
  it('parses every block kind with its source line', () => {
    const b = parseNote('# Title\n## Sub\n- milk\n* eggs\n[ ] call amma\n[x] paid rent\n---\n\nplain **bold**');
    expect(b.map(x => x.kind)).toEqual(['h', 'h', 'li', 'li', 'todo', 'todo', 'hr', 'blank', 'p']);
    expect(b[0]).toMatchObject({ kind: 'h', level: 1, line: 0 });
    expect(b[1]).toMatchObject({ kind: 'h', level: 2 });
    expect(b[4]).toMatchObject({ kind: 'todo', done: false, line: 4 });
    expect(b[5]).toMatchObject({ kind: 'todo', done: true });
    expect(b[8]).toMatchObject({ kind: 'p', line: 8 });
  });
  it('does not treat #tags, -5 or "---" as headings/bullets', () => {
    expect(parseNote('#tag\n-5 degrees\n---').map(x => x.kind)).toEqual(['p', 'p', 'hr']);
  });
  it('empty text gives no blocks', () => {
    expect(parseNote('')).toEqual([]);
  });
  it('hasMarkup is false for plain text and true for any markup', () => {
    expect(hasMarkup('just a note\nsecond line')).toBe(false);
    expect(hasMarkup('- a')).toBe(true);
    expect(hasMarkup('very **important**')).toBe(true);
  });
});

describe('toggleTodoLine', () => {
  it('ticks and unticks only the given line', () => {
    const t = 'a\n[ ] milk\n[x] eggs';
    expect(toggleTodoLine(t, 1)).toBe('a\n[x] milk\n[x] eggs');
    expect(toggleTodoLine(t, 2)).toBe('a\n[ ] milk\n[ ] eggs');
  });
  it('leaves non-checkbox lines alone', () => {
    expect(toggleTodoLine('a\nb', 1)).toBe('a\nb');
    expect(toggleTodoLine('a', 5)).toBe('a');
  });
  it('openTodos lists unticked items only', () => {
    expect(openTodos('[ ] milk\n[x] eggs\n- bread\n[ ] **call** bank\n[ ]   ')).toEqual(['milk', '**call** bank']);
  });
});

describe('continueList (Enter)', () => {
  const enter = (prev: string, at: number) => {
    const next = prev.slice(0, at) + '\n' + prev.slice(at);
    return continueList(prev, next, at + 1);
  };
  it('continues a bullet', () => {
    expect(enter('- milk', 6)).toEqual({ value: '- milk\n- ', selStart: 9, selEnd: 9 });
  });
  it('continues a checkbox as an unticked checkbox', () => {
    expect(enter('[x] milk', 8)?.value).toBe('[x] milk\n[ ] ');
  });
  it('numbers the next item', () => {
    expect(enter('1. one', 6)?.value).toBe('1. one\n2. ');
  });
  it('keeps indentation', () => {
    expect(enter('  - sub', 7)?.value).toBe('  - sub\n  - ');
  });
  it('Enter on an empty bullet ends the list', () => {
    expect(enter('- milk\n- ', 9)).toEqual({ value: '- milk\n', selStart: 7, selEnd: 7 });
  });
  it('does nothing on a plain line or for pasted text', () => {
    expect(enter('hello', 5)).toBeNull();
    expect(continueList('- a', '- a\nb', 5)).toBeNull();
  });
});

describe('slash commands', () => {
  it('detects "/" only at the start of a line', () => {
    expect(slashQuery('/', 1)).toEqual({ start: 0, query: '' });
    expect(slashQuery('abc\n/he', 7)).toEqual({ start: 4, query: 'he' });
    expect(slashQuery('a/b', 3)).toBeNull();
    expect(slashQuery('/a b', 4)).toBeNull();
  });
  it('filters by label and keywords', () => {
    expect(filterCommands('he').map(c => c.id)).toEqual(['h']);
    expect(filterCommands('to').map(c => c.id)).toContain('todo');
    expect(filterCommands('to').map(c => c.id)).toContain('date');
    expect(filterCommands('zzz')).toEqual([]);
  });
  it('inserts markdown in place of "/query"', () => {
    expect(applyCommand('x\n/he', 2, 5, 'h', '25-11-2026')).toEqual({ value: 'x\n# ', selStart: 4, selEnd: 4 });
    expect(applyCommand('/', 0, 1, 'todo', '').value).toBe('[ ] ');
    expect(applyCommand('/', 0, 1, 'li', '').value).toBe('- ');
    expect(applyCommand('/d', 0, 2, 'date', '25-11-2026').value).toBe('25-11-2026');
  });
  it('bold selects the placeholder word', () => {
    expect(applyCommand('/b', 0, 2, 'bold', '')).toEqual({ value: '**bold**', selStart: 2, selEnd: 6 });
  });
  it('divider adds a line break after it unless one follows', () => {
    expect(applyCommand('/', 0, 1, 'hr', '')).toEqual({ value: '---\n', selStart: 4, selEnd: 4 });
    expect(applyCommand('/\nnext', 0, 1, 'hr', '').value).toBe('---\nnext');
  });
});
