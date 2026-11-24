import { createContext, useContext } from 'react';
import type { Card, CardType } from './lib/types';
import type { Undo } from './lib/actions';

export type Route = 'home' | 'notes' | 'money' | 'plan' | 'more';
export const ROUTES: Route[] = ['home', 'notes', 'money', 'plan', 'more'];

export interface AppApi {
  route: Route;
  go: (r: Route) => void;
  /** Opens the full-screen editor for a card. `from` is the tapped element (for the grow animation). */
  openCard: (id: string, from?: Element | null) => void;
  /** Creates a card and opens it in the editor. */
  createAndOpen: (partial: Partial<Card> & { type: CardType }, from?: Element | null) => Promise<Card>;
  closeEditor: () => void;
  /** Short message at the bottom. Pass `undo` to show an Undo button. */
  toast: (msg: string, undo?: Undo) => void;
  /** Gold ₹ coin burst from an element (bill paid). */
  burst: (from: Element | DOMRect) => void;
  /** Locked notes unlocked in this session. */
  isUnlocked: (id: string) => boolean;
  unlock: (id: string) => void;
}

export const AppCtx = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const v = useContext(AppCtx);
  if (!v) throw new Error('useApp must be used inside <App>');
  return v;
}
