import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Card, CardType } from '../../lib/types';
import { KIND_LABEL } from '../../lib/types';
import { Sheet } from '../../ui/Sheet';
import { CardTile } from '../../ui/CardTile';
import { createCard, newCard } from '../../lib/actions';
import { useSettings } from '../../lib/hooks';
import { buildDraft } from './draft';

const EXAMPLES = ['bijli 2400 15th', 'rent 18k 5 tareekh', 'chai 40', 'PUC renew karna kal', 'SIP 3000 10 dec', 'idea: weekend trek'];
const TYPES: (CardType | null)[] = [null, 'note', 'task', 'bill', 'expense', 'invest'];

interface Props {
  open: boolean;
  /** Type chosen from the FAB fan (null = Auto). */
  preset: CardType | null;
  onClose: () => void;
  onAdded: (c: Card) => void;
}

/** Quick add sheet: type the way you talk, see the card before it's made. */
export function QuickAdd({ open, preset, onClose, onAdded }: Props) {
  const settings = useSettings();
  const reduce = useReducedMotion();
  const [text, setText] = useState('');
  const [forced, setForced] = useState<CardType | null>(preset);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pvRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) { setText(''); setForced(preset); setBusy(false); } }, [open, preset]);
  // The preview tile is a <button>; keep it out of the tab order and away from the pointer.
  useEffect(() => { pvRef.current?.setAttribute('inert', ''); });

  const draft = useMemo(() => buildDraft(text, forced), [text, forced]);
  const preview = useMemo(() => newCard(draft.partial), [draft]);

  const add = async () => {
    if (draft.empty || busy) return;
    setBusy(true);
    try {
      const c = await createCard(draft.partial);
      onClose();
      onAdded(c);
    } finally { setBusy(false); }
  };

  const title = preset ? `New ${KIND_LABEL[preset].toLowerCase()}` : 'Add anything';

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form className="home-qa" onSubmit={e => { e.preventDefault(); void add(); }}>
        <div className="field">
          <label htmlFor="home-qa-input">Type anything</label>
          <input
            id="home-qa-input"
            ref={inputRef}
            className="input"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="bijli 2400 15th"
            autoComplete="off"
            autoCapitalize="off"
            enterKeyHint="done"
            aria-describedby="home-qa-detect"
          />
        </div>

        <div className="home-qa-examples" role="group" aria-label="Examples">
          {EXAMPLES.map(x => (
            <button key={x} type="button" onClick={() => { setText(x); inputRef.current?.focus(); }}>{x}</button>
          ))}
        </div>

        <div className="chips home-qa-types" role="group" aria-label="Card type">
          {TYPES.map(t => (
            <button key={t ?? 'auto'} type="button" className="chip" aria-pressed={forced === t} onClick={() => setForced(t)}>
              {t ? KIND_LABEL[t] : 'Auto'}
            </button>
          ))}
        </div>

        <p id="home-qa-detect" className="home-qa-detect" aria-live="polite">
          {draft.empty ? 'Preview appears as you type.' : <>Will be added as: <b>{draft.summary}</b></>}
        </p>

        <div className="home-qa-preview" ref={pvRef} aria-hidden="true">
          <motion.div
            key={draft.empty ? 'empty' : draft.type}
            className={draft.empty ? 'home-ghost' : ''}
            initial={reduce || draft.empty ? false : { rotateY: 80, scale: 0.9, opacity: 0.3 }}
            animate={{ rotateY: 0, scale: 1, opacity: draft.empty ? 0.5 : 1 }}
            transition={{ duration: 0.3, ease: [0.2, 0.9, 0.3, 1.2] }}
          >
            <CardTile card={preview} settings={settings} />
          </motion.div>
        </div>

        <button type="submit" className="btn primary block" disabled={draft.empty || busy}>Add card</button>
      </form>
    </Sheet>
  );
}
