import { useEffect, useMemo, useState, type KeyboardEvent as RKeyboardEvent } from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
  type Announcements, type DragEndEvent, type Modifier, type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ListOrdered } from 'lucide-react';
import type { Card, Settings } from '../../lib/types';
import { KIND_LABEL } from '../../lib/types';
import { useApp } from '../../app-context';
import { applyOrder } from '../../lib/actions';
import { buzz, inr, salarySide } from '../../lib/format';
import { DuePill, TYPE_ICON } from '../../ui/CardTile';
import { EmptyState, Switch } from '../../ui/bits';
import { isActive } from '../../lib/types';

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

import { byRank } from '../../lib/logic';

interface RowProps {
  card: Card;
  index: number;
  settings: Settings;
  popKey: number | null;
  onKeyMove: (id: string, delta: -1 | 1) => void;
}

function Row({ card: c, index, settings, popKey, onKeyMove }: RowProps) {
  const app = useApp();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: c.id });
  const style = {
    transform: CSS.Transform.toString(transform ? { ...transform, scaleX: isDragging ? 1.03 : 1, scaleY: isDragging ? 1.03 : 1 } : null),
    transition,
  };
  const Icon = TYPE_ICON[c.type];
  const title = c.title || c.body?.split(/\n/)[0]?.slice(0, 60) || c.checklist?.[0]?.text || 'Untitled';

  const onKeyDown = (e: RKeyboardEvent<HTMLButtonElement>) => {
    // Arrow keys move the row straight away (as in the mockup); Space/Enter still starts a dnd-kit keyboard drag.
    if (!isDragging && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      onKeyMove(c.id, e.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    (listeners?.onKeyDown as ((ev: RKeyboardEvent) => void) | undefined)?.(e);
  };

  return (
    <li ref={setNodeRef} style={style} className={`plan-row ${isDragging ? 'is-dragging' : ''}`} data-color={c.color}>
      <button
        type="button"
        ref={setActivatorNodeRef}
        className="plan-handle"
        data-handle={c.id}
        {...attributes}
        {...listeners}
        onKeyDown={onKeyDown}
        aria-label={`Reorder ${title}, position ${index + 1}. Arrow keys move it.`}
      >
        <GripVertical size={20} aria-hidden="true" />
      </button>
      <span key={popKey ?? 'n'} className={`plan-rnum num ${popKey ? 'is-pop' : ''}`} aria-hidden="true">{index + 1}</span>
      <button type="button" className="plan-main" onClick={e => app.openCard(c.id, e.currentTarget.closest('li'))}>
        <span className="plan-t">{title}</span>
        <span className="pills plan-pills">
          <span className="pill outline"><Icon size={11} aria-hidden="true" />{KIND_LABEL[c.type]}</span>
          {c.status === 'delayed' && <span className="pill outline">Delayed</span>}
          {c.due && <DuePill due={c.due} />}
          {c.type === 'bill' && c.due && <span className="pill hint">{salarySide(c.due, settings.salaryDay) === 'before' ? 'Before salary' : 'After salary'}</span>}
          {c.penalty && <span className="pill pen hint">{c.penalty}</span>}
        </span>
      </button>
      {!!c.amount && <span className="plan-ramt num">{inr(c.amount)}</span>}
    </li>
  );
}

export function MyOrder({ cards, settings }: { cards: Card[]; settings: Settings }) {
  const app = useApp();
  const [hints, setHints] = useState(true);
  const [optimistic, setOptimistic] = useState<string[] | null>(null);
  const [pop, setPop] = useState<{ id: string; n: number } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [said, setSaid] = useState('');

  const live = useMemo(() => cards.filter(c => isActive(c)).sort(byRank), [cards]);
  useEffect(() => { setOptimistic(null); }, [cards]);

  const list = useMemo(() => {
    if (!optimistic) return live;
    const m = new Map(live.map(c => [c.id, c]));
    const out = optimistic.map(id => m.get(id)).filter((c): c is Card => !!c);
    for (const c of live) if (!optimistic.includes(c.id)) out.push(c);
    return out;
  }, [live, optimistic]);
  const ids = list.map(c => c.id);
  const titleOf = (id: UniqueIdentifier) => list.find(c => c.id === id)?.title || 'Untitled';
  const posOf = (id: UniqueIdentifier) => ids.indexOf(String(id)) + 1;

  useEffect(() => {
    if (!focusId) return;
    const raf = requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-handle="${window.CSS.escape(focusId)}"]`)?.focus();
      setFocusId(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [focusId, list]);

  const commit = (next: string[], moved: string) => {
    setOptimistic(next);
    setPop({ id: moved, n: Date.now() });
    applyOrder(next).catch(() => { setOptimistic(null); app.toast('Could not save the new order.'); });
  };

  const onKeyMove = (id: string, delta: -1 | 1) => {
    const i = ids.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    commit(arrayMove(ids, i, j), id);
    setFocusId(id);
    setSaid(`${titleOf(id)} moved to position ${j + 1} of ${ids.length}.`);
    buzz(5);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id)), to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    commit(arrayMove(ids, from, to), String(active.id));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}, position ${posOf(active.id)} of ${ids.length}.`,
    onDragOver: ({ active, over }) => over ? `${titleOf(active.id)} is over position ${posOf(over.id)} of ${ids.length}.` : `${titleOf(active.id)} is not over a position.`,
    onDragEnd: ({ active, over }) => over ? `${titleOf(active.id)} dropped at position ${posOf(over.id)} of ${ids.length}.` : `${titleOf(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Moving ${titleOf(active.id)} cancelled.`,
  };

  if (!live.length) {
    return (
      <EmptyState
        icon={<ListOrdered size={40} aria-hidden="true" />}
        title="No cards to order yet"
        action={<button type="button" className="btn primary" onClick={() => app.go('home')}>Add one on Home</button>}
      >
        Every card you add shows up here. You decide what comes first, and Home follows this order.
      </EmptyState>
    );
  }

  return (
    <section aria-label="My order" className={hints ? '' : 'hide-hints'}>
      <div className="plan-note">
        <p>Drag to set your order. Home shows cards in exactly this order; dates and penalties never move them.</p>
        <Switch checked={hints} onChange={setHints} label="Hints" />
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[verticalOnly]}
        onDragStart={() => buzz(10)}
        onDragOver={() => buzz(5)}
        onDragEnd={onDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: 'To pick up a row, press Space or Enter. Use the arrow keys to move it, Space or Enter to drop it, Escape to cancel. Arrow keys alone also move the row one step.' },
        }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol className="plan-list">
            {list.map((c, i) => (
              <Row key={c.id} card={c} index={i} settings={settings} popKey={pop?.id === c.id ? pop.n : null} onKeyMove={onKeyMove} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <p className="sr-only" aria-live="polite">{said}</p>
    </section>
  );
}
