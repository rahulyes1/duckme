/** One tap to say how much a task or note matters. Higher ones sit on top. */
import type { Card } from '../../lib/types';
import { LEVELS } from './importance';

export function LevelChips({ card, save }: { card: Pick<Card, 'level'>; save: (p: Partial<Card>) => void }) {
  return (
    <div className="chips lvl-chips" role="radiogroup" aria-label="Importance">
      {LEVELS.map(l => (
        <button key={l.label} type="button" role="radio" className="chip" data-level={l.id ?? 0} aria-checked={card.level === l.id} onClick={() => save({ level: l.id })}>{l.label}</button>
      ))}
    </div>
  );
}
