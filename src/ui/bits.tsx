import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { CardColor } from '../lib/types';
import { CARD_COLORS } from '../lib/types';
import { inr } from '../lib/format';
import { useCountUp } from '../lib/hooks';

const COLOR_NAME: Record<CardColor, string> = {
  white: 'Default', haldi: 'Haldi yellow', mint: 'Mint', rose: 'Rose', sky: 'Sky', lilac: 'Lilac', sand: 'Sand',
};

export function ColorPicker({ value, onChange }: { value: CardColor; onChange: (c: CardColor) => void }) {
  return (
    <div role="radiogroup" aria-label="Card colour" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {CARD_COLORS.map(k => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          aria-label={COLOR_NAME[k]}
          data-color={k}
          onClick={() => onChange(k)}
          style={{
            width: 44, height: 44, borderRadius: '50%', background: 'var(--c)', display: 'grid', placeItems: 'center',
            border: '1px solid color-mix(in srgb, var(--ink) 25%, transparent)',
            boxShadow: value === k ? '0 0 0 2px var(--surface), 0 0 0 4px var(--ink)' : 'none',
          }}
        >
          {value === k && <Check size={18} aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <b>{title}</b>
      {children && <div style={{ maxWidth: 360 }}>{children}</div>}
      {action}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="switch" onClick={() => onChange(!checked)}>
      <i aria-hidden="true" />{label}
    </button>
  );
}

/** ₹ amount that counts up/down when it changes. */
export function Money({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value);
  return <span className={`num ${className ?? ''}`}>{inr(v)}</span>;
}
