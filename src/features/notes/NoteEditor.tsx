import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { MotionConfig } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Archive, ArchiveRestore, ArrowLeft, Bell, BellOff, Check, CheckCircle2, CheckSquare, Copy, History, ImagePlus,
  BookOpen, BookmarkPlus, ClipboardCopy, Clock, IndianRupee, ListChecks, Lock, LockOpen, MessageCircle, MoreVertical, Palette, PenLine, Pin, PinOff, Receipt,
  Share2, StickyNote, Tag, Trash2, X,
} from 'lucide-react';
import { HomeButton } from '../../ui/HomeButton';
import './notes.css';
import { useApp } from '../../app-context';
import { db, getSettings, saveSettings } from '../../lib/db';
import {
  archive, convert, createCard, duplicate, getVersions, markDone, restore, restoreVersion, spawnFromNote, trash, updateCard,
} from '../../lib/actions';
import { useCard, useSettings } from '../../lib/hooks';
import { detectChips } from '../../lib/parse';
import { fmtDate, fromISO, inr, nextSalary, sha256, toISO } from '../../lib/format';
import type { Card, CardType, ChecklistItem, Horizon, Repeat, Version } from '../../lib/types';
import { HORIZON_LABEL, KIND_LABEL } from '../../lib/types';
import { Sheet } from '../../ui/Sheet';
import { ColorPicker } from '../../ui/bits';
import { TYPE_ICON, checklistTotal } from '../../ui/CardTile';
import { Checklist, useAutoGrow } from './Checklist';
import { PinPad } from './PinPad';
import { BodyEditor, LIVE_LIMIT } from './BodyEditor';
import { countWords, fmtWords } from './text-stats';
import { useDebounced } from './use-debounced';
import { PlanRow } from './PlanRow';
import { LevelChips } from './LevelChips';
import { PostponeSheet } from './PostponeSheet';
import { hasMarkup } from './md-lite';
import { calcLineTexts } from './calc';
import {
  CHIP_ACTION, mergeChecklistChips, chipCard, chipLabel, chipTitle, convertFill, deleteForeverWithUndo, emptyItem, itemsToText, readImages,
  relTime, textToItems,
} from './notes-lib';
import { isActive } from '../../lib/types';
import { noteToPlain, noteToWhatsApp, whatsAppLink } from './whatsapp';
import { isTemplate, templateFromNote } from './templates';

type SheetKind = null | 'more' | 'share' | 'labels' | 'reminder' | 'color' | 'pin' | 'versions';

const canNativeShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/** Clipboard write with a fallback for browsers without the async clipboard API. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall back below */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

const CHIP_ICON = { bill: Receipt, expense: IndianRupee, task: CheckSquare } as const;
const HORIZONS: Horizon[] = ['week', 'month', 'year', 'none'];
const REPEATS: { v: Repeat; l: string }[] = [
  { v: 'none', l: 'Does not repeat' }, { v: 'monthly', l: 'Every month' }, { v: 'quarterly', l: 'Every 3 months' }, { v: 'yearly', l: 'Every year' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const localStamp = (d: Date) => `${toISO(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtReminder = (r: string) => `${fmtDate(r.slice(0, 10))}, ${r.slice(11, 16)}`;

export default function NoteEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const card = useCard(id);
  const { isUnlocked } = useApp();
  if (!card) return <div className="editor-scroll" />;

  if (card.locked && !isUnlocked(id)) return <LockedGate card={card} onClose={onClose} />;
  return <EditorBody key={card.id} card={card} onClose={onClose} />;
}

function LockedGate({ card, onClose }: { card: Card; onClose: () => void }) {
  const { unlock } = useApp();
  // Wait for the real settings. useSettings() gives defaults (no PIN) for the first moment after a
  // reload, which used to open a locked note without asking for the PIN.
  const settings = useLiveQuery(() => getSettings(), []);
  useEffect(() => { if (settings && !settings.pinHash) unlock(card.id); }, [settings, card.id, unlock]);
  return (
    <div className="editor-scroll">
      <div className="editor-top">
        <span className="editor-lead">
          <button type="button" className="icon-btn" aria-label="Back" onClick={onClose}><ArrowLeft size={22} aria-hidden="true" /></button>
          <HomeButton />
        </span>
      </div>
      {settings?.pinHash && <PinPad pinHash={settings.pinHash} onUnlock={() => unlock(card.id)} />}
    </div>
  );
}

function EditorBody({ card, onClose }: { card: Card; onClose: () => void }) {
  const id = card.id;
  const app = useApp();
  const settings = useSettings();

  // ---- local draft for the text (saved with a debounce) ----
  const [title, setTitle] = useState(card.title);
  const [body, setBody] = useState(card.body);
  const [checklist, setChecklist] = useState<ChecklistItem[] | undefined>(card.checklist);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [laterOpen, setLaterOpen] = useState(false);
  const [, tick] = useState(0);
  const mounted = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const isNew = useRef(!card.title && !card.body && !(card.checklist?.some(i => i.text)) && Date.now() - card.createdAt < 5000);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const isJournal = !!card.journalDate;
  // Notes that use formatting open in the rendered read view; tapping any line goes straight to typing there.
  const [mode, setMode] = useState<'edit' | 'read'>(() => (!isNew.current && hasMarkup(card.body) ? 'read' : 'edit'));

  const pending = useRef<Partial<Card>>({});
  const timer = useRef<number>();
  // Every write goes through one queue. Before, two quick flushes could finish out of order
  // (the first one also writes a version snapshot) and the older text overwrote the newer one.
  const chain = useRef<Promise<void>>(Promise.resolve());
  const write = useCallback((patch: Partial<Card>) => {
    chain.current = chain.current.then(() => updateCard(id, patch)).catch(err => { console.error('Note save failed', err); });
    return chain.current;
  }, [id]);
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const p = pending.current;
    pending.current = {};
    if (Object.keys(p).length) await write(p);
    else await chain.current;
  }, [write]);
  const queue = (patch: Partial<Card>) => {
    Object.assign(pending.current, patch);
    clearTimeout(timer.current);
    // Long notes: a slightly longer pause, so a 10,000-word note is not rewritten on every word.
    // Closing, hiding the app and every action still flush straight away.
    const long = (patch.body?.length ?? 0) > LIVE_LIMIT;
    timer.current = window.setTimeout(() => { void flush(); }, long ? 800 : 300);
  };

  useEffect(() => {
    mounted.current = true;
    const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
    // pagehide can fire while visibilityState is still "visible" (iOS, bfcache): always flush there.
    const onPageHide = () => { void flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    const iv = window.setInterval(() => tick(n => n + 1), 30000);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      clearInterval(iv);
      void flush();
    };
  }, [flush]);

  useEffect(() => {
    if (isNew.current && (!card.checklist || isJournal)) bodyRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (patch: Partial<Card>) => { await flush(); await write(patch); };

  const onTitle = (v: string) => { setTitle(v); queue({ title: v }); };
  const onBody = (v: string) => { setBody(v); queue({ body: v }); };
  const onChecklist = (items: ChecklistItem[]) => { setChecklist(items); queue({ checklist: items }); };

  const fullText = useMemo(
    () => [title, body, ...(checklist ?? []).map(i => i.text)].filter(Boolean).join('\n'),
    [title, body, checklist],
  );
  // Smart chips and the word count scan the whole note: on a long note, only after a 250ms pause.
  const scanText = useDebounced(fullText, 250, fullText.length < LIVE_LIMIT);
  // Calc lines ("Rent 18000 + 2500 =") are sums, not bills: no ₹18,000 chip for them.
  const chips = useMemo(() => {
    const calc = calcLineTexts(scanText);
    const found = detectChips(scanText).filter(c => !calc.has(c.match));
    return mergeChecklistChips(found, (checklist ?? []).map(i => i.text), title);
  }, [scanText, checklist, title]);
  const words = useMemo(() => countWords(scanText), [scanText]);
  const total = checklist ? checklistTotal({ ...card, checklist }) : null;

  const linkKey = card.links.join(',');
  const linked = useLiveQuery(
    async () => (card.links.length ? (await db.cards.bulkGet(card.links)).filter((c): c is Card => !!c && c.status !== 'trashed') : []),
    [linkKey],
  ) ?? [];

  const isEmpty = () => !title.trim() && !body.trim() && !(checklist ?? []).some(i => i.text.trim()) && !card.images?.length;

  const close = async () => {
    await flush();
    if (card.type === 'note' && isEmpty() && !card.links.length) {
      onClose();
      await deleteForeverWithUndo([id]);
      app.toast('Empty note discarded');
      return;
    }
    onClose();
  };

  // ---- actions ----
  const toggleChecklist = () => {
    if (isJournal && !checklist) {
      // A journal keeps its writing; the list is added below it.
      const list = [emptyItem()];
      setChecklist(list);
      queue({ checklist: list });
      return;
    }
    if (checklist) {
      const text = itemsToText(checklist);
      const nextBody = body.trim() ? `${body.trimEnd()}\n${text}` : text;
      setChecklist(undefined); setBody(nextBody); setMode('edit');
      queue({ checklist: undefined, body: nextBody });
    } else {
      const items = textToItems(body);
      const list = items.length ? items : [emptyItem()];
      setChecklist(list); setBody('');
      queue({ checklist: list, body: '' });
    }
  };

  const addImages = async (files: FileList | null) => {
    const imgs = await readImages(files);
    if (fileRef.current) fileRef.current.value = '';
    if (!imgs.length) { app.toast('Could not read that image'); return; }
    const cur = (await db.cards.get(id))?.images ?? [];
    await save({ images: [...cur, ...imgs] });
  };

  const removeImage = async (i: number) => {
    const before = card.images ?? [];
    await save({ images: before.filter((_, k) => k !== i) });
    app.toast('Image removed', async () => { await updateCard(id, { images: before }); });
  };

  const togglePin = () => save({ pinned: !card.pinned });

  const toggleLock = async () => {
    if (card.locked) { await save({ locked: false }); app.toast('Lock removed', async () => { await save({ locked: true }); }); return; }
    if (!settings.pinHash) { setSheet('pin'); return; }
    app.unlock(id);
    await save({ locked: true });
    app.toast('Note locked. It needs your PIN next time you open the app.');
  };

  const doArchive = async () => {
    await flush();
    setSheet(null);
    if (card.status === 'archived') {
      const undo = await restore(id);
      app.toast('Note unarchived', undo);
      return;
    }
    const undo = await archive(id);
    onClose();
    app.toast('Note archived', undo);
  };

  const doTrash = async () => {
    await flush();
    setSheet(null);
    const undo = await trash(id);
    onClose();
    app.toast('Moved to trash', undo);
  };

  const doCopy = async () => {
    await flush();
    setSheet(null);
    const copy = await duplicate(id);
    if (copy) { app.openCard(copy.id); app.toast('Copy made'); }
  };

  const doConvert = async (type: CardType) => {
    await flush();
    setSheet(null);
    const undo = await convert(id, type, convertFill(fullText, type));
    app.toast(`Converted to ${KIND_LABEL[type].toLowerCase()}`, undo);
  };

  const doDone = async () => {
    await flush();
    const undo = await markDone(id);
    onClose();
    app.toast(card.repeat && card.repeat !== 'none' && card.due ? 'Done. Moved to next due date' : 'Task done', undo);
  };

  const spawn = async (i: number) => {
    const chip = chips[i];
    await flush();
    const created = await spawnFromNote(id, chipCard(chip));
    const what = chip.suggest === 'bill' ? 'Bill' : chip.suggest === 'expense' ? 'Expense' : 'Task';
    app.toast(`${what} created`, async () => {
      await db.cards.delete(created.id);
      const n = await db.cards.get(id);
      if (n) await db.cards.update(id, { links: n.links.filter(l => l !== created.id) });
    });
  };

  const openLinked = async (lid: string, el: Element) => { await flush(); app.openCard(lid, el); };

  const restoreV = async (v: Version) => {
    await flush();
    const before = { title, body, checklist };
    await restoreVersion(id, v);
    setTitle(v.title); setBody(v.body); setChecklist(v.checklist);
    setSheet(null);
    app.toast('Version restored', async () => {
      await updateCard(id, before);
      if (mounted.current) { setTitle(before.title); setBody(before.body); setChecklist(before.checklist); }
    });
  };

  const focusAfterTitle = () => {
    if (checklist && !isJournal) {
      document.querySelector<HTMLElement>('.editor .notes-item-text')?.focus();
      return;
    }
    // Focus straight away when the box is already there, so the next letter typed lands in the body, not the title.
    if (mode === 'edit' && bodyRef.current) { bodyRef.current.focus(); return; }
    setMode('edit');
    requestAnimationFrame(() => bodyRef.current?.focus());
  };

  // ---- share out ----
  const shareSrc = () => ({ title, body, checklist });
  const hasContent = !!(title.trim() || body.trim() || (checklist ?? []).some(i => i.text.trim()));
  const sendWhatsApp = () => {
    setSheet(null);
    if (!hasContent) { app.toast('Nothing to send yet'); return; }
    // Opened straight from the tap so pop-up blockers allow it.
    window.open(whatsAppLink(noteToWhatsApp(shareSrc())), '_blank', 'noopener,noreferrer');
  };
  const copyAsText = async () => {
    setSheet(null);
    if (!hasContent) { app.toast('Nothing to copy yet'); return; }
    app.toast((await copyText(noteToPlain(shareSrc()))) ? 'Copied as text' : 'Could not copy. Try again.');
  };
  const shareNative = async () => {
    setSheet(null);
    if (!hasContent) { app.toast('Nothing to share yet'); return; }
    try {
      await navigator.share({ title: title.trim() || undefined, text: noteToPlain(shareSrc()) });
    } catch { /* cancelled */ }
  };
  const saveAsTemplate = async () => {
    setSheet(null);
    if (!hasContent) { app.toast('Write something first, then save it as a template'); return; }
    await flush();
    const t = await createCard(templateFromNote({ title, body, checklist, color: card.color }));
    app.toast('Saved as a template. Find it under Templates.', async () => { await deleteForeverWithUndo([t.id]); });
  };

  const Icon = TYPE_ICON[card.type];
  const isTask = card.type === 'task';

  return (
    <MotionConfig reducedMotion="user">
      <div className="editor-scroll">
        <div className="editor-top">
          <span className="editor-lead">
            <button type="button" className="icon-btn" aria-label="Back" onClick={close}><ArrowLeft size={22} aria-hidden="true" /></button>
            <HomeButton />
          </span>
          <div className="notes-tools">
            <button type="button" className="icon-btn" aria-label="Pin note" aria-pressed={card.pinned} onClick={togglePin}>
              {card.pinned ? <PinOff size={20} aria-hidden="true" /> : <Pin size={20} aria-hidden="true" />}
            </button>
            <button type="button" className="icon-btn" aria-label={card.reminder ? `Reminder ${fmtReminder(card.reminder)}` : 'Add reminder'} onClick={() => setSheet('reminder')}>
              <Bell size={20} aria-hidden="true" />
            </button>
            <button type="button" className="icon-btn" aria-label="Lock note" aria-pressed={!!card.locked} onClick={toggleLock}>
              {card.locked ? <Lock size={20} aria-hidden="true" /> : <LockOpen size={20} aria-hidden="true" />}
            </button>
            <button type="button" className="icon-btn" aria-label="Share" aria-haspopup="dialog" onClick={() => setSheet('share')}>
              <Share2 size={20} aria-hidden="true" />
            </button>
            <button type="button" className="icon-btn" aria-label="More options" aria-haspopup="dialog" onClick={() => setSheet('more')}>
              <MoreVertical size={20} aria-hidden="true" />
            </button>
          </div>
        </div>

        {!!card.images?.length && (
          <div className={`notes-imgs ${card.images.length === 1 ? 'one' : ''}`}>
            {card.images.map((src, i) => (
              <figure key={i} className="notes-img">
                <img src={src} alt={`Image ${i + 1} in this note`} />
                <button type="button" className="icon-btn notes-img-x" aria-label={`Remove image ${i + 1}`} onClick={() => removeImage(i)}>
                  <X size={18} aria-hidden="true" />
                </button>
              </figure>
            ))}
          </div>
        )}

        {!isActive(card) && (
          <div className="notes-status"><Icon size={14} aria-hidden="true" /> {card.status === 'archived' ? 'In archive' : card.status === 'done' ? 'Done' : card.status === 'trashed' ? 'In trash' : 'Closed'}</div>
        )}

        {isJournal && (
          <p className="notes-journal-k">
            <BookOpen size={14} aria-hidden="true" /> Journal · {fromISO(card.journalDate!).toLocaleDateString('en-IN', { weekday: 'long' })}
          </p>
        )}
        <label htmlFor={`t-${id}`} className="sr-only">Title</label>
        <TitleInput id={`t-${id}`} value={title} onChange={onTitle} isTask={isTask} onEnter={focusAfterTitle} />

        {(!checklist || isJournal) && (
          <BodyEditor
            id={`b-${id}`}
            value={body}
            onChange={onBody}
            label={isTask ? 'Task details' : isJournal ? 'Journal' : 'Note'}
            placeholder={isJournal ? 'How did today go? Type / for headings, lists and checkboxes' : isTask ? 'Details' : 'Note  (type / for formatting)'}
            mode={mode}
            onMode={setMode}
            textareaRef={bodyRef}
          />
        )}
        {checklist && (
          <Checklist items={checklist} onChange={onChecklist} autoFocus={isNew.current && !isJournal} />
        )}

        {total && (
          <div className="notes-total num" aria-live="polite">
            Total {inr(total.total)}{total.open !== total.total && <span> · {inr(total.open)} left</span>}
          </div>
        )}

        {!!card.labels.length && (
          <div className="notes-labels">
            {card.labels.map(l => (
              <button key={l} type="button" className="notes-label" onClick={() => setSheet('labels')} aria-label={`Label ${l}, edit labels`}>
                <Tag size={13} aria-hidden="true" />{l}
              </button>
            ))}
          </div>
        )}
        {card.reminder && (
          <div className="notes-labels">
            <button type="button" className="notes-label" onClick={() => setSheet('reminder')}>
              <Bell size={13} aria-hidden="true" />{fmtReminder(card.reminder)}
            </button>
          </div>
        )}

        {!isJournal && isActive(card) && (card.type === 'note' || card.type === 'task') && <LevelChips card={card} save={p => { void save(p); }} />}
        {!isJournal && isActive(card) && card.type === 'task' && <button type="button" className="btn later-open" onClick={() => setLaterOpen(true)}><Clock size={16} aria-hidden="true" /> Postpone</button>}
        <PostponeSheet card={laterOpen ? card : null} onClose={() => setLaterOpen(false)} />
        {!isJournal && isActive(card) && <PlanRow card={card} save={save} />}

        {chips.length > 0 && (
          <section className="notes-smart" aria-label="Smart suggestions">
            {chips.map((chip, i) => {
              const done = linked.find(l => l.type === chip.suggest && l.title === chipTitle(chip));
              const CI = done ? Check : CHIP_ICON[chip.suggest];
              const lbl = chipLabel(chip, inr);
              return (
                <button
                  key={`${chip.match}-${i}`}
                  type="button"
                  className={`notes-smart-chip ${done ? 'is-done' : ''}`}
                  onClick={e => (done ? openLinked(done.id, e.currentTarget) : spawn(i))}
                >
                  <CI size={16} aria-hidden="true" />
                  <span>
                    {lbl && !chip.total && <span className="num">{lbl} </span>}
                    <b>{done ? `${KIND_LABEL[chip.suggest]} made, open` : chip.total ? `→ Add total ${inr(chip.amount ?? 0)} as expense` : `→ ${CHIP_ACTION[chip.suggest]}`}</b>
                  </span>
                </button>
              );
            })}
          </section>
        )}

        {isTask && <TaskFields card={card} save={save} onDone={doDone} />}

        {linked.length > 0 && (
          <section className="notes-linked" aria-labelledby={`lk-${id}`}>
            <h3 id={`lk-${id}`} className="sec-label">Linked cards</h3>
            {linked.map(l => {
              const LI = TYPE_ICON[l.type];
              return (
                <button key={l.id} type="button" className="notes-linked-row" onClick={e => openLinked(l.id, e.currentTarget)}>
                  <LI size={18} aria-hidden="true" />
                  <span className="notes-linked-t">{KIND_LABEL[l.type]}: {l.title || 'Untitled'}</span>
                  {l.amount ? <span className="num notes-linked-a">{inr(l.amount)}</span> : null}
                </button>
              );
            })}
          </section>
        )}

        <div className="notes-bar-space" aria-hidden="true" />
      </div>

      <div className="notes-bar">
        <button type="button" className="icon-btn" aria-label="Checklist" aria-pressed={!!checklist} onClick={toggleChecklist}>
          <ListChecks size={20} aria-hidden="true" />
        </button>
        <button type="button" className="icon-btn" aria-label="Add image" onClick={() => fileRef.current?.click()}>
          <ImagePlus size={20} aria-hidden="true" />
        </button>
        <button type="button" className="icon-btn" aria-label="Colour" onClick={() => setSheet('color')}>
          <Palette size={20} aria-hidden="true" />
        </button>
        <button type="button" className="icon-btn" aria-label="Labels" onClick={() => setSheet('labels')}>
          <Tag size={20} aria-hidden="true" />
        </button>
        {(!checklist || isJournal) && !!body.trim() && (
          <button type="button" className="icon-btn" aria-label={mode === 'read' ? 'Edit text' : 'Read view'} onClick={() => setMode(m => (m === 'read' ? 'edit' : 'read'))}>
            {mode === 'read' ? <PenLine size={20} aria-hidden="true" /> : <BookOpen size={20} aria-hidden="true" />}
          </button>
        )}
        <span className="notes-edited">
          Edited {relTime(card.updatedAt)}
          {words > 0 && <span className="notes-words num"><span className="sr-only">, </span>{fmtWords(words)}</span>}
        </span>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={e => addImages(e.target.files)} aria-label="Choose images" />
      </div>

      {/* ---- sheets ---- */}
      <Sheet open={sheet === 'more'} onClose={() => setSheet(null)} title="More">
        <ul className="notes-menu">
          <li><button type="button" onClick={() => setSheet('labels')}><Tag size={20} aria-hidden="true" />Labels</button></li>
          <li><button type="button" onClick={() => { setSheet(null); toggleChecklist(); }}><ListChecks size={20} aria-hidden="true" />{checklist ? 'Show as plain text' : 'Show as checklist'}</button></li>
          <li><button type="button" onClick={() => { setSheet(null); fileRef.current?.click(); }}><ImagePlus size={20} aria-hidden="true" />Add image</button></li>
          <li><button type="button" onClick={sendWhatsApp}><MessageCircle size={20} aria-hidden="true" />Send to WhatsApp</button></li>
          <li><button type="button" onClick={copyAsText}><ClipboardCopy size={20} aria-hidden="true" />Copy as text</button></li>
          <li><button type="button" onClick={doCopy}><Copy size={20} aria-hidden="true" />Make a copy</button></li>
          {card.type === 'note' && !isJournal && !isTemplate(card) && (
            <li><button type="button" onClick={saveAsTemplate}><BookmarkPlus size={20} aria-hidden="true" />Save as template</button></li>
          )}
          <li><button type="button" onClick={() => setSheet('versions')}><History size={20} aria-hidden="true" />Version history</button></li>
          {card.type === 'note'
            ? <li><button type="button" onClick={() => doConvert('task')}><CheckSquare size={20} aria-hidden="true" />Convert to task</button></li>
            : <li><button type="button" onClick={() => doConvert('note')}><StickyNote size={20} aria-hidden="true" />Convert to note</button></li>}
          <li><button type="button" onClick={() => doConvert('bill')}><Receipt size={20} aria-hidden="true" />Convert to bill</button></li>
          <li><button type="button" onClick={() => doConvert('expense')}><IndianRupee size={20} aria-hidden="true" />Convert to expense</button></li>
          <li><button type="button" onClick={doArchive}>
            {card.status === 'archived' ? <ArchiveRestore size={20} aria-hidden="true" /> : <Archive size={20} aria-hidden="true" />}
            {card.status === 'archived' ? 'Unarchive' : 'Archive'}
          </button></li>
          <li><button type="button" className="danger" onClick={doTrash}><Trash2 size={20} aria-hidden="true" />Move to trash</button></li>
        </ul>
      </Sheet>

      <Sheet open={sheet === 'share'} onClose={() => setSheet(null)} title="Share">
        <ul className="notes-menu">
          <li><button type="button" onClick={sendWhatsApp}><MessageCircle size={20} aria-hidden="true" />Send to WhatsApp</button></li>
          {canNativeShare() && (
            <li><button type="button" onClick={shareNative}><Share2 size={20} aria-hidden="true" />Share to another app</button></li>
          )}
          <li><button type="button" onClick={copyAsText}><ClipboardCopy size={20} aria-hidden="true" />Copy as text</button></li>
        </ul>
        <p className="notes-muted">Sends the title in bold, checkboxes as ☐ / ☑, sums with their results and the ₹ total.</p>
      </Sheet>

      <Sheet open={sheet === 'color'} onClose={() => setSheet(null)} title="Colour">
        <ColorPicker value={card.color} onChange={c => save({ color: c })} />
      </Sheet>

      <LabelsSheet open={sheet === 'labels'} onClose={() => setSheet(null)} card={card} allLabels={settings.labels} save={save} />
      <ReminderSheet open={sheet === 'reminder'} onClose={() => setSheet(null)} card={card} salaryDay={settings.salaryDay} save={save} />
      <PinSetupSheet
        open={sheet === 'pin'}
        onClose={() => setSheet(null)}
        onSet={async hash => {
          await saveSettings({ pinHash: hash });
          app.unlock(id);
          await save({ locked: true });
          setSheet(null);
          app.toast('PIN set. Note locked.');
        }}
      />
      <VersionsSheet open={sheet === 'versions'} onClose={() => setSheet(null)} cardId={id} onRestore={restoreV} />
    </MotionConfig>
  );
}

function TitleInput({ id, value, onChange, isTask, onEnter }: {
  id: string; value: string; onChange: (v: string) => void; isTask: boolean; onEnter: () => void;
}) {
  const ref = useAutoGrow(value);
  return (
    <textarea
      id={id}
      ref={ref}
      className="notes-title"
      rows={1}
      value={value}
      placeholder={isTask ? 'Task' : 'Title'}
      onChange={e => {
        const v = e.target.value;
        // A phone keyboard may insert the newline without a usable keydown: treat it as "next field".
        if (v.includes('\n')) { onChange(v.replace(/\r?\n/g, ' ').trimEnd()); onEnter(); return; }
        onChange(v);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          onEnter();
        }
      }}
    />
  );
}

// ---------------- task extras ----------------
function TaskFields({ card, save, onDone }: { card: Card; save: (p: Partial<Card>) => Promise<void>; onDone: () => void }) {
  const [penalty, setPenalty] = useState(card.penalty ?? '');
  const t = useRef<number>();
  const pendingPenalty = useRef<string | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const flushPenalty = () => {
    clearTimeout(t.current);
    const v = pendingPenalty.current;
    pendingPenalty.current = null;
    if (v !== null) void saveRef.current({ penalty: v.trim() || undefined });
  };
  // Closing the editor within 300ms of typing used to drop the penalty text. Flush instead of clearing.
  useEffect(() => () => flushPenalty(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const onPenalty = (v: string) => {
    setPenalty(v);
    pendingPenalty.current = v;
    clearTimeout(t.current);
    t.current = window.setTimeout(flushPenalty, 300);
  };
  return (
    <section className="notes-task" aria-label="Task details">
      <div className="field">
        <span className="label" id={`hz-${card.id}`}>When</span>
        <div className="notes-seg" role="radiogroup" aria-labelledby={`hz-${card.id}`}>
          {HORIZONS.map(h => (
            <button key={h} type="button" role="radio" aria-checked={card.horizon === h} className="notes-seg-btn" onClick={() => save({ horizon: h })}>
              {h === 'none' ? 'None' : HORIZON_LABEL[h]}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor={`dl-${card.id}`}>Deadline</label>
          <input id={`dl-${card.id}`} className="input" type="date" value={card.due ?? ''} onChange={e => save({ due: e.target.value || undefined })} />
        </div>
        <div className="field">
          <label htmlFor={`rp-${card.id}`}>Repeat</label>
          <select id={`rp-${card.id}`} className="select input" value={card.repeat ?? 'none'} onChange={e => save({ repeat: e.target.value as Repeat })}>
            {REPEATS.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor={`pn-${card.id}`}>Penalty if missed</label>
        <input id={`pn-${card.id}`} className="input" type="text" value={penalty} placeholder="e.g. Late fee ₹500" onChange={e => onPenalty(e.target.value)} onBlur={flushPenalty} />
        <span className="help">Shown on the card as a hint. It never changes the order.</span>
      </div>
      {isActive(card) && (
        <button type="button" className="btn primary block" onClick={onDone}>
          <CheckCircle2 size={20} aria-hidden="true" /> Mark done
        </button>
      )}
    </section>
  );
}

// ---------------- labels ----------------
function LabelsSheet({ open, onClose, card, allLabels, save }: {
  open: boolean; onClose: () => void; card: Card; allLabels: string[]; save: (p: Partial<Card>) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const all = useMemo(() => [...new Set([...allLabels, ...card.labels])].sort((a, b) => a.localeCompare(b)), [allLabels, card.labels]);

  const toggle = (l: string) => save({ labels: card.labels.includes(l) ? card.labels.filter(x => x !== l) : [...card.labels, l] });

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim().replace(/\s+/g, ' ');
    if (!n) { setErr('Type a label name.'); return; }
    if (n.length > 30) { setErr('Keep it under 30 letters.'); return; }
    const existing = all.find(l => l.toLowerCase() === n.toLowerCase());
    const label = existing ?? n;
    if (!allLabels.some(l => l.toLowerCase() === n.toLowerCase())) await saveSettings({ labels: [...allLabels, label] });
    if (!card.labels.includes(label)) await save({ labels: [...card.labels, label] });
    setName(''); setErr('');
  };

  return (
    <Sheet open={open} onClose={onClose} title="Labels">
      {all.length ? (
        <ul className="notes-menu" aria-label="Labels on this note">
          {all.map(l => (
            <li key={l}>
              <label className="notes-row">
                <span className="notes-check">
                  <input type="checkbox" checked={card.labels.includes(l)} onChange={() => toggle(l)} />
                  <span className="notes-box" aria-hidden="true">{card.labels.includes(l) && <Check size={16} strokeWidth={3} />}</span>
                </span>
                <span>{l}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : <p className="notes-muted">No labels yet. Make one below, like “Ghar” or “Office”.</p>}
      <form className="notes-newlabel" onSubmit={add}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor={`nl-${card.id}`}>New label</label>
          <input id={`nl-${card.id}`} className="input" value={name} maxLength={30} onChange={e => { setName(e.target.value); setErr(''); }}
            aria-invalid={!!err} aria-describedby={err ? `nle-${card.id}` : undefined} />
          {err && <span id={`nle-${card.id}`} className="err" role="alert">{err}</span>}
        </div>
        <button type="submit" className="btn primary">Add</button>
      </form>
      <button type="button" className="btn block" onClick={onClose}>Done</button>
    </Sheet>
  );
}

// ---------------- reminder ----------------
function ReminderSheet({ open, onClose, card, salaryDay, save }: {
  open: boolean; onClose: () => void; card: Card; salaryDay: number; save: (p: Partial<Card>) => Promise<void>;
}) {
  const app = useApp();
  // A new reminder starts at 9 am: today if that is still ahead, else tomorrow (never in the past).
  const defaultDate = () => {
    const d = new Date();
    if (d.getHours() >= 9) d.setDate(d.getDate() + 1);
    return toISO(d);
  };
  const [date, setDate] = useState(card.reminder?.slice(0, 10) ?? defaultDate());
  const [time, setTime] = useState(card.reminder?.slice(11, 16) ?? '09:00');
  const [err, setErr] = useState('');
  useEffect(() => {
    if (open) { setDate(card.reminder?.slice(0, 10) ?? defaultDate()); setTime(card.reminder?.slice(11, 16) ?? '09:00'); setErr(''); }
  }, [open, card.reminder]);

  const now = new Date();
  const picks: { label: string; at: Date }[] = [];
  const evening = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0);
  if (now < evening) picks.push({ label: 'Later today, 6 pm', at: evening });
  picks.push({ label: 'Tomorrow, 9 am', at: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0) });
  let sal = nextSalary(salaryDay);
  sal = new Date(sal.getFullYear(), sal.getMonth(), sal.getDate(), 9, 0);
  if (sal <= now) { const n2 = nextSalary(salaryDay, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)); sal = new Date(n2.getFullYear(), n2.getMonth(), n2.getDate(), 9, 0); }
  picks.push({ label: `Salary day (${fmtDate(toISO(sal))}), 9 am`, at: sal });

  const set = async (stamp: string) => {
    await save({ reminder: stamp });
    onClose();
    app.toast(`Reminder set for ${fmtReminder(stamp)}`);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!date || !time) return;
    const stamp = `${date}T${time}`;
    if (stamp <= localStamp(new Date())) { setErr('That time has already passed. Pick a later time.'); return; }
    void set(stamp);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Reminder">
      <div className="notes-picks">
        {picks.map(p => <button key={p.label} type="button" className="notes-pick" onClick={() => set(localStamp(p.at))}>{p.label}</button>)}
      </div>
      <form className="notes-form" onSubmit={submit}>
        <div className="row">
          <div className="field">
            <label htmlFor={`rd-${card.id}`}>Date</label>
            <input id={`rd-${card.id}`} className="input" type="date" required value={date} onChange={e => { setDate(e.target.value); setErr(''); }} />
          </div>
          <div className="field">
            <label htmlFor={`rt-${card.id}`}>Time</label>
            <input id={`rt-${card.id}`} className="input" type="time" required value={time} onChange={e => { setTime(e.target.value); setErr(''); }}
              aria-invalid={!!err} aria-describedby={err ? `rte-${card.id}` : undefined} />
          </div>
        </div>
        {err && <span id={`rte-${card.id}`} className="err" role="alert">{err}</span>}
        <p className="notes-muted">The reminder shows on the card. Phone notifications are not part of this version.</p>
        <button type="submit" className="btn primary block">Save reminder</button>
        {card.reminder && (
          <button type="button" className="btn danger block" onClick={async () => {
            const before = card.reminder;
            await save({ reminder: undefined });
            onClose();
            app.toast('Reminder removed', async () => { await updateCard(card.id, { reminder: before }); });
          }}>
            <BellOff size={18} aria-hidden="true" /> Remove reminder
          </button>
        )}
      </form>
    </Sheet>
  );
}

// ---------------- PIN setup ----------------
function PinSetupSheet({ open, onClose, onSet }: { open: boolean; onClose: () => void; onSet: (hash: string) => Promise<void> }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setA(''); setB(''); setErr(''); } }, [open]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{4,6}$/.test(a)) { setErr('PIN must be 4 to 6 digits.'); return; }
    if (a !== b) { setErr('The two PINs do not match.'); return; }
    await onSet(await sha256(a));
  };
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);
  return (
    <Sheet open={open} onClose={onClose} title="Set a PIN for locked notes">
      <form className="notes-form" onSubmit={submit}>
        <p className="notes-muted">You will use this PIN to open any locked note. It is stored only as a hash on this device. If you forget it, locked notes cannot be opened.</p>
        <div className="field">
          <label htmlFor="notes-pin-a">New PIN (4 to 6 digits)</label>
          <input id="notes-pin-a" className="input" type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="new-password" maxLength={6}
            value={a} onChange={e => { setA(digits(e.target.value)); setErr(''); }} />
        </div>
        <div className="field">
          <label htmlFor="notes-pin-b">Type it again</label>
          <input id="notes-pin-b" className="input" type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="new-password" maxLength={6}
            value={b} onChange={e => { setB(digits(e.target.value)); setErr(''); }}
            aria-invalid={!!err} aria-describedby={err ? 'notes-pin-err2' : undefined} />
          {err && <span id="notes-pin-err2" className="err" role="alert">{err}</span>}
        </div>
        <button type="submit" className="btn primary block"><Lock size={18} aria-hidden="true" /> Set PIN and lock</button>
      </form>
    </Sheet>
  );
}

// ---------------- versions ----------------
function VersionsSheet({ open, onClose, cardId, onRestore }: {
  open: boolean; onClose: () => void; cardId: string; onRestore: (v: Version) => void;
}) {
  const [list, setList] = useState<Version[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setList(null);
    getVersions(cardId).then(v => { if (live) setList(v); });
    return () => { live = false; };
  }, [open, cardId]);
  const preview = (v: Version) => {
    const t = v.checklist?.length ? v.checklist.map(i => i.text).filter(Boolean).join(', ') : v.body;
    return t.length > 140 ? `${t.slice(0, 140)}…` : t;
  };
  return (
    <Sheet open={open} onClose={onClose} title="Version history">
      {list === null ? <p className="notes-muted">Loading…</p> : list.length === 0 ? (
        <p className="notes-muted">No earlier versions yet. As you edit, a copy is saved at most every 2 minutes.</p>
      ) : (
        <ul className="notes-vers">
          {list.map(v => (
            <li key={v.id ?? v.at}>
              <div className="notes-ver-text">
                <span className="notes-ver-at">{new Date(v.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                {v.title && <b>{v.title}</b>}
                <span className="notes-ver-p">{preview(v) || 'Empty'}</span>
              </div>
              <button type="button" className="btn" onClick={() => onRestore(v)}>Restore</button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
