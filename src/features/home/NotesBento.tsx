/**
 * Home → Notes: a rustic Bento grid of notes and tasks. Boxes size themselves from pin and content;
 * hold one to choose its size. Swipe actions stay (the Tracker | Notes switch is tap only).
 */
import { useRef, useState } from 'react';
import type { Card, Settings, TileSize } from '../../lib/types';
import { updateCard } from '../../lib/actions';
import { buzz } from '../../lib/format';
import { Sheet } from '../../ui/Sheet';
import { SwipeCard } from './SwipeCard';
import { tileSize } from './bento';

const SIZES: [TileSize | undefined, string][] = [[undefined, 'Auto'], ['small', 'Small'], ['wide', 'Wide'], ['tall', 'Tall'], ['big', 'Big']];

export function NotesBento({ cards, settings, isHidden, newId, onSwiped }: {
  cards: Card[]; settings: Settings; isHidden: (c: Card) => boolean; newId: string | null; onSwiped: () => void;
}) {
  const [sizing, setSizing] = useState<Card | null>(null);
  const press = useRef<{ t?: number; fired: boolean; x: number; y: number }>({ fired: false, x: 0, y: 0 });
  const cancel = () => clearTimeout(press.current.t);
  const firstPinned = cards.find(c => c.pinned)?.id;

  const hold = (c: Card) => ({
    onPointerDownCapture: (e: React.PointerEvent) => {
      cancel();
      press.current = { fired: false, x: e.clientX, y: e.clientY, t: window.setTimeout(() => { press.current.fired = true; buzz(20); setSizing(c); }, 550) };
    },
    onPointerMoveCapture: (e: React.PointerEvent) => { if (Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 10) cancel(); },
    onPointerUpCapture: cancel,
    onPointerCancelCapture: cancel,
    onClickCapture: (e: React.MouseEvent) => { if (press.current.fired) { press.current.fired = false; e.preventDefault(); e.stopPropagation(); } },
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); cancel(); setSizing(c); },
  });

  return (
    <>
      <div className="bento">
        {cards.map(c => (
          <div key={c.id} className={`bento-cell is-${tileSize(c, c.id === firstPinned)}`} {...hold(c)}>
            <SwipeCard card={c} settings={settings} hidden={isHidden(c)} isNew={c.id === newId} onSwiped={onSwiped} />
          </div>
        ))}
      </div>
      <Sheet open={!!sizing} onClose={() => setSizing(null)} title="Box size">
        <div className="chips" role="group" aria-label="Box size">
          {SIZES.map(([v, label]) => (
            <button key={label} type="button" className="chip" aria-pressed={sizing?.tile === v}
              onClick={() => { if (sizing) void updateCard(sizing.id, { tile: v }); setSizing(null); }}>{label}</button>
          ))}
        </div>
      </Sheet>
    </>
  );
}
