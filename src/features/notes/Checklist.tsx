import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, GripVertical, Plus, X } from 'lucide-react';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ChecklistItem } from '../../lib/types';
import { uid } from '../../lib/format';

/** Textarea that grows with its content (long text wraps, never clips). */
export function useAutoGrow(value: string) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return ref;
}

interface RowProps {
  item: ChecklistItem;
  sortable: boolean;
  register: (id: string, el: HTMLTextAreaElement | null) => void;
  onText: (text: string) => void;
  onToggle: () => void;
  onRemove: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (e: ClipboardEvent<HTMLTextAreaElement>) => void;
}

function ItemBody({ item, register, onText, onToggle, onRemove, onKeyDown, onPaste }: Omit<RowProps, 'sortable'>) {
  const ref = useAutoGrow(item.text);
  return (
    <>
      <label className="notes-check">
        <input type="checkbox" checked={item.done} onChange={onToggle} aria-label={`${item.done ? 'Untick' : 'Tick'} ${item.text || 'item'}`} />
        <span className="notes-box" aria-hidden="true">{item.done && <Check size={16} strokeWidth={3} />}</span>
      </label>
      <textarea
        ref={el => { ref.current = el; register(item.id, el); }}
        className={`notes-item-text ${item.done ? 'is-done' : ''}`}
        rows={1}
        value={item.text}
        aria-label="List item"
        placeholder="List item"
        onChange={e => onText(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      />
      <button type="button" className="icon-btn notes-item-x" aria-label={`Remove ${item.text || 'item'}`} onClick={onRemove}>
        <X size={18} aria-hidden="true" />
      </button>
    </>
  );
}

function SortableRow(props: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.item.id });
  return (
    <div
      ref={setNodeRef}
      className={`notes-item ${isDragging ? 'is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button type="button" className="icon-btn notes-handle" aria-label={`Drag to reorder ${props.item.text || 'item'}`} {...attributes} {...listeners}>
        <GripVertical size={18} aria-hidden="true" />
      </button>
      <ItemBody {...props} />
    </div>
  );
}

interface Props {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
  autoFocus?: boolean;
}

const LIST_T = { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] as const };

export function Checklist({ items, onChange, autoFocus }: Props) {
  const [showTicked, setShowTicked] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const refs = useRef(new Map<string, HTMLTextAreaElement>());
  const focusReq = useRef<{ id: string; at: number | 'end' } | null>(
    autoFocus ? (() => { const f = items.find(i => !i.done); return f ? { id: f.id, at: 'end' as const } : null; })() : null,
  );

  useEffect(() => {
    const f = focusReq.current;
    if (!f) return;
    const el = refs.current.get(f.id);
    if (!el) return;
    el.focus({ preventScroll: false });
    const p = f.at === 'end' ? el.value.length : f.at;
    try { el.setSelectionRange(p, p); } catch { /* ignore */ }
    focusReq.current = null;
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const open = items.filter(i => !i.done);
  const ticked = items.filter(i => i.done);
  const register = (id: string, el: HTMLTextAreaElement | null) => {
    if (el) refs.current.set(id, el); else refs.current.delete(id);
  };

  const setItem = (id: string, patch: Partial<ChecklistItem>) => onChange(items.map(i => (i.id === id ? { ...i, ...patch } : i)));

  const insertAfter = (afterId: string | null, texts: string[], focusAt: number | 'end' = 0) => {
    const fresh = texts.map(text => ({ id: uid(), text, done: false }));
    let idx: number;
    if (afterId) idx = items.findIndex(i => i.id === afterId) + 1;
    else {
      const lastOpen = open[open.length - 1];
      idx = lastOpen ? items.findIndex(i => i.id === lastOpen.id) + 1 : 0;
    }
    const next = [...items.slice(0, idx), ...fresh, ...items.slice(idx)];
    focusReq.current = { id: fresh[fresh.length - 1].id, at: focusAt };
    onChange(next);
  };

  const remove = (id: string, focusPrev: boolean) => {
    const list = items.find(i => i.id === id)?.done ? ticked : open;
    const pos = list.findIndex(i => i.id === id);
    const target = focusPrev ? (list[pos - 1] ?? list[pos + 1]) : null;
    if (target) focusReq.current = { id: target.id, at: 'end' };
    onChange(items.filter(i => i.id !== id));
  };

  const keyHandler = (item: ChecklistItem) => (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    const el = e.currentTarget;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (item.done) return;
      const caret = el.selectionStart ?? el.value.length;
      const before = el.value.slice(0, caret), after = el.value.slice(caret);
      const idx = items.findIndex(i => i.id === item.id) + 1;
      const fresh = { id: uid(), text: after, done: false };
      const next = [...items.slice(0, idx), fresh, ...items.slice(idx)].map(i => (i.id === item.id ? { ...i, text: before } : i));
      focusReq.current = { id: fresh.id, at: 0 };
      onChange(next);
    } else if (e.key === 'Backspace' && el.value === '' ) {
      e.preventDefault();
      remove(item.id, true);
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey) {
      const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
      const atEnd = el.selectionStart === el.value.length;
      const list = item.done ? ticked : open;
      const pos = list.findIndex(i => i.id === item.id);
      const t = e.key === 'ArrowUp' && atStart ? list[pos - 1] : e.key === 'ArrowDown' && atEnd ? list[pos + 1] : null;
      if (t) { e.preventDefault(); refs.current.get(t.id)?.focus(); }
    }
  };

  const pasteHandler = (item: ChecklistItem) => (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text');
    if (!text.includes('\n')) return;
    e.preventDefault();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const el = e.currentTarget;
    const caret = el.selectionStart ?? el.value.length;
    const first = el.value.slice(0, caret) + lines[0];
    const idx = items.findIndex(i => i.id === item.id) + 1;
    const fresh = lines.slice(1).map(t => ({ id: uid(), text: t, done: false }));
    const next = [...items.slice(0, idx), ...fresh, ...items.slice(idx)].map(i => (i.id === item.id ? { ...i, text: first } : i));
    focusReq.current = { id: (fresh[fresh.length - 1] ?? item).id, at: 'end' };
    onChange(next);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(false);
    setSettling(true);
    window.setTimeout(() => setSettling(false), 80);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = open.findIndex(i => i.id === active.id);
    const to = open.findIndex(i => i.id === over.id);
    if (from < 0 || to < 0) return;
    onChange([...arrayMove(open, from, to), ...ticked]);
  };

  const layoutOn = !dragging && !settling;
  const rowProps = (item: ChecklistItem) => ({
    item,
    register,
    onText: (text: string) => setItem(item.id, { text }),
    onToggle: () => setItem(item.id, { done: !item.done }),
    onRemove: () => remove(item.id, false),
    onKeyDown: keyHandler(item),
    onPaste: pasteHandler(item),
  });

  return (
    <div className="notes-cl">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => setDragging(true)}
        onDragCancel={() => setDragging(false)}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={open.map(i => i.id)} strategy={verticalListSortingStrategy}>
          <AnimatePresence initial={false}>
            {open.map(item => (
              <motion.div
                key={item.id}
                layout={layoutOn ? 'position' : false}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
                transition={LIST_T}
              >
                <SortableRow sortable {...rowProps(item)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </SortableContext>
      </DndContext>

      <button type="button" className="notes-add-item" onClick={() => insertAfter(null, [''])}>
        <Plus size={20} aria-hidden="true" /> List item
      </button>

      {ticked.length > 0 && (
        <motion.div layout={layoutOn ? 'position' : false} transition={LIST_T}>
          <button type="button" className="notes-ticked-toggle" aria-expanded={showTicked} onClick={() => setShowTicked(v => !v)}>
            <ChevronDown size={18} aria-hidden="true" className={showTicked ? '' : 'notes-rot'} />
            {ticked.length} ticked
          </button>
          <AnimatePresence initial={false}>
            {showTicked && ticked.map(item => (
              <motion.div
                key={item.id}
                layout={layoutOn ? 'position' : false}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                transition={LIST_T}
              >
                <div className="notes-item notes-item-ticked">
                  <span className="notes-handle-space" aria-hidden="true" />
                  <ItemBody {...rowProps(item)} />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
