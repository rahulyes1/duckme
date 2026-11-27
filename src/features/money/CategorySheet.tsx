/** One category: its total, its share of all spending in the same period, and every transaction. */
import { useApp } from '../../app-context';
import { fmtDate, inr } from '../../lib/format';
import type { Card } from '../../lib/types';
import { Sheet } from '../../ui/Sheet';
import { catIcon } from './parts';
import { sum } from './money-util';

export default function CategorySheet({ category, spends, period, onClose }: {
  category: string | null;
  /** Every spend in the period, all categories. */
  spends: Card[]; period: string; onClose: () => void;
}) {
  const { openCard } = useApp();
  const mine = spends.filter(c => (c.category || 'Other') === category)
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.createdAt - a.createdAt);
  const total = sum(mine.map(c => c.amount ?? 0)), all = sum(spends.map(c => c.amount ?? 0));
  const Icon = catIcon(category ?? undefined);
  return (
    <Sheet open={!!category} onClose={onClose} title={category ?? 'Category'} hideTitle>
      <div className="cat-hero">
        <span>{category} · {period}</span>
        <b className="num">{inr(total)}</b>
        <Icon size={30} aria-hidden="true" />
      </div>
      <div className="cat-track" aria-hidden="true"><i style={{ width: `${all ? (total / all) * 100 : 0}%` }} /></div>
      <p className="money-muted num">Spent {inr(total)} of {inr(all)}</p>
      <h3 className="money-h">History</h3>
      {mine.length ? (
        <ul className="cat-list">
          {mine.map(c => (
            <li key={c.id}>
              <button type="button" onClick={e => { const el = e.currentTarget; onClose(); openCard(c.id, el); }}>
                <span><b>{c.title || category}</b><small className="num">{[c.date ? fmtDate(c.date) : '', c.time, c.account, c.mode].filter(Boolean).join(' · ')}</small></span>
                <em className="num">−{inr(c.amount)}</em>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="money-muted">No spends here.</p>}
    </Sheet>
  );
}
