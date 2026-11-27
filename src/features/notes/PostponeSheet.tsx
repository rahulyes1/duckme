import { useApp } from '../../app-context';
import { updateCard } from '../../lib/actions';
import { fmtDate } from '../../lib/format';
import type { Card } from '../../lib/types';
import { Sheet } from '../../ui/Sheet';
import { timeLabel } from '../plan/smart';
import { laterChoices, laterPatch, type Later } from './postpone';
import { ReminderNote } from './ReminderNote';

export function PostponeSheet({ card, onClose }: { card: Card | null; onClose: () => void }) {
  const app = useApp();
  const pick = async (l: Later) => {
    if (!card) return;
    const before = { reminder: card.reminder, when: card.when, due: card.due };
    onClose();
    await updateCard(card.id, laterPatch(card, l));
    app.toast(`Postponed: ${l.label.toLowerCase()}`, async () => { await updateCard(card.id, before); });
  };
  return (
    <Sheet open={!!card} onClose={onClose} title="Postpone">
      <div className="later">
        {laterChoices(new Date()).map(l => (
          <button key={l.label} type="button" className="btn block later-btn" onClick={() => void pick(l)}>
            <b>{l.label}</b><small>{fmtDate(l.day)} · {timeLabel(l.time)}</small>
          </button>
        ))}
        <ReminderNote />
      </div>
    </Sheet>
  );
}
