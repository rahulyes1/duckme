import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, PartyPopper, Share2 } from 'lucide-react';
import { useApp } from '../../app-context';
import { fmtDate, inr, today } from '../../lib/format';
import type { Card, Settings } from '../../lib/types';
import { Sheet } from '../../ui/Sheet';
import { cycleLabel, monthRecap, type Recap } from './recap';
import { catIcon } from './parts';
import './recap.css';

function Delta({ now, prev }: { now: number; prev: number }) {
  if (!prev) return null;
  const d = now - prev;
  if (Math.abs(d) < 1) return <span className="rc-delta">same as before</span>;
  const up = d > 0;
  return (
    <span className={`rc-delta ${up ? 'is-up' : 'is-down'}`}>
      {up ? <ArrowUpRight size={13} aria-hidden="true" /> : <ArrowDownRight size={13} aria-hidden="true" />}
      {inr(Math.abs(d))} {up ? 'more' : 'less'}
    </span>
  );
}

/** Draw the recap as a 1080×1350 image (good for WhatsApp status / Instagram) and share or save it. */
export async function shareImage(r: Recap, name?: string): Promise<'shared' | 'saved'> {
  await document.fonts?.ready;
  const W = 1080, H = 1350, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#1C1D21'); bg.addColorStop(1, '#14342A');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const disp = '"Bricolage Grotesque", "Segoe UI", sans-serif', body = '"Figtree", "Segoe UI", sans-serif';
  g.fillStyle = '#3CC79A'; g.font = `700 34px ${body}`; g.fillText('HISAAB · MONTH RECAP', 80, 130);
  g.fillStyle = '#ECEAE6'; g.font = `700 92px ${disp}`; g.fillText(`${name ? name + "'s " : 'My '}${r.label}`, 80, 240);
  g.fillStyle = '#A9A7A2'; g.font = `500 34px ${body}`; g.fillText(cycleLabel(r), 80, 300);

  g.fillStyle = '#A9A7A2'; g.font = `600 32px ${body}`; g.fillText('Spent', 80, 420);
  g.fillStyle = '#ECEAE6'; g.font = `700 120px ${disp}`; g.fillText(inr(r.spent), 80, 540);
  if (r.prevSpent) {
    const d = r.spent - r.prevSpent;
    g.fillStyle = d > 0 ? '#F2A060' : '#5BD49A'; g.font = `600 34px ${body}`;
    g.fillText(`${inr(Math.abs(d))} ${d > 0 ? 'more' : 'less'} than the month before`, 80, 600);
  }
  let y = 720;
  if (r.kept !== null) {
    g.fillStyle = '#A9A7A2'; g.font = `600 32px ${body}`; g.fillText('Kept from salary', 80, y);
    g.fillStyle = r.kept >= 0 ? '#5BD49A' : '#F2827A'; g.font = `700 72px ${disp}`;
    g.fillText(`${inr(r.kept)}${r.keptPct !== null ? `  (${r.keptPct}%)` : ''}`, 80, y + 80);
    y += 170;
  }
  g.fillStyle = '#A9A7A2'; g.font = `600 32px ${body}`; g.fillText('Top spends', 80, y);
  const max = Math.max(...r.top.map(t => t.amount), 1);
  r.top.forEach((t, i) => {
    const yy = y + 50 + i * 82;
    g.fillStyle = '#ECEAE6'; g.font = `600 36px ${body}`; g.fillText(t.name, 80, yy + 28);
    g.textAlign = 'right'; g.fillText(inr(t.amount), W - 80, yy + 28); g.textAlign = 'left';
    g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(80, yy + 44, W - 160, 10);
    g.fillStyle = '#3CC79A'; g.fillRect(80, yy + 44, (W - 160) * (t.amount / max), 10);
  });
  g.fillStyle = '#A9A7A2'; g.font = `500 32px ${body}`;
  g.fillText(`${r.noSpendDays} no-spend days · ${r.count} spends`, 80, H - 110);
  g.fillStyle = '#3CC79A'; g.font = `700 32px ${disp}`; g.fillText('Hisaab.', 80, H - 60);

  const blob: Blob = await new Promise(res => c.toBlob(b => res(b!), 'image/png'));
  const file = new File([blob], `hisaab-${r.label.toLowerCase()}.png`, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: `My ${r.label} on Hisaab` });
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'saved';
}

export function RecapBody({ r, name }: { r: Recap; name?: string }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const share = async () => {
    setBusy(true);
    try { const how = await shareImage(r, name); if (how === 'saved') toast('Recap image saved'); }
    catch { /* share sheet closed */ }
    finally { setBusy(false); }
  };
  const max = Math.max(...r.top.map(t => t.amount), 1);
  return (
    <div className="rc">
      <p className="money-muted num">{cycleLabel(r)} · {r.count} spends</p>
      <div className="rc-hero">
        <div>
          <span className="money-k">Spent</span>
          <b className="rc-big num">{inr(r.spent)}</b>
          <Delta now={r.spent} prev={r.prevSpent} />
        </div>
        {r.kept !== null && (
          <div>
            <span className="money-k">Kept from salary</span>
            <b className={`rc-big num ${r.kept >= 0 ? 'is-good' : 'is-bad'}`}>{inr(r.kept)}</b>
            <span className="rc-delta">{r.keptPct}% of {inr(r.salary)}</span>
          </div>
        )}
      </div>
      {r.top.length > 0 && (
        <ul className="rc-cats">
          {r.top.map((t, i) => {
            const Icon = catIcon(t.name);
            return (
              <li key={t.name} style={{ animationDelay: `${120 + i * 70}ms` }}>
                <span className="rc-cat-top"><span><Icon size={16} aria-hidden="true" /> {t.name}</span><b className="num">{inr(t.amount)}</b></span>
                <span className="rc-bar" aria-hidden="true"><i style={{ transform: `scaleX(${t.amount / max})`, animationDelay: `${200 + i * 70}ms` }} /></span>
                <Delta now={t.amount} prev={t.prev} />
              </li>
            );
          })}
        </ul>
      )}
      <ul className="rc-facts">
        <li><b className="num">{r.noSpendDays}</b><span>no-spend days</span></li>
        <li><b className="num">{r.billsCount ? inr(r.billsPaid) : '—'}</b><span>{r.billsCount} bill{r.billsCount === 1 ? '' : 's'} paid</span></li>
        {r.biggest && <li><b className="num">{inr(r.biggest.amount)}</b><span>biggest: {r.biggest.title} ({fmtDate(r.biggest.date)})</span></li>}
      </ul>
      <button type="button" className="btn primary rc-share" disabled={busy || !r.count} onClick={share}>
        <Share2 size={18} aria-hidden="true" />{busy ? 'Making image…' : 'Share as image'}
      </button>
    </div>
  );
}

/** Inline card shown in the first days after salary. */
export function RecapCard({ cards, settings }: { cards: Card[]; settings: Settings }) {
  const r = useMemo(() => monthRecap(cards, settings.salaryAmount ?? 0, settings.salaryDay, today()), [cards, settings.salaryAmount, settings.salaryDay]);
  if (!r.count) return null;
  return (
    <section className="money-card money-wide rc-card" aria-labelledby="rc-h">
      <h2 id="rc-h" className="money-h"><PartyPopper size={18} aria-hidden="true" /> Your {r.label}, wrapped up</h2>
      <RecapBody r={r} name={settings.userName?.split(' ')[0]} />
    </section>
  );
}

/** The same recap any time of the month, from a button. */
export function RecapSheet({ open, onClose, cards, settings }: { open: boolean; onClose: () => void; cards: Card[]; settings: Settings }) {
  const r = useMemo(() => monthRecap(cards, settings.salaryAmount ?? 0, settings.salaryDay, today()), [cards, settings.salaryAmount, settings.salaryDay]);
  return (
    <Sheet open={open} onClose={onClose} title={`Your ${r.label}, wrapped up`}>
      {r.count ? <RecapBody r={r} name={settings.userName?.split(' ')[0]} /> : <p className="money-muted">No spends in the last salary cycle yet. Your recap appears after your first full month.</p>}
    </Sheet>
  );
}
