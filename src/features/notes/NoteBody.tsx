import { useMemo, type KeyboardEvent, type MouseEvent } from 'react';
import { Check } from 'lucide-react';
import './notes.css';
import { parseNote, type Block, type Span } from './md-lite';
import { calcByLine, fmtCalc, type CalcResult } from './calc';
import { tileText } from './text-stats';

function Spans({ spans }: { spans: Span[] }) {
  return <>{spans.map((s, i) => (s.bold ? <strong key={i}>{s.text}</strong> : <span key={i}>{s.text}</span>))}</>;
}

const plain = (spans: Span[]) => spans.map(s => s.text).join('');

/**
 * The value of a calc line, shown after its text: "= ₹82,000" lines get the result in the accent colour,
 * variable lines ("sip = 5k") get their value faintly. Keyed by value so a new value fades in.
 */
const calcKey = (r?: CalcResult) => (r ? `${r.kind}${r.value}` : 'none');

function Calc({ r }: { r?: CalcResult }) {
  if (!r) return null;
  if (r.kind === 'result') return <span className="notes-calc is-result num">{fmtCalc(r.value)}</span>;
  if (r.literal) return null;
  return <span className="notes-calc is-var num">{fmtCalc(r.value)}</span>;
}

interface Props {
  text: string;
  /**
   * 'tile' (default): non-interactive, safe inside the CardTile <button>.
   * 'read': the editor's read view — checkboxes are tappable, tapping any other line asks to edit it.
   */
  variant?: 'tile' | 'read';
  /** read only: flip "[ ]" ↔ "[x]" on this source line. */
  onToggle?: (line: number) => void;
  /** read only: switch to editing with the caret at the end of this source line. */
  onEdit?: (line: number) => void;
  className?: string;
}

/**
 * Renders a note body written in markdown-lite (# heading, - bullet, [ ] / [x] checkbox, ---, **bold**)
 * as React elements. No HTML is ever injected. Only <span>s are used in the tile variant, so it is
 * valid inside a <button>.
 */
export function NoteBody({ text, variant = 'tile', onToggle, onEdit, className = '' }: Props) {
  // A tile only shows ~9 lines: parse just those, never the whole of a 10,000-word note.
  const clip = useMemo(() => (variant === 'tile' ? tileText(text) : { text, more: false }), [text, variant]);
  const blocks = useMemo(() => parseNote(clip.text), [clip.text]);
  const calc = useMemo(() => calcByLine(clip.text), [clip.text]);
  if (variant === 'tile') {
    // Trim trailing blank lines so the tile does not grow.
    let end = blocks.length;
    while (end && blocks[end - 1].kind === 'blank') end--;
    return (
      <>
        <span className={`body notes-md notes-md-tile ${clip.more ? 'is-more' : ''} ${className}`}>
          {blocks.slice(0, end).map(b => <TileLine key={b.line} b={b} c={calc.get(b.line)} />)}
        </span>
        {clip.more && <span className="notes-md-more" aria-hidden="true">…</span>}
      </>
    );
  }

  const lineOf = (e: MouseEvent | KeyboardEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-line]');
    return el ? Number(el.dataset.line) : blocks.length ? blocks[blocks.length - 1].line : 0;
  };
  return (
    <div
      className={`notes-md notes-md-read ${className}`}
      onClick={e => onEdit?.(lineOf(e))}
    >
      {blocks.map(b => <ReadLine key={b.line} b={b} c={calc.get(b.line)} onToggle={onToggle} />)}
    </div>
  );
}

function TileLine({ b, c }: { b: Block; c?: CalcResult }) {
  switch (b.kind) {
    case 'blank': return <span className="notes-md-gap" aria-hidden="true" />;
    case 'hr': return <span className="notes-md-hr" role="separator" />;
    case 'h': return <span className={`notes-md-h notes-md-h${b.level}`}><Spans spans={b.spans} /><Calc key={calcKey(c)} r={c} /></span>;
    case 'li': return <span className="notes-md-li"><span className="notes-md-dot" aria-hidden="true" /><span><Spans spans={b.spans} /><Calc key={calcKey(c)} r={c} /></span></span>;
    case 'todo': return (
      <span className={`notes-md-todo ${b.done ? 'is-done' : ''}`}>
        <span className="notes-md-tbox" aria-hidden="true">{b.done && <Check size={10} strokeWidth={3.5} />}</span>
        <span className="sr-only">{b.done ? 'Done: ' : 'To do: '}</span>
        <span className="notes-md-ttext"><Spans spans={b.spans} /><Calc key={calcKey(c)} r={c} /></span>
      </span>
    );
    case 'p': return <span className="notes-md-p"><Spans spans={b.spans} /><Calc key={calcKey(c)} r={c} /></span>;
  }
}

function ReadLine({ b, c, onToggle }: { b: Block; c?: CalcResult; onToggle?: (line: number) => void }) {
  switch (b.kind) {
    case 'blank': return <div className="notes-md-gap" data-line={b.line} aria-hidden="true" />;
    case 'hr': return <div className="notes-md-hr" data-line={b.line} role="separator" />;
    case 'h': {
      const H = b.level === 1 ? 'h3' : 'h4';
      return <H className={`notes-md-h notes-md-h${b.level}`} data-line={b.line}><Spans spans={b.spans} /><Calc key={calcKey(c)} r={c} /></H>;
    }
    case 'li': return <div className="notes-md-li" data-line={b.line}><span className="notes-md-dot" aria-hidden="true" /><span><Spans spans={b.spans} /><Calc key={calcKey(c)} r={c} /></span></div>;
    case 'todo': return (
      <div className={`notes-md-todo is-read ${b.done ? 'is-done' : ''}`} data-line={b.line}>
        <button
          type="button"
          role="checkbox"
          aria-checked={b.done}
          aria-label={`${b.done ? 'Untick' : 'Tick'} ${plain(b.spans) || 'item'}`}
          className="notes-md-cbtn"
          onClick={e => { e.stopPropagation(); onToggle?.(b.line); }}
        >
          <span className="notes-md-tbox" aria-hidden="true">{b.done && <Check size={14} strokeWidth={3.5} />}</span>
        </button>
        <span className="notes-md-ttext"><Spans spans={b.spans} /><Calc key={calcKey(c)} r={c} /></span>
      </div>
    );
    case 'p': return <p className="notes-md-p" data-line={b.line}><Spans spans={b.spans} /><Calc key={calcKey(c)} r={c} /></p>;
  }
}
