import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, defaultDropAnimationSideEffects,
  useDroppable, useSensor, useSensors,
  type Announcements, type DragEndEvent, type DragOverEvent, type DragStartEvent, type DropAnimation, type UniqueIdentifier,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, GripVertical, Inbox, MoreHorizontal, Plus } from 'lucide-react';
import type { Card, Quadrant } from '../../lib/types';
import { KIND_LABEL, QUADRANTS, isActive } from '../../lib/types';
import { useApp } from '../../app-context';
import { db } from '../../lib/db';
import { updateCard, withUndo } from '../../lib/actions';
import { byRank } from '../../lib/logic';
import { buzz, inr } from '../../lib/format';
import { DuePill, TYPE_ICON } from '../../ui/CardTile';
import { Sheet } from '../../ui/Sheet';
import { whenLabel } from '../../ui/WhenPicker';
import { reassignRanks } from './when';

/** A box on the board, or the Unsorted tray. */
type Col = Quadrant | 'none';
type Cols = Record<Col, string[]>;
const COLS: Col[] = ['do', 'schedule', 'quick', 'later', 'none'];
const BOX_ID = (c: Col) => `box:${c}`;
const COL_TITLE: Record<Col, string> = {
  do: 'Do now', schedule: 'Schedule', quick: 'Quick wins', later: 'Later / drop', none: 'Unsorted',
};

const titleOf = (c: Card) => c.title || c.body?.split(/\n/)[0]?.slice(0, 60) || c.checklist?.[0]?.text || 'Untitled';

/** Which cards the board shows: live tasks, bills and notes placed in a box; live tasks and bills not placed yet. */
function buildCols(cards: Card[]): Cols {
  const out: Cols = { do: [], schedule: [], quick: [], later: [], none: [] };
  for (const c of [...cards].sort(byRank)) {
    if (!isActive(c)) continue;
    if (c.quadrant && (c.type === 'task' || c.type === 'bill' || c.type === 'note')) out[c.quadrant].push(c.id);
    else if (!c.quadrant && (c.type === 'task' || c.type === 'bill')) out.none.push(c.id);
  }
  return out;
}

/** Saves a box's order (reusing its own rank numbers) and, when a card came from elsewhere, its new box. */
async function saveCol(col: Col, order: string[], moved: string | null, rankOf: (id: string) => number) {
  const ranks = reassignRanks(order, rankOf);
  return withUndo(async () => {
    await db.transaction('rw', db.cards, async () => {
      for (const [id, rank] of ranks) await db.cards.update(id, { rank, updatedAt: Date.now() });
    });
    if (moved) await updateCard(moved, { quadrant: col === 'none' ? undefined : col });
  });
}

/* ---------- row ---------- */

interface RowProps { card: Card; onMove: (id: string) => void }

function RowBody({ card: c }: { card: Card }) {
  const Icon = TYPE_ICON[c.type];
  return (
    <>
      <span className="plan-brow-t">
        <Icon size={15} aria-hidden="true" className="plan-brow-icon" />
        <span className="sr-only">{KIND_LABEL[c.type]}: </span>
        <span className="plan-brow-title">{titleOf(c)}</span>
      </span>
      {(c.due || c.when || c.status === 'delayed') && (
        <span className="pills plan-brow-pills">
          {c.status === 'delayed' && <span className="pill outline">Delayed</span>}
          {c.due && <DuePill due={c.due} />}
          {c.when && <span className="pill outline">{whenLabel(c.when)}</span>}
        </span>
      )}
    </>
  );
}

function BoardRow({ card: c, onMove }: RowProps) {
  const app = useApp();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: c.id });
  const style = { transform: CSS.Translate.toString(transform), transition };
  const title = titleOf(c);
  return (
    <li ref={setNodeRef} style={style} className={`plan-brow ${isDragging ? 'is-ghost' : ''}`} data-color={c.color}>
      {/* Drag starts ONLY from this handle; the rest of the row stays a plain tap target. */}
      <button type="button" ref={setActivatorNodeRef} className="plan-bgrip" {...attributes} {...listeners}
        aria-label={`Drag ${title}`}>
        <GripVertical size={18} aria-hidden="true" />
      </button>
      <button type="button" className="plan-bmain" onClick={e => app.openCard(c.id, e.currentTarget.closest('li'))}>
        <RowBody card={c} />
      </button>
      {!!c.amount && <span className="plan-bamt num">{inr(c.amount)}</span>}
      <button type="button" className="icon-btn plan-bmore" aria-label={`Move ${title} to another box`} onClick={() => onMove(c.id)}>
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
    </li>
  );
}

/** What follows the finger while dragging: lifted, slightly larger, with a deep shadow. */
function OverlayRow({ card: c }: { card: Card }) {
  return (
    <div className="plan-brow is-lifted" data-color={c.color}>
      <span className="plan-bgrip" aria-hidden="true"><GripVertical size={18} /></span>
      <span className="plan-bmain"><RowBody card={c} /></span>
      {!!c.amount && <span className="plan-bamt num">{inr(c.amount)}</span>}
      <span className="plan-bmore-ph" aria-hidden="true" />
    </div>
  );
}

/* ---------- box ---------- */

interface BoxProps {
  col: Col;
  ids: string[];
  byId: Map<string, Card>;
  onMove: (id: string) => void;
  hint?: string;
}

function BoxList({ col, ids, byId, onMove }: BoxProps) {
  const { setNodeRef, isOver } = useDroppable({ id: BOX_ID(col) });
  return (
    <SortableContext id={BOX_ID(col)} items={ids} strategy={verticalListSortingStrategy}>
      <ul ref={setNodeRef} className={`plan-blist ${isOver ? 'is-over' : ''}`} aria-label={`${COL_TITLE[col]} cards`}>
        {ids.map(id => { const c = byId.get(id); return c ? <BoardRow key={id} card={c} onMove={onMove} /> : null; })}
        {!ids.length && <li className="plan-bempty">{col === 'none' ? 'Everything is placed.' : 'Drop cards here'}</li>}
      </ul>
    </SortableContext>
  );
}

function Box(props: BoxProps) {
  const app = useApp();
  const { col, ids, hint } = props;
  const q = col as Quadrant;
  return (
    <section className="plan-box" data-q={col} aria-labelledby={`plan-box-${col}`}>
      <header className="plan-bhead">
        <div className="plan-btitle">
          <h2 id={`plan-box-${col}`}>{COL_TITLE[col]} <span className="plan-count num" aria-label={`${ids.length} cards`}>{ids.length}</span></h2>
          {hint && <p>{hint}</p>}
        </div>
        <button type="button" className="icon-btn plan-badd" aria-label={`Add a task to ${COL_TITLE[col]}`}
          onClick={e => void app.createAndOpen({ type: 'task', quadrant: q }, e.currentTarget)}>
          <Plus size={20} aria-hidden="true" />
        </button>
      </header>
      <BoxList {...props} />
    </section>
  );
}

/* ---------- board ---------- */

const dropAnimation: DropAnimation = {
  duration: 200,
  easing: 'cubic-bezier(.2,.8,.2,1)',
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.35' } } }),
};

export function Board({ cards }: { cards: Card[] }) {
  const app = useApp();
  const base = useMemo(() => buildCols(cards), [cards]);
  const byId = useMemo(() => new Map(cards.map(c => [c.id, c])), [cards]);
  const [cols, setCols] = useState<Cols | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(true);
  const origin = useRef<Col | null>(null);

  // Fresh data from the database replaces the optimistic order (but never mid-drag).
  useEffect(() => { if (!active) setCols(null); }, [cards]); // eslint-disable-line react-hooks/exhaustive-deps

  const view = cols ?? base;
  const rankOf = (id: string) => byId.get(id)?.rank ?? 0;

  const findCol = (id: UniqueIdentifier | undefined | null, from: Cols = view): Col | null => {
    if (id == null) return null;
    const s = String(id);
    if (s.startsWith('box:')) return s.slice(4) as Col;
    return COLS.find(k => from[k].includes(s)) ?? null;
  };

  const persist = (col: Col, order: string[], moved: string | null) => {
    saveCol(col, order, moved, rankOf)
      .then(undo => { if (moved) app.toast(`Moved to ${COL_TITLE[col]}`, undo); })
      .catch(() => { setCols(null); app.toast('Could not save that move.'); });
  };

  const moveTo = (id: string, to: Col) => {
    const from = findCol(id);
    setMoving(null);
    if (!from || from === to) return;
    const next: Cols = { ...view, [from]: view[from].filter(x => x !== id), [to]: [...view[to], id] };
    setCols(next);
    buzz(8);
    persist(to, next[to], id);
  };

  const onDragStart = ({ active: a }: DragStartEvent) => {
    setActive(String(a.id));
    setCols(view);
    origin.current = findCol(a.id);
    buzz(10);
  };

  const onDragOver = ({ active: a, over }: DragOverEvent) => {
    setCols(prev => {
      const cur = prev ?? view;
      const from = findCol(a.id, cur), to = findCol(over?.id, cur);
      if (!from || !to || from === to) return prev;
      const id = String(a.id);
      const target = cur[to].filter(x => x !== id);
      const overIdx = over && !String(over.id).startsWith('box:') ? target.indexOf(String(over.id)) : -1;
      const at = overIdx < 0 ? target.length : overIdx;
      target.splice(at, 0, id);
      return { ...cur, [from]: cur[from].filter(x => x !== id), [to]: target };
    });
  };

  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    const id = String(a.id);
    setActive(null);
    const cur = cols ?? view;
    const to = findCol(over?.id, cur);
    if (!to) { setCols(null); return; }
    let order = cur[to];
    const oi = order.indexOf(id), ni = over ? order.indexOf(String(over.id)) : -1;
    if (oi >= 0 && ni >= 0 && oi !== ni) order = arrayMove(order, oi, ni);
    setCols({ ...cur, [to]: order });
    const moved = origin.current !== to ? id : null;
    const changed = moved || order.some((x, i) => x !== base[to][i]) || order.length !== base[to].length;
    if (changed) persist(to, order, moved);
    else setCols(null);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const name = (id: UniqueIdentifier) => { const c = byId.get(String(id)); return c ? titleOf(c) : 'card'; };
  const announcements: Announcements = {
    onDragStart: ({ active: a }) => `Picked up ${name(a.id)}.`,
    onDragOver: ({ active: a, over }) => { const c = findCol(over?.id); return c ? `${name(a.id)} is over ${COL_TITLE[c]}.` : `${name(a.id)} is not over a box.`; },
    onDragEnd: ({ active: a, over }) => { const c = findCol(over?.id); return c ? `${name(a.id)} dropped in ${COL_TITLE[c]}.` : `${name(a.id)} dropped.`; },
    onDragCancel: ({ active: a }) => `Moving ${name(a.id)} cancelled.`,
  };

  const activeCard = active ? byId.get(active) : undefined;
  const movingCard = moving ? byId.get(moving) : undefined;
  const movingFrom = moving ? findCol(moving) : null;
  const unsorted = view.none;

  return (
    <section aria-label="4-box board" className="plan-board-wrap">
      <p className="plan-lead">Drag a card by its grip into a box, or tap its three-dot button to move it.</p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => { setActive(null); setCols(null); }}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: 'To pick up a card, press Space or Enter. Use the arrow keys to move it between boxes, Space or Enter to drop it, Escape to cancel. The Move button next to each card does the same without dragging.' },
        }}
      >
        <section className={`plan-tray ${trayOpen ? 'is-open' : ''}`} aria-labelledby="plan-tray-h">
          <h2 id="plan-tray-h" className="plan-tray-h">
            <button type="button" className="plan-tray-toggle" aria-expanded={trayOpen} aria-controls="plan-tray-body"
              onClick={() => setTrayOpen(o => !o)}>
              <Inbox size={18} aria-hidden="true" />
              <span>Unsorted</span>
              <span className="plan-count num" aria-label={`${unsorted.length} cards`}>{unsorted.length}</span>
              <span className="plan-tray-sub">Tasks and bills not in a box yet</span>
              <ChevronDown size={18} aria-hidden="true" className="plan-chev" />
            </button>
          </h2>
          {/* Kept mounted (hidden) so it stays a drop target id-wise; hidden boxes simply can't be hovered. */}
          <div id="plan-tray-body" hidden={!trayOpen}>
            <BoxList col="none" ids={unsorted} byId={byId} onMove={setMoving} />
          </div>
        </section>

        <div className="plan-board">
          {QUADRANTS.map(q => (
            <Box key={q.id} col={q.id} ids={view[q.id]} byId={byId} onMove={setMoving} hint={q.hint} />
          ))}
        </div>

        {/* Portalled so the fixed overlay isn't offset by the view's transform animation. */}
        {createPortal(
          <DragOverlay dropAnimation={dropAnimation} zIndex={60}>
            {activeCard ? <OverlayRow card={activeCard} /> : null}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>

      <Sheet open={!!movingCard} onClose={() => setMoving(null)} title={movingCard ? `Move "${titleOf(movingCard)}"` : 'Move'}>
        <ul className="plan-moveto" aria-label="Move to">
          {COLS.map(k => (
            <li key={k}>
              <button type="button" className="plan-moveto-btn" data-q={k} aria-current={movingFrom === k ? 'true' : undefined}
                onClick={() => moving && moveTo(moving, k)}>
                <b>{COL_TITLE[k]}</b>
                <span>{k === 'none' ? 'Take it off the board' : QUADRANTS.find(q => q.id === k)?.hint}</span>
                {movingFrom === k && <em>Here now</em>}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </section>
  );
}
