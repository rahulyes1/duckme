import { CalendarClock, Plus, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { daysLeft, fmtDate, inr, todayISO } from '../../lib/format';
import { gainLoss, netWorth } from '../../lib/logic';
import type { Card } from '../../lib/types';
import { isActive } from '../../lib/types';
import { EmptyState, Money } from '../../ui/bits';
import { hasMaturity, isMonthly, sum } from './money-util';
import { MiniRow } from './parts';
import { refreshInvestValues } from './prices';

const glText = (c: Card): string => {
  const gl = gainLoss(c);
  if (!gl) return '';
  return `${gl.diff >= 0 ? 'Gain' : 'Loss'} ${inr(Math.abs(gl.diff))} (${gl.diff >= 0 ? '+' : '−'}${Math.abs(gl.pct).toFixed(1)}%)`;
};

export default function InvestTab({ cards, onAdd }: { cards: Card[]; onAdd: (el: HTMLElement) => void }) {
  // Funds, gold and FD/RD interest update themselves once a day when you open this tab.
  const [synced, setSynced] = useState<number | null>(null);
  useEffect(() => { void refreshInvestValues(cards).then(setSynced); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const d = useMemo(() => {
    const inv = cards.filter(c => c.type === 'invest' && isActive(c));
    const nw = netWorth(cards);
    const monthly = sum(inv.filter(c => isMonthly(c.invest?.kind)).map(c => c.amount ?? 0));
    const byKind = new Map<string, Card[]>();
    for (const c of inv) { const k = c.invest?.kind ?? 'Other'; byKind.set(k, [...(byKind.get(k) ?? []), c]); }
    const vault = inv.filter(c => c.invest?.maturity && c.invest.maturity >= todayISO())
      .sort((a, b) => (a.invest!.maturity! < b.invest!.maturity! ? -1 : 1));
    return { inv, nw, monthly, byKind, vault };
  }, [cards]);

  if (!d.inv.length) {
    return (
      <EmptyState icon={<TrendingUp size={40} aria-hidden="true" />} title="No investments yet"
        action={<button type="button" className="btn primary" onClick={e => onAdd(e.currentTarget)}><Plus size={16} aria-hidden="true" /> Add investment</button>}>
        Track SIPs, FDs, PPF, gold and more by hand. Values are what you type in.
      </EmptyState>
    );
  }
  const gl = d.nw.value - d.nw.invested;

  return (
    <div className="money-layout">
      <section className="money-summary money-wide" aria-label="Net worth">
        <div>
          <span className="money-k">Net worth (investments)</span>
          <Money value={d.nw.value} className="money-big" />
          <span className="money-vs num">Invested {inr(d.nw.invested)}{d.monthly > 0 ? ` · ${inr(d.monthly)}/month in SIP and RD` : ''}</span>
        </div>
        <div>
          <span className="money-k">{gl >= 0 ? 'Gain' : 'Loss'} on what you entered</span>
          <span className="money-mid num">{gl >= 0 ? '+' : '−'}{inr(Math.abs(gl))}</span>
          <span className="money-sk num">{d.nw.invested ? `${gl >= 0 ? '+' : '−'}${Math.abs((gl / d.nw.invested) * 100).toFixed(1)}%` : 'Add invested amounts to see this'}</span>
        </div>
      </section>

      <section className="money-card money-wide" aria-labelledby="i-list">
        <div className="money-h-row">
          <h2 id="i-list" className="money-h">Investments</h2>
          {synced ? <span className="money-muted num">Updated {synced} from live prices</span> : null}
          <button type="button" className="btn ghost" onClick={e => onAdd(e.currentTarget)}><Plus size={16} aria-hidden="true" /> Add</button>
        </div>
        {[...d.byKind.entries()].map(([kind, list]) => (
          <div key={kind} className="money-kind">
            <h3 className="sec-label">{kind} <span className="num">· {inr(sum(list.map(c => c.invest?.value ?? c.invest?.invested ?? c.amount ?? 0)))}</span></h3>
            <ul className="money-list">
              {list.map(c => {
                const k = c.invest?.kind;
                const bits = [
                  isMonthly(k) ? `${inr(c.amount)}/month` : `Invested ${inr(c.invest?.invested ?? c.amount)}`,
                  isMonthly(k) && c.invest?.next ? `next ${fmtDate(c.invest.next)}` : '',
                  hasMaturity(k) && c.invest?.maturity ? `matures ${fmtDate(c.invest.maturity)}` : '',
                  glText(c),
                  c.invest?.schemeCode && c.invest.navDate ? `NAV ${fmtDate(c.invest.navDate)}` : '',
                  c.invest?.grams ? `${c.invest.grams} g · ${c.invest.purity ?? 24}K · live price` : '',
                ].filter(Boolean).join(' · ');
                return <MiniRow key={c.id} c={c} right={c.invest?.value !== undefined ? inr(c.invest.value) : 'Add value'} sub={bits} />;
              })}
            </ul>
          </div>
        ))}
        <p className="money-note">Values are what you enter. Hisaab doesn't give buy/sell advice.</p>
      </section>

      <section className="money-card money-wide" aria-labelledby="i-vault">
        <h2 id="i-vault" className="money-h"><CalendarClock size={18} aria-hidden="true" /> Yearly vault <span className="money-muted">maturities</span></h2>
        {d.vault.length ? (
          <ul className="money-list">
            {d.vault.map(c => {
              const n = daysLeft(c.invest!.maturity!);
              return <MiniRow key={c.id} c={c} right={fmtDate(c.invest!.maturity!)}
                sub={`${c.invest!.kind} · ${n === 0 ? 'today' : n <= 365 ? `in ${n} days` : `in ${(n / 365).toFixed(1)} years`}${c.invest?.value ? ` · ${inr(c.invest.value)}` : ''}`} />;
            })}
          </ul>
        ) : <p className="money-muted">No maturity dates yet. Add one to an FD, RD or PPF.</p>}
      </section>
    </div>
  );
}
