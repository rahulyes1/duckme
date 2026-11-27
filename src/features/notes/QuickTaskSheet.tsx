import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../../app-context';
import { createCard } from '../../lib/actions';
import { fmtDate } from '../../lib/format';
import type { Level } from '../../lib/types';
import { Sheet } from '../../ui/Sheet';
import { timeLabel } from '../plan/smart';
import { LevelChips } from './LevelChips';
import { parseTask, taskFields } from './quick-task';
import { ReminderNote } from './ReminderNote';

export function QuickTaskSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const [text, setText] = useState('');
  /** undefined = follow what you typed; { v } = you tapped a level. */
  const [picked, setPicked] = useState<{ v: Level | undefined }>();
  const [ignore, setIgnore] = useState({ day: false, time: false });
  useEffect(() => { if (open) { setText(''); setPicked(undefined); setIgnore({ day: false, time: false }); } }, [open]);

  const t = parseTask(text, new Date(), ignore);
  const level = picked ? picked.v : t.level;

  const add = async (full: boolean) => {
    if (!t.title && !full) return;
    const fields = taskFields({ ...t, level });
    onClose();
    if (full) { void app.createAndOpen(fields); return; }
    await createCard(fields);
    app.toast(`Added task: ${t.title}`);
  };

  return (
    <Sheet open={open} onClose={onClose} title="New task">
      <form className="qt" onSubmit={e => { e.preventDefault(); void add(false); }}>
        <label htmlFor="qt-text" className="sr-only">Task, with date, time or ! marks</label>
        <input id="qt-text" className="input" autoFocus autoComplete="off" enterKeyHint="done" value={text} placeholder="Submit tax proof tomorrow 6pm !!!" onChange={e => setText(e.target.value)} />
        <p className="qt-help">Type a date or time. Add ! , !! or !!! after a space for importance.</p>
        {(t.day || t.time) && (
          <div className="chips">
            {t.day && <button type="button" className="chip" aria-label={`Remove date ${fmtDate(t.day)}`} onClick={() => setIgnore({ day: true, time: true })}>{fmtDate(t.day)} <X size={14} aria-hidden="true" /></button>}
            {t.time && <button type="button" className="chip" aria-label={`Remove time ${timeLabel(t.time)}`} onClick={() => setIgnore(i => ({ ...i, time: true }))}>{timeLabel(t.time)} <X size={14} aria-hidden="true" /></button>}
          </div>
        )}
        <LevelChips card={{ level }} save={p => setPicked({ v: p.level })} />
        {t.time && <ReminderNote />}
        <button type="submit" className="btn primary block" disabled={!t.title}>Add task</button>
        <button type="button" className="btn ghost block" onClick={() => void add(true)}>Open full editor</button>
      </form>
    </Sheet>
  );
}
