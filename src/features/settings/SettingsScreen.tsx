import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight, Check, Download, HardDriveDownload, Info, KeyRound, Monitor, Moon, Pencil, Smartphone, Sun, Tag, Trash2, Upload, X,
} from 'lucide-react';
import { useApp } from '../../app-context';
import { db, saveSettings } from '../../lib/db';
import { deleteEverything, exportAll } from '../../lib/actions';
import { useCards, useSettings } from '../../lib/hooks';
import { sha256, todayISO } from '../../lib/format';
import { removeSampleData, SAMPLE_LABEL } from '../../lib/seed';
import type { Card, Settings } from '../../lib/types';
import { useInstallPrompt } from './pwa';
import './settings.css';

const APP_VERSION = '0.1.0';
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const PIN_RE = /^\d{4,6}$/;

function Section({ id, title, icon, children }: { id: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="set-sec" aria-labelledby={id}>
      <h2 id={id} className="set-sec-title">{icon}{title}</h2>
      {children}
    </section>
  );
}

/* ---------------- theme ---------------- */
const THEMES: { v: Settings['theme']; label: string; Icon: typeof Sun }[] = [
  { v: 'system', label: 'System', Icon: Monitor },
  { v: 'light', label: 'Light', Icon: Sun },
  { v: 'dark', label: 'Dark', Icon: Moon },
];

function ThemePicker({ value }: { value: Settings['theme'] }) {
  return (
    <div className="set-seg" role="radiogroup" aria-label="Theme">
      {THEMES.map(({ v, label, Icon }) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className="set-seg-btn"
          onClick={() => saveSettings({ theme: v })}>
          <Icon size={18} aria-hidden="true" />{label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- PIN ---------------- */
function PinManager({ pinHash }: { pinHash?: string }) {
  const { toast } = useApp();
  const [mode, setMode] = useState<null | 'set' | 'change' | 'remove'>(null);
  const [cur, setCur] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [err, setErr] = useState('');

  const reset = () => { setMode(null); setCur(''); setPin(''); setPin2(''); setErr(''); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (mode !== 'set') {
      if (!cur || (await sha256(cur)) !== pinHash) { setErr('Current PIN is not right.'); return; }
    }
    if (mode === 'remove') {
      await saveSettings({ pinHash: undefined });
      reset();
      toast('PIN removed');
      return;
    }
    if (!PIN_RE.test(pin)) { setErr('PIN must be 4 to 6 digits.'); return; }
    if (pin !== pin2) { setErr('The two PINs do not match.'); return; }
    await saveSettings({ pinHash: await sha256(pin) });
    reset();
    toast(mode === 'set' ? 'PIN set' : 'PIN changed');
  };

  const pinInput = (id: string, label: string, v: string, set: (s: string) => void, auto?: boolean) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="input set-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={6}
        pattern="\d*" value={v} autoFocus={auto} onChange={e => set(e.target.value.replace(/\D/g, '').slice(0, 6))} />
    </div>
  );

  if (!mode) {
    return (
      <div className="set-stack">
        <p className="set-text">{pinHash
          ? 'A PIN is set. Locked notes ask for it before they open.'
          : 'Set a 4 to 6 digit PIN to lock private notes. It is stored only as a hash on this device.'}</p>
        <div className="set-btnrow">
          {pinHash ? (
            <>
              <button type="button" className="btn" onClick={() => setMode('change')}><KeyRound size={18} aria-hidden="true" />Change PIN</button>
              <button type="button" className="btn danger" onClick={() => setMode('remove')}>Remove PIN</button>
            </>
          ) : (
            <button type="button" className="btn primary" onClick={() => setMode('set')}><KeyRound size={18} aria-hidden="true" />Set PIN</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form className="set-stack set-panel" onSubmit={submit} noValidate>
      {mode !== 'set' && pinInput('pin-cur', 'Current PIN', cur, setCur, true)}
      {mode === 'remove' && <p className="set-text">Locked notes will open without a PIN after this.</p>}
      {mode !== 'remove' && (
        <div className="row">
          {pinInput('pin-new', mode === 'set' ? 'New PIN (4–6 digits)' : 'New PIN (4–6 digits)', pin, setPin, mode === 'set')}
          {pinInput('pin-new2', 'Type it again', pin2, setPin2)}
        </div>
      )}
      {err && <p className="set-err" role="alert">{err}</p>}
      <div className="set-btnrow">
        <button type="submit" className={`btn ${mode === 'remove' ? 'danger' : 'primary'}`}>
          {mode === 'set' ? 'Save PIN' : mode === 'change' ? 'Change PIN' : 'Remove PIN'}
        </button>
        <button type="button" className="btn ghost" onClick={reset}>Cancel</button>
      </div>
    </form>
  );
}

/* ---------------- labels ---------------- */
async function renameLabel(from: string, to: string, settings: Settings) {
  await db.transaction('rw', db.cards, db.settings, async () => {
    await db.cards.where('labels').equals(from).modify((c: Card) => {
      c.labels = [...new Set(c.labels.map(l => (l === from ? to : l)))];
      c.updatedAt = Date.now();
    });
    const labels = [...new Set(settings.labels.map(l => (l === from ? to : l)))];
    if (!labels.includes(to)) labels.push(to);
    await saveSettings({ labels });
  });
}

async function deleteLabel(name: string, settings: Settings) {
  await db.transaction('rw', db.cards, db.settings, async () => {
    await db.cards.where('labels').equals(name).modify((c: Card) => {
      c.labels = c.labels.filter(l => l !== name);
      c.updatedAt = Date.now();
    });
    await saveSettings({ labels: settings.labels.filter(l => l !== name) });
  });
}

function LabelRow({ name, count, settings, all }: { name: string; count: number; settings: Settings; all: string[] }) {
  const { toast } = useApp();
  const [mode, setMode] = useState<null | 'rename' | 'delete'>(null);
  const [val, setVal] = useState(name);
  const [err, setErr] = useState('');
  const inputId = `lbl-${name.replace(/\W+/g, '-')}`;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const to = val.trim();
    if (!to) { setErr('Label name cannot be empty.'); return; }
    if (to === name) { setMode(null); return; }
    await renameLabel(name, to, settings);
    toast(all.includes(to) ? `Merged “${name}” into “${to}”` : `Renamed to “${to}”`);
    setMode(null);
  };

  if (mode === 'rename') {
    return (
      <li className="set-lbl">
        <form className="set-lbl-edit" onSubmit={save}>
          <label htmlFor={inputId} className="sr-only">New name for {name}</label>
          <input id={inputId} className="input" value={val} autoFocus maxLength={40} onChange={e => { setVal(e.target.value); setErr(''); }} />
          <button type="submit" className="icon-btn" aria-label="Save name"><Check size={20} aria-hidden="true" /></button>
          <button type="button" className="icon-btn" aria-label="Cancel rename" onClick={() => { setMode(null); setVal(name); setErr(''); }}><X size={20} aria-hidden="true" /></button>
        </form>
        {err && <p className="set-err" role="alert">{err}</p>}
      </li>
    );
  }

  if (mode === 'delete') {
    return (
      <li className="set-lbl set-confirm" role="group" aria-label={`Delete label ${name}`}>
        <span className="set-text">Delete “{name}”? It is removed from {count} {count === 1 ? 'card' : 'cards'}. The cards stay.</span>
        <div className="set-btnrow">
          <button type="button" className="btn danger" onClick={async () => { await deleteLabel(name, settings); toast(`Label “${name}” deleted`); }}>Delete label</button>
          <button type="button" className="btn ghost" onClick={() => setMode(null)}>Cancel</button>
        </div>
      </li>
    );
  }

  return (
    <li className="set-lbl">
      <Tag size={16} aria-hidden="true" className="set-muted" />
      <span className="set-lbl-name">{name}</span>
      <span className="set-lbl-count num">{count} {count === 1 ? 'card' : 'cards'}</span>
      <button type="button" className="icon-btn" aria-label={`Rename ${name}`} onClick={() => setMode('rename')}><Pencil size={18} aria-hidden="true" /></button>
      <button type="button" className="icon-btn set-danger-ico" aria-label={`Delete ${name}`} onClick={() => setMode('delete')}><Trash2 size={18} aria-hidden="true" /></button>
    </li>
  );
}

function LabelsManager({ settings, cards }: { settings: Settings; cards: Card[] }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of settings.labels) m.set(l, 0);
    for (const c of cards) if (c.status !== 'trashed') for (const l of c.labels) m.set(l, (m.get(l) ?? 0) + 1);
    return m;
  }, [settings.labels, cards]);
  const names = [...counts.keys()].sort((a, b) => a.localeCompare(b));
  if (!names.length) return <p className="set-text">No labels yet. Add labels from a note’s menu and manage them here.</p>;
  return (
    <ul className="set-lbls">
      {names.map(n => <LabelRow key={n} name={n} count={counts.get(n) ?? 0} settings={settings} all={names} />)}
    </ul>
  );
}

/* ---------------- your data ---------------- */
function isCardLike(x: unknown): x is Card {
  const c = x as Card;
  return !!c && typeof c === 'object' && typeof c.id === 'string' && typeof c.type === 'string' && typeof c.title === 'string';
}

function YourData({ cards, settings }: { cards: Card[]; settings: Settings }) {
  const { toast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importErr, setImportErr] = useState('');
  const [confirmSample, setConfirmSample] = useState(false);
  const [wipe, setWipe] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const live = cards.filter(c => c.status !== 'trashed');
  const count = (t: Card['type']) => live.filter(c => c.type === t).length;
  const sampleCount = cards.filter(c => c.labels.includes(SAMPLE_LABEL)).length;
  const stats: [string, number][] = [
    ['Cards', live.length], ['Notes', count('note')], ['Tasks', count('task')], ['Bills', count('bill')],
    ['Expenses', count('expense')], ['Investments', count('invest')], ['In trash', cards.length - live.length],
  ];

  const doExport = async () => {
    const json = await exportAll();
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `hisaab-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Export saved');
  };

  const doImport = async (file: File) => {
    setImportErr('');
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.app !== 'hisaab' || !Array.isArray(data.cards)) {
        setImportErr('This file is not a Hisaab export.');
        return;
      }
      const incoming = (data.cards as unknown[]).filter(isCardLike).map(c => ({
        ...c, labels: Array.isArray(c.labels) ? c.labels : [], links: Array.isArray(c.links) ? c.links : [],
      }));
      await db.cards.bulkPut(incoming);
      const labels = new Set(settings.labels);
      for (const l of (Array.isArray(data.settings?.labels) ? data.settings.labels : [])) if (typeof l === 'string') labels.add(l);
      for (const c of incoming) c.labels.forEach(l => labels.add(l));
      const budgets = { ...(data.settings?.budgets && typeof data.settings.budgets === 'object' ? data.settings.budgets : {}), ...settings.budgets };
      await saveSettings({ labels: [...labels], budgets });
      toast(`Imported ${incoming.length} ${incoming.length === 1 ? 'card' : 'cards'}`);
    } catch {
      setImportErr('Could not read this file. Pick a .json file exported from Hisaab.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doWipe = async () => {
    setBusy(true);
    await deleteEverything();
    location.hash = '';
    location.reload();
  };

  return (
    <div className="set-stack">
      <dl className="set-stats">
        {stats.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>)}
      </dl>
      <p className="set-text">Everything lives in this browser on this device. Export a copy now and then, especially before clearing browser data.</p>

      <div className="set-btnrow">
        <button type="button" className="btn primary" onClick={doExport}><Download size={18} aria-hidden="true" />Export JSON</button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Upload size={18} aria-hidden="true" />Import JSON</button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden="true"
          onChange={e => { const f = e.target.files?.[0]; if (f) doImport(f); }} />
      </div>
      <p className="set-small">Import merges cards by id: matching cards are replaced, new ones are added. Nothing is deleted.</p>
      {importErr && <p className="set-err" role="alert">{importErr}</p>}

      {sampleCount > 0 && (
        confirmSample ? (
          <div className="set-confirm" role="group" aria-label="Remove sample data">
            <span className="set-text">Remove {sampleCount} sample {sampleCount === 1 ? 'card' : 'cards'}? Cards you made stay.</span>
            <div className="set-btnrow">
              <button type="button" className="btn danger" onClick={async () => {
                const n = await removeSampleData(); setConfirmSample(false); toast(`Removed ${n} sample cards`);
              }}>Remove sample cards</button>
              <button type="button" className="btn ghost" onClick={() => setConfirmSample(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="set-btnrow">
            <button type="button" className="btn" onClick={() => setConfirmSample(true)}>Remove sample data ({sampleCount})</button>
          </div>
        )
      )}

      <div className="set-danger-zone">
        <h3 className="set-danger-title">Delete everything</h3>
        <p className="set-text">Removes every card, note history and setting from this device. This cannot be undone. Export first if you may need it.</p>
        {wipe ? (
          <form className="set-stack" onSubmit={e => { e.preventDefault(); if (typed === 'DELETE') doWipe(); }}>
            <div className="field">
              <label htmlFor="wipe-confirm">Type DELETE to confirm</label>
              <input id="wipe-confirm" className="input" value={typed} autoFocus autoComplete="off" autoCapitalize="characters"
                spellCheck={false} onChange={e => setTyped(e.target.value)} />
            </div>
            <div className="set-btnrow">
              <button type="submit" className="btn set-btn-danger" disabled={typed !== 'DELETE' || busy}>
                <Trash2 size={18} aria-hidden="true" />{busy ? 'Deleting…' : 'Delete everything'}
              </button>
              <button type="button" className="btn ghost" onClick={() => { setWipe(false); setTyped(''); }}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className="set-btnrow">
            <button type="button" className="btn danger" onClick={() => setWipe(true)}><Trash2 size={18} aria-hidden="true" />Delete everything…</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- screen ---------------- */
export default function SettingsScreen() {
  const { go, toast } = useApp();
  const settings = useSettings();
  const cards = useCards() ?? [];
  const { canInstall, install } = useInstallPrompt();

  return (
    <div className="screen set-screen">
      <header className="topbar"><div className="topbar-row"><h1 className="screen-title">More</h1></div></header>

      {canInstall && (
        <div className="set-install">
          <Smartphone size={22} aria-hidden="true" />
          <span className="set-text">Install Hisaab to open it like an app, even offline.</span>
          <button type="button" className="btn primary" onClick={async () => { if (await install()) toast('Installed'); }}>
            <HardDriveDownload size={18} aria-hidden="true" />Install app
          </button>
        </div>
      )}

      <Section id="set-general" title="General" icon={null}>
        <div className="field">
          <label htmlFor="set-salary">Salary day</label>
          <select id="set-salary" className="select set-narrow" value={settings.salaryDay}
            onChange={e => saveSettings({ salaryDay: +e.target.value })}>
            {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <span className="help">Used for the before/after salary split. If a month is shorter, the last day is used.</span>
        </div>
        <div className="field">
          <span className="label" id="delay-lbl">Swipe left delays by</span>
          <div className="set-seg" role="radiogroup" aria-labelledby="delay-lbl">
            {([[7, '1 week'], [1, '1 day']] as const).map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={(settings.delayDays ?? 7) === v} className="set-seg-btn"
                onClick={() => saveSettings({ delayDays: v })}>
                {label}
              </button>
            ))}
          </div>
          <span className="help">Delay moves the due date and marks the card Delayed. It never changes your order.</span>
        </div>
        <div className="field">
          <span className="label" id="theme-lbl">Theme</span>
          <ThemePicker value={settings.theme} />
        </div>
        <button type="button" className="set-link" onClick={() => go('money')}>
          Set monthly budgets in Money <ArrowRight size={18} aria-hidden="true" />
        </button>
      </Section>

      <Section id="set-pin" title="Lock PIN" icon={<KeyRound size={18} aria-hidden="true" />}>
        <PinManager pinHash={settings.pinHash} />
      </Section>

      <Section id="set-labels" title="Labels" icon={<Tag size={18} aria-hidden="true" />}>
        <LabelsManager settings={settings} cards={cards} />
      </Section>

      <Section id="set-data" title="Your data" icon={<HardDriveDownload size={18} aria-hidden="true" />}>
        <YourData cards={cards} settings={settings} />
      </Section>

      <Section id="set-about" title="About" icon={<Info size={18} aria-hidden="true" />}>
        <dl className="set-about">
          <div><dt>Version</dt><dd className="num">{APP_VERSION}</dd></div>
          <div><dt>Advice</dt><dd>No buy/sell advice. Values you enter are shown as-is.</dd></div>
          <div><dt>Privacy</dt><dd>Stored only in this browser on this device. No account, no server, no tracking. No SMS reading, no bank access, no money movement.</dd></div>
        </dl>
      </Section>
    </div>
  );
}
