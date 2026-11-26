import { useMemo } from 'react';
import { useCards, useSettings } from '../lib/hooks';
import { today } from '../lib/format';
import { linePath, moneyLine } from './money-line';

/**
 * The page behind the app: a still ledger (khata) sheet — faint rules, a margin line, paper grain —
 * with one fine ink line showing how your money moved this salary cycle. The line draws itself once
 * when the app opens, then stays still; a small ink dot marks today.
 */
export function Ambient() {
  const cards = useCards();
  const settings = useSettings();
  const line = useMemo(
    () => moneyLine(cards ?? [], settings.salaryAmount, settings.salaryDay, today()),
    [cards, settings.salaryAmount, settings.salaryDay],
  );
  const { d, lastX, lastY } = useMemo(() => linePath(line), [line]);
  const endX = 1000;

  return (
    <div className="ambient" aria-hidden="true">
      <div className="ledger" />
      <div className="grain" />
      <div className="moneyline">
        <svg viewBox="0 0 1000 300" preserveAspectRatio="none">
          {/* rest of the cycle: a faint dotted guide to the next salary */}
          <line x1={lastX} y1={lastY} x2={endX} y2={lastY} className="ml-rest" pathLength={1} />
          <path d={d} className={`ml-ink ${line.real ? '' : 'is-neutral'}`} pathLength={1} />
        </svg>
        <span className="ml-dot" style={{ left: `${(lastX / 1000) * 100}%`, top: `${(lastY / 300) * 100}%` }} />
      </div>
    </div>
  );
}
