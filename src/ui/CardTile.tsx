import { Bell, CheckSquare, IndianRupee, Lock, Pin, Receipt, ShieldCheck, StickyNote, TrendingUp } from 'lucide-react';
import type { Card, Settings } from '../lib/types';
import { KIND_LABEL, HORIZON_LABEL } from '../lib/types';
import { addDaysISO, daysLeft, dueLabel, dueTone, fmtDate, fmtDateY, inr, salarySide } from '../lib/format';
import { gainLoss } from '../lib/logic';
import { NoteBody } from '../features/notes/NoteBody';
import { lineAmount } from '../lib/parse';
import { isActive } from '../lib/types';
import { SAMPLE_LABEL } from '../lib/seed';

const HORIZON_BADGE = { week: 'W', month: 'M', year: 'Y', none: '' } as const;

function GainLoss({ card }: { card: Card }) {
  const g = gainLoss(card);
  if (!g) return null;
  const up = g.diff >= 0;
  return (
    <div className={`meta gl ${up ? 'up' : 'down'}`}>
      {up ? '+' : '−'}{inr(Math.abs(g.diff))} ({up ? '+' : '−'}{Math.abs(g.pct).toFixed(1)}%) {up ? 'gain' : 'loss'}
    </div>
  );
}

export const TYPE_ICON = {
  note: StickyNote, task: CheckSquare, bill: Receipt, expense: IndianRupee, invest: TrendingUp,
} as const;

function Ring({ due }: { due: string }) {
  const n = daysLeft(due), r = 11, C = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, n / 30));
  const tone = dueTone(due);
  return (
    <svg className={`ring ${tone}`} width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <circle className="bg" cx="14" cy="14" r={r} />
      <circle className="fg" cx="14" cy="14" r={r} strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
      <text x="14" y="17.3" textAnchor="middle">{Math.max(n, 0)}</text>
    </svg>
  );
}

export function Spark({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const mn = Math.min(...points), mx = Math.max(...points);
  const xy = points.map((p, i) => [(i / (points.length - 1)) * 100, 26 - ((p - mn) / (mx - mn || 1)) * 22]);
  const line = xy.map(p => p.join(',')).join(' ');
  return (
    <svg className="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polygon className="a" points={`0,28 ${line} 100,28`} />
      <polyline className="l" points={line} />
    </svg>
  );
}

export function DuePill({ due }: { due: string }) {
  const tone = dueTone(due);
  return <span className={`pill ${tone === 'normal' ? '' : tone}`}>{dueLabel(due)}</span>;
}

/** Sum of ₹ amounts in a checklist (self-totalling lists). */
export function checklistTotal(c: Card): { total: number; open: number } | null {
  if (!c.checklist?.length) return null;
  let total = 0, open = 0, found = false;
  for (const i of c.checklist) {
    const a = lineAmount(i.text);
    if (a !== null) { found = true; total += a; if (!i.done) open += a; }
  }
  return found ? { total, open } : null;
}

interface Props {
  card: Card;
  settings: Settings;
  /** Locked and not yet unlocked in this session. */
  hidden?: boolean;
  onOpen?: (el: HTMLElement) => void;
  /** Extra class names (e.g. 'newpop'). */
  className?: string;
}

/** The one card look used by Home and Notes grids. Pure display; wrap it for swipe. */
export function CardTile({ card: c, settings, hidden, onOpen, className = '' }: Props) {
  const Icon = TYPE_ICON[c.type];
  const kind = c.type === 'invest' && c.invest ? c.invest.kind : KIND_LABEL[c.type];
  const hasRing = c.type === 'bill' && !!c.due && isActive(c);
  const pills: JSX.Element[] = [];

  if (c.type === 'bill' && c.due) {
    pills.push(<DuePill key="d" due={c.due} />);
  }
  if (c.status === 'delayed') pills.push(<span key="dl" className="pill outline">Delayed</span>);
  if (c.autorenew) pills.push(<span key="a" className="pill solid">Auto-renews</span>);
  if (c.type === 'task') {
    if (c.horizon !== 'none') pills.push(<span key="h" className="pill solid" title={HORIZON_LABEL[c.horizon]} aria-label={HORIZON_LABEL[c.horizon]}>{HORIZON_BADGE[c.horizon]}</span>);
    if (c.due) pills.push(<DuePill key="d" due={c.due} />);
  }
  if (c.expiry) {
    const n = daysLeft(c.expiry);
    const tone = n < 0 ? 'late' : n <= 30 ? 'urgent' : '';
    pills.push(<span key="x" className={`pill ${tone}`}><ShieldCheck size={11} aria-hidden="true" />{n < 0 ? `Expired ${fmtDate(c.expiry)}` : n === 0 ? 'Expires today' : n <= 60 ? `Expires in ${n} days` : `Expires ${fmtDate(c.expiry)}`}</span>);
  }
  if (c.reminder) pills.push(<span key="r" className="pill outline"><Bell size={11} aria-hidden="true" />{fmtDate(c.reminder.slice(0, 10))} {c.reminder.slice(11, 16)}</span>);

  // 'Sample' marks demo data; it doesn't need to shout on every card.
  const shownLabels = c.labels.filter(l => l !== SAMPLE_LABEL);
  const total = checklistTotal(c);
  const items = c.checklist ?? [];
  const shownItems = [...items.filter(i => !i.done), ...items.filter(i => i.done)].slice(0, 6);

  return (
    <button
      type="button"
      className={`tile ${hasRing ? 'has-ring' : ''} ${className}`}
      data-color={c.color}
      data-id={c.id}
      aria-label={`${KIND_LABEL[c.type]}: ${hidden ? 'locked note' : c.title || 'Untitled'}`}
      onClick={e => onOpen?.(e.currentTarget)}
    >
      {hasRing && <Ring due={c.due!} />}
      {/* Plain notes skip the "NOTE" header: it says nothing the card doesn't. */}
      {(c.type !== 'note' || c.pinned || c.locked) && (
        <div className="k">
          <Icon size={12} strokeWidth={2.4} aria-hidden="true" />
          {c.type !== 'note' && <span>{kind}</span>}
          {c.pinned && <Pin size={11} aria-label="Pinned" />}
          {c.locked && <Lock size={11} aria-label="Locked" />}
        </div>
      )}

      {hidden ? (
        <>
          {c.title && <div className="t">{c.title}</div>}
          <div className="locked"><Lock size={16} aria-hidden="true" /> Tap to unlock</div>
        </>
      ) : (
        <>
          {!!c.images?.length && c.type === 'note' && (
            <div className="thumbs" style={c.images.length === 1 ? { gridTemplateColumns: '1fr' } : undefined}>
              {c.images.slice(0, 2).map((src, i) => <img key={i} src={src} alt="" />)}
            </div>
          )}
          {c.title && <div className="t">{c.title}</div>}
          {c.type === 'note' && !c.title && !c.body?.trim() && !items.length && !c.images?.length && <div className="t is-empty">Empty note</div>}

          {(c.type === 'note' || c.type === 'task') && c.body && <NoteBody text={c.body} />}
          {!!items.length && (
            <ul className="check">
              {shownItems.map(i => <li key={i.id} className={i.done ? 'on' : ''}><i />{i.text}</li>)}
              {items.length > 6 && <li className="more">+{items.length - 6} more</li>}
            </ul>
          )}
          {total && <div className="total">Total {inr(total.total)}{total.open !== total.total ? ` · ${inr(total.open)} left` : ''}</div>}

          {c.type === 'bill' && <div className="amt">{c.amount ? inr(c.amount) : <small>Add amount</small>}</div>}
          {c.type === 'bill' && c.due && (
            <div className="meta">
              {salarySide(c.due, settings.salaryDay) === 'before' ? 'Before salary' : 'After salary'}
              {c.lastSafe ? ` · safe till ${fmtDate(addDaysISO(c.due, 3))}` : ''}
            </div>
          )}
          {c.type === 'expense' && (
            <>
              <div className="amt">{inr(c.amount)}</div>
              <div className="meta">{c.category ?? 'Other'} · {c.mode ?? 'UPI'}{c.date ? ` · ${fmtDate(c.date)}` : ''}</div>
            </>
          )}
          {c.type === 'invest' && c.invest && (
            c.invest.kind === 'SIP' || c.invest.kind === 'RD' ? (
              <>
                <div className="amt">{inr(c.invest.value ?? c.amount)} <small>value</small></div>
                <div className="meta">{inr(c.amount)}/month{c.invest.next ? ` · next ${fmtDate(c.invest.next)}` : ''}</div>
              </>
            ) : (
              <>
                <div className="amt">{inr(c.invest.value ?? c.amount)}</div>
                <div className="meta">{c.invest.maturity ? `Matures ${fmtDateY(c.invest.maturity)}` : `Invested ${inr(c.amount)}`}</div>
              </>
            )
          )}
          {c.type === 'invest' && <GainLoss card={c} />}
        </>
      )}

      {!!pills.length && <div className="pills">{pills}</div>}
      {c.penalty && (c.type === 'bill' || c.type === 'task') && !hidden && <div className="pen-line">{c.penalty}</div>}
      {!!shownLabels.length && !hidden && <div className="labels">{shownLabels.map(l => <span key={l} className="lbl">#{l}</span>)}</div>}
    </button>
  );
}
