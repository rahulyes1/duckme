/** The one table. Every view (home grid, notes, money, plan, timeline) is a filter on Card[]. */
export type CardType = 'note' | 'task' | 'bill' | 'expense' | 'invest';
export type Status = 'open' | 'done' | 'archived' | 'killed' | 'trashed';
export type CardColor = 'white' | 'haldi' | 'mint' | 'rose' | 'sky' | 'lilac' | 'sand';
export type Horizon = 'week' | 'month' | 'year' | 'none';
export type Repeat = 'none' | 'monthly' | 'quarterly' | 'yearly';
export type InvestKind = 'SIP' | 'FD' | 'RD' | 'PPF' | 'MF' | 'Stock' | 'Gold' | 'NPS' | 'Other';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface InvestInfo {
  kind: InvestKind;
  /** Current value, typed by the user (no live prices in v1). */
  value?: number;
  /** Next instalment date for SIP/RD (YYYY-MM-DD). */
  next?: string;
  /** Maturity date for FD/RD/PPF (YYYY-MM-DD). */
  maturity?: string;
}

export interface Card {
  id: string;
  type: CardType;
  title: string;
  body: string;
  color: CardColor;
  pinned: boolean;
  labels: string[];
  /** When present the note is shown as a checklist. */
  checklist?: ChecklistItem[];
  /** Images as data URLs (small, resized on import). */
  images?: string[];

  amount?: number;
  /** Expense date (YYYY-MM-DD). */
  date?: string;
  /** Due date for bills and deadline for tasks (YYYY-MM-DD). */
  due?: string;
  repeat?: Repeat;
  category?: string;
  /** Payment mode for expenses: UPI, Card, Cash, Net banking, Auto-debit. */
  mode?: string;

  horizon: Horizon;
  /** The ONLY sort order for tasks and bills. Lower = higher priority. */
  rank: number;
  /** Display-only hint text, e.g. "Late fee ₹900 + GST". Never reorders anything. */
  penalty?: string;
  /** Credit card style bill: show "last safe day" = due + 3 days. */
  lastSafe?: boolean;
  /** Subscription that renews on its own. */
  autorenew?: boolean;
  invest?: InvestInfo;

  /** Reminder date-time (ISO local, "YYYY-MM-DDTHH:mm"). */
  reminder?: string;
  /** Locked notes need the PIN to view. */
  locked?: boolean;

  status: Status;
  /** Linked cards, e.g. note → bill → expense chain. */
  links: string[];
  createdAt: number;
  updatedAt: number;
  /** Set when status becomes 'trashed'. Trash is emptied after 30 days. */
  trashedAt?: number;
  /** Set when a task/bill is marked done/paid. */
  doneAt?: number;
}

/** Snapshot of a note's text for version history. */
export interface Version {
  id?: number;
  cardId: string;
  at: number;
  title: string;
  body: string;
  checklist?: ChecklistItem[];
}

export interface Settings {
  key: 'settings';
  /** Day of month salary is credited (1–31). */
  salaryDay: number;
  theme: 'system' | 'light' | 'dark';
  /** SHA-256 hex of the PIN for locked notes. */
  pinHash?: string;
  /** Monthly budget per expense category in ₹. */
  budgets: Record<string, number>;
  /** All label names the user created. */
  labels: string[];
  /** Time the user accepted the data notice on first run. */
  consentAt?: number;
  /** Swipe hint shown once. */
  seenSwipeHint?: boolean;
}

export const CARD_COLORS: CardColor[] = ['white', 'haldi', 'mint', 'rose', 'sky', 'lilac', 'sand'];
export const KIND_LABEL: Record<CardType, string> = {
  note: 'Note', task: 'Task', bill: 'Bill', expense: 'Expense', invest: 'Investment',
};
export const DEFAULT_COLOR: Record<CardType, CardColor> = {
  note: 'haldi', task: 'white', bill: 'rose', expense: 'white', invest: 'mint',
};
export const HORIZON_LABEL: Record<Horizon, string> = {
  week: 'This week', month: 'This month', year: 'This year', none: 'No horizon',
};
export const EXPENSE_CATEGORIES = [
  'Food', 'Groceries', 'Travel', 'Fuel', 'Shopping', 'Bills', 'Rent', 'Health', 'Education', 'Entertainment', 'Family', 'Other',
] as const;
export const PAY_MODES = ['UPI', 'Card', 'Cash', 'Net banking', 'Auto-debit'] as const;
export const INVEST_KINDS: InvestKind[] = ['SIP', 'FD', 'RD', 'PPF', 'MF', 'Stock', 'Gold', 'NPS', 'Other'];
