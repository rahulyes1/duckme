import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject } from 'react';
import { CalendarDays, Bold, Calculator, CheckSquare, Heading, List, Minus } from 'lucide-react';
import { fmtDate, todayISO } from '../../lib/format';
import {
  applyCommand, continueList, filterCommands, slashQuery, toggleTodoLine, type Edit, type SlashId,
} from './md-lite';
import { NoteBody } from './NoteBody';
import { calcLines, fmtCalc } from './calc';

const CMD_ICON: Record<SlashId, typeof Bold> = {
  h: Heading, li: List, todo: CheckSquare, hr: Minus, date: CalendarDays, bold: Bold,
};

/** Pixel position of the caret inside a textarea (mirror-div technique). Relative to the textarea's box. */
function caretTop(el: HTMLTextAreaElement, pos: number): number {
  const cs = getComputedStyle(el);
  const div = document.createElement('div');
  const props = ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth',
    'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
    'letterSpacing', 'wordSpacing', 'tabSize', 'textTransform'] as const;
  for (const p of props) div.style[p] = cs[p];
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.overflowWrap = 'anywhere';
  div.style.top = '0';
  div.style.left = '-9999px';
  div.textContent = el.value.slice(0, pos);
  const mark = document.createElement('span');
  mark.textContent = '​';
  div.appendChild(mark);
  document.body.appendChild(div);
  const top = mark.offsetTop + mark.offsetHeight;
  div.remove();
  return top;
}

interface Slash { start: number; query: string; active: number; top: number }

interface Props {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  /** 'read' shows the rendered note; tapping a line switches to 'edit'. */
  mode: 'edit' | 'read';
  onMode: (m: 'edit' | 'read') => void;
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
}

/**
 * The note body. Always a plain <textarea> underneath (reliable typing, IME, autocorrect, undo), with:
 * "/" at line start → command menu; Enter on a list line → continues the list; a rendered read view.
 */
export function BodyEditor({ id, value, onChange, placeholder, label, mode, onMode, textareaRef }: Props) {
  const [slash, setSlash] = useState<Slash | null>(null);
  const selReq = useRef<{ s: number; e: number } | null>(null);
  const prev = useRef(value);
  prev.current = value;
  const listId = `${id}-cmds`;
  const results = useMemo(() => calcLines(value).filter(r => r.kind === 'result'), [value]);

  // auto-grow + apply a pending caret position after React wrote the new value
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    const r = selReq.current;
    if (r) {
      selReq.current = null;
      if (document.activeElement !== el) el.focus({ preventScroll: true });
      try { el.setSelectionRange(r.s, r.e); } catch { /* ignore */ }
    }
  }, [value, mode, textareaRef]);

  const commit = (ed: Edit) => {
    selReq.current = { s: ed.selStart, e: ed.selEnd };
    onChange(ed.value);
  };

  const cmds = slash ? filterCommands(slash.query) : [];

  const refreshSlash = (text: string, caret: number, el: HTMLTextAreaElement) => {
    const q = slashQuery(text, caret);
    if (!q || !filterCommands(q.query).length) { setSlash(null); return; }
    setSlash(s => ({ start: q.start, query: q.query, active: s && s.start === q.start ? Math.min(s.active, filterCommands(q.query).length - 1) : 0, top: caretTop(el, caret) }));
  };

  const pick = (cmdId: SlashId, text = value, caret?: number) => {
    const el = textareaRef.current;
    if (!slash || !el) return;
    const end = caret ?? slash.start + 1 + slash.query.length;
    setSlash(null);
    commit(applyCommand(text, slash.start, end, cmdId, fmtDate(todayISO())));
  };

  const onInput = (el: HTMLTextAreaElement) => {
    const next = el.value;
    const caret = el.selectionStart ?? next.length;
    const before = prev.current;
    // Phone keyboards may not send a usable Enter keydown: if a newline lands right after "/word"
    // while the menu is open, treat it as choosing the highlighted command.
    if (slash && cmds.length && next.length === before.length + 1 && next[caret - 1] === '\n'
      && caret - 1 === slash.start + 1 + slash.query.length) {
      pick(cmds[slash.active].id, before, caret - 1);
      return;
    }
    const cont = continueList(before, next, caret);
    if (cont) { setSlash(null); commit(cont); return; }
    onChange(next);
    refreshSlash(next, caret, el);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!slash || !cmds.length || e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setSlash({ ...slash, active: (slash.active + d + cmds.length) % cmds.length });
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pick(cmds[slash.active].id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setSlash(null);
    }
  };

  /** Read view → edit, caret at the end of the tapped line. */
  const editAt = (line: number) => {
    const lines = value.split('\n');
    const upto = lines.slice(0, Math.min(line, lines.length - 1) + 1).join('\n').length;
    selReq.current = { s: upto, e: upto };
    onMode('edit');
  };

  if (mode === 'read') {
    return (
      <section className="notes-mdx" aria-label={label}>
        <NoteBody text={value} variant="read" onToggle={l => onChange(toggleTodoLine(value, l))} onEdit={editAt} />
      </section>
    );
  }

  return (
    <div className="notes-mdx">
      <label htmlFor={id} className="sr-only">{label}</label>
      <textarea
        id={id}
        ref={textareaRef}
        className="notes-body"
        value={value}
        rows={3}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-controls={slash && cmds.length ? listId : undefined}
        aria-activedescendant={slash && cmds.length ? `${listId}-${cmds[slash.active].id}` : undefined}
        aria-describedby={`${id}-hint`}
        onChange={e => onInput(e.currentTarget)}
        onKeyDown={onKeyDown}
        onBlur={() => setSlash(null)}
        onSelect={e => {
          if (!slash) return;
          const el = e.currentTarget;
          if (!slashQuery(el.value, el.selectionStart ?? 0)) setSlash(null);
        }}
      />
      <span id={`${id}-hint`} className="sr-only">Type / at the start of a line for headings, lists, checkboxes, dividers, the date and bold. End a sum with = to see the total, like: rent + sip =</span>
      {results.length > 0 && (
        <section className="notes-calc-strip" aria-label="Calculations">
          <Calculator size={16} aria-hidden="true" className="notes-calc-ico" />
          <ul>
            {results.map(r => (
              <li key={r.line}>
                <span className="notes-calc-l">{r.label}</span>
                <span key={r.value} className="notes-calc is-result num">{fmtCalc(r.value)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {slash && cmds.length > 0 && (
        <ul id={listId} role="listbox" aria-label="Formatting" className="notes-slash" style={{ top: slash.top + 4 }}>
          {cmds.map((c, i) => {
            const I = CMD_ICON[c.id];
            return (
              <li
                key={c.id}
                id={`${listId}-${c.id}`}
                role="option"
                aria-selected={i === slash.active}
                className="notes-slash-opt"
                // keep the keyboard up: the textarea must not lose focus when a command is tapped
                onPointerDown={e => e.preventDefault()}
                onMouseDown={e => e.preventDefault()}
                onClick={() => pick(c.id)}
              >
                <I size={18} aria-hidden="true" />
                <span className="notes-slash-l">{c.label}</span>
                <span className="notes-slash-h" aria-hidden="true">{c.hint}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
