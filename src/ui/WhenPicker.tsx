// CONTRACT STUB — implemented by the Plan agent. Keep these exports and props stable.
import type { When } from '../lib/types';

export interface WhenPickerProps {
  open: boolean;
  /** Current value; undefined = not planned. */
  value?: When;
  /** Which tab to open on. Default: value?.unit ?? 'day'. */
  initialUnit?: When['unit'];
  /** Called with the picked slot, or undefined when the user clears it. */
  onChange: (w: When | undefined) => void;
  onClose: () => void;
}

/** Pop-up with Day / Week / Month tabs: a calendar to pick a date, a list of weeks, a grid of months. */
export function WhenPicker(_props: WhenPickerProps): JSX.Element | null {
  return null;
}

/** "Wed 26-11", "Week of 24-11", "December 2026". */
export function whenLabel(w: When): string {
  return w.unit === 'month' ? w.start.slice(0, 7) : w.start;
}
