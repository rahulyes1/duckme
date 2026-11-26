import { useMemo } from 'react';
import { CalendarClock, FileText, Gift, Plane, ShieldCheck, ShoppingBasket, Trash2, type LucideIcon } from 'lucide-react';
import './notes.css';
import { useApp } from '../../app-context';
import { useSettings } from '../../lib/hooks';
import { todayISO } from '../../lib/format';
import type { Card } from '../../lib/types';
import { Sheet } from '../../ui/Sheet';
import { deleteForeverWithUndo } from './notes-lib';
import { builtinTemplates, isTemplate, noteFromBuiltin, noteFromTemplate, type TemplateIcon } from './templates';

const ICON: Record<TemplateIcon, LucideIcon> = {
  month: CalendarClock, tax: FileText, trip: Plane, festival: Gift, grocery: ShoppingBasket, warranty: ShieldCheck,
};

/** "Templates" sheet from the Take-a-note bar: built-ins, then your own ("Yours"). Tapping one makes a note and opens it. */
export function TemplatesSheet({ open, onClose, cards, anchor }: {
  open: boolean; onClose: () => void; cards: Card[]; anchor?: Element | null;
}) {
  const app = useApp();
  const settings = useSettings();
  const builtins = useMemo(() => builtinTemplates(settings.salaryDay, todayISO()), [settings.salaryDay, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const yours = useMemo(
    () => cards.filter(c => isTemplate(c) && c.status !== 'trashed').sort((a, b) => b.updatedAt - a.updatedAt),
    [cards],
  );

  const make = async (partial: Parameters<typeof app.createAndOpen>[0]) => {
    onClose();
    try {
      await app.createAndOpen(partial, anchor ?? null);
    } catch {
      app.toast('Could not make the note. Try again.');
    }
  };

  const remove = async (t: Card) => {
    const undo = await deleteForeverWithUndo([t.id]);
    app.toast('Template deleted', undo);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Templates">
      <ul className="notes-tpl-grid" aria-label="Ready-made">
        {builtins.map(t => {
          const I = ICON[t.id];
          return (
            <li key={t.id}>
              <button type="button" className="notes-tpl" data-color={t.color} onClick={() => make(noteFromBuiltin(t))}>
                <span className="notes-tpl-ico" aria-hidden="true"><I size={20} /></span>
                <span className="notes-tpl-name">{t.name}</span>
                <span className="notes-tpl-hint">{t.hint}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <h3 className="sec-label notes-tpl-h">Yours</h3>
      {yours.length ? (
        <ul className="notes-menu notes-tpl-yours">
          {yours.map(t => (
            <li key={t.id} className="notes-tpl-row">
              <button type="button" className="notes-tpl-use" onClick={() => make(noteFromTemplate(t))}>
                <span className="notes-tpl-dot" data-color={t.color} aria-hidden="true" />
                <span className="notes-tpl-rowt">{t.title || 'Untitled template'}</span>
              </button>
              <button type="button" className="icon-btn" aria-label={`Delete template ${t.title || 'Untitled'}`} onClick={() => remove(t)}>
                <Trash2 size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="notes-muted">Open any note, tap More, then “Save as template” to keep it here.</p>
      )}
    </Sheet>
  );
}
