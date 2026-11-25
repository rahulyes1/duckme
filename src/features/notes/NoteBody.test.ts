import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('./notes.css', () => ({}));
const { NoteBody } = await import('./NoteBody');

const html = (text: string, variant: 'tile' | 'read' = 'tile') => renderToStaticMarkup(createElement(NoteBody, { text, variant }));

describe('NoteBody renderer', () => {
  it('renders headings, bullets, checkboxes, dividers and bold', () => {
    const out = html('# Plan\n- milk\n[x] rent\n---\n**big** day');
    expect(out).toContain('notes-md-h1');
    expect(out).toContain('notes-md-li');
    expect(out).toContain('notes-md-todo is-done');
    expect(out).toContain('role="separator"');
    expect(out).toContain('<strong>big</strong>');
  });
  it('escapes HTML instead of injecting it', () => {
    const out = html('<img src=x onerror=alert(1)> **<b>x</b>**');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
    expect(out).toContain('<strong>&lt;b&gt;x&lt;/b&gt;</strong>');
  });
  it('tile variant has no interactive elements (it sits inside a button)', () => {
    const out = html('[ ] one\n[x] two\n- three');
    expect(out).not.toMatch(/<(button|a|input)\b/);
  });
  it('read variant makes checkboxes tappable with state', () => {
    const out = html('[ ] one\n[x] two', 'read');
    expect(out.match(/role="checkbox"/g)?.length).toBe(2);
    expect(out).toContain('aria-checked="false"');
    expect(out).toContain('aria-checked="true"');
  });
});
