import { CalendarClock, Plus, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { daysLeft, fmtDate, inr, todayISO } from '../../lib/format';
import { gainLoss, netWorth } from '../../lib/logic';
import type { Card } from '../../lib/types';
import { isActive } from '../../lib/types';
import { EmptyState, Money } from '../../ui/bits';
import { hasMaturity, isMonthly, sum } from './money-util';
import { MiniRow } from './parts';
import { InfoTip } from '../../ui/InfoTip';
import { refreshInvestValues } from './prices';

/** What you've put in: typed total, or the lump sum. A SIP/RD instalment is never the total. */
const investedOf = (c: Card): number | undefined =>
  c.invest?.invested ?? (isMonthly(c.invest?.kind) ? undefined : c.amount);

/** Right-hand figure: current value when known, else "Invested ₹X" — never the monthly instalment. */
const shownValue = (c: Card): string => {
  if (c.invest?.value !== undefined && c.invest.value !== null) return inr(c.invest.value);
  const inv = investedOf(c);
  return inv ? `Invested ${inr(inv)}` : 'Add value';
};

const glText = (c: Card): string => {
  const gl = gainLoss(c);
  if (!gl) return '';
  return `${gl.diff >= 0 ? '+' : '−'}${Math.abs(gl.pct).toFixed(1)}%`;
};

export default function InvestTab({ cards, onAdd }: { cards: Card[]; onAdd: (el: HTMLElement) => void }) {
  // Funds, gold and FD/RD interest update themselves once a day when you open this tab.
  const [synced, setSynced] = useState<number | null>(null);
  useEffect(() => { void refreshInvestValues(cards).then(setSynced); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const d = useMemo(() => {
    const inv = cards.filter(c => c.type === 'invest' && isActive(c));
    const nw = netWorth(cards);
    const sipMonthly = sum(inv.filter(c => c.invest?.kind === 'SIP').map(c => c.amount ?? 0));
    const rdMonthly = sum(inv.filter(c => c.invest?.kind === 'RD').map(c => c.amount ?? 0));
    const byKind = new Map<string, Card[]>();
    for (const c of inv) { const k = c.invest?.kind ?? 'Other'; byKind.set(k, [...(byKind.get(k) ?? []), c]); }
    const vault = inv.filter(c => c.invest?.maturity && c.invest.maturity >= todayISO())
      .sort((a, b) => (a.invest!.maturity! < b.invest!.maturity! ? -1 : 1));
    return { inv, nw, sipMonthly, rdMonthly, byKind, vault };
  }, [cards]);

  if (!d.inv.length) {
    return (
      <EmptyState icon={<TrendingUp size={40} aria-hidden="true" />} title="No investments yet"
        action={<button type="button" className="btn primary" onClick={e => onAdd(e.currentTarget)}><Plus size={16} aria-hidden="true" /> Add investment</button>}>
        SIP, FD, PPF, gold — by hand.
      </EmptyState>
    );
  }
  const gl = d.nw.value - d.nw.invested;

  return (
    <div className="money-layout">
      <section className="money-summary money-wide" aria-label="Net worth">
        <div>
          <span className="money-k">Net worth</span>
          <Money value={d.nw.value} className="money-big" />
          <span className="money-vs num">Invested {inr(d.nw.invested)}</span>
          {d.sipMonthly > 0 && <span className="money-vs num">SIP {inr(d.sipMonthly)}/month</span>}
          {d.rdMonthly > 0 && <span className="money-vs num">RD {inr(d.rdMonthly)}/month</span>}
        </div>
        <div>
          <span className="money-k">{gl >= 0 ? 'Gain' : 'Loss'}</span>
          <span className="money-mid num">{gl >= 0 ? '+' : '−'}{inr(Math.abs(gl))}</span>
          <span className="money-sk num">{d.nw.invested ? `${gl >= 0 ? '+' : '−'}${Math.abs((gl / d.nw.invested) * 100).toFixed(1)}%` : '—'}</span>
        </div>
      </section>

      <section className="money-card money-wide" aria-labelledby="i-list">
        <div className="money-h-row">
          <h2 id="i-list" className="money-h">Holdings <InfoTip label="About these values">Values are what you enter (funds and gold update from live prices). Hisaab doesn't give buy/sell advice.</InfoTip></h2>
          {synced ? <span className="money-muted num">{synced} live</span> : null}
          <button type="button" className="btn ghost" onClick={e => onAdd(e.currentTarget)}><Plus size={16} aria-hidden="true" /> Add</button>
        </div>
        {[...d.byKind.entries()].map(([kind, list]) => (
          <div key={kind} className="money-kind">
            <h3 className="sec-label">{kind} <span className="num">· {inr(sum(list.map(c => c.invest?.value ?? investedOf(c) ?? 0)))}</span></h3>
            <ul className="money-list">
              {list.map(c => {
                const k = c.invest?.kind;
                const bits = [
                  isMonthly(k) ? `${inr(c.amount)}/mo` : c.invest?.value !== undefined ? `In ${inr(investedOf(c))}` : '',
                  isMonthly(k) && c.invest?.next ? `next ${fmtDate(c.invest.next)}` : '',
                  hasMaturity(k) && c.invest?.maturity ? `till ${fmtDate(c.invest.maturity)}` : '',
                  glText(c),
                  c.invest?.schemeCode && c.invest.navDate ? `NAV ${fmtDate(c.invest.navDate)}` : '',
                  c.invest?.grams ? `${c.invest.grams} g · ${c.invest.purity ?? 24}K` : '',
                ].filter(Boolean).join(' · ');
                return <MiniRow key={c.id} c={c} right={shownValue(c)} sub={bits} />;
              })}
            </ul>
          </div>
        ))}
      </section>

      <section className="money-card money-wide" aria-labelledby="i-vault">
        <h2 id="i-vault" className="money-h"><CalendarClock size={18} aria-hidden="true" /> Maturities</h2>
        {d.vault.length ? (
          <ul className="money-list">
            {d.vault.map(c => {
              const n = daysLeft(c.invest!.maturity!);
              return <MiniRow key={c.id} c={c} right={fmtDate(c.invest!.maturity!)}
                sub={`${c.invest!.kind} · ${n === 0 ? 'today' : n <= 365 ? `${n} days` : `${(n / 365).toFixed(1)} yrs`}${c.invest?.value ? ` · ${inr(c.invest.value)}` : ''}`} />;
            })}
          </ul>
        ) : <p className="money-muted">None yet</p>}
      </section>
    </div>
  );
}
