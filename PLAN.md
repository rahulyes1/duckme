# Hisaab web app — build plan

One app, three parts: a **better Keep** (notes), a **better tracker** (money), and a **hybrid home** that mixes both.
Local-first web app (PWA). No SMS reading, no bank links, no money movement, no buy/sell advice.

## Stack

| Layer | Pick | Why |
|---|---|---|
| UI | React 18 + TypeScript + Vite | Fast to build with AI tools, one codebase, easy to wrap as a phone app later |
| Storage | IndexedDB via Dexie | Offline, fast, everything stays on the device |
| Animation | Framer Motion + CSS | Card open/close, drag lift, sheets, number roll-ups |
| Drag | @dnd-kit | Drag to re-rank and checklist reorder, with keyboard support |
| Icons | lucide-react (one family) | Design rule: one icon family, no emoji icons |
| Tests | Vitest | Hinglish parser and money maths |

Design rules come from the ui-ux-pro-max skill: touch targets ≥ 44px, body text ≥ 16px on mobile, 4.5:1 contrast in both themes,
visible focus rings, tabular numbers for ₹, animate only transform/opacity, reduced-motion respected, undo toasts instead of
confirm dialogs, every swipe action also reachable by a button.

## Shared contract (built first, by the lead)

| File | What it holds |
|---|---|
| `src/lib/types.ts` | `Card` (the one table), `Version`, `Settings` |
| `src/lib/db.ts` | Dexie database: `cards`, `versions`, `settings` |
| `src/lib/actions.ts` | create / update / pay / delay / kill / archive / trash / restore, with version snapshots |
| `src/lib/format.ts` | ₹ formatting (en-IN), date helpers, salary side, days left |
| `src/lib/parse.ts` | Hinglish quick-add parser + smart-chip detector |
| `src/lib/hooks.ts` | `useCards`, `useSettings` live queries |
| `src/ui/*` | `CardTile`, `Sheet`, `Toast`, `Chip`, `ColorPicker`, `EmptyState` |
| `src/App.tsx` | Shell, bottom nav (Home · Notes · Money · Plan · More), routing by hash, editor router |

## Agents, tasks and subtasks

### Agent 1 — Notes (better Keep) · owns `src/features/notes/`
1. **Notes screen**
   - Keep masonry grid of notes only, pinned section, label filter row, archive and trash views
   - Search inside notes, colour filter
2. **Note editor** (`NoteEditor.tsx`, also used for tasks)
   - Opens straight into typing, autosaves on every change (debounced)
   - Title + body, checklist mode, drag to reorder items, ticked items drop to the bottom
   - Self-totalling lists: items with ₹ amounts add up live
   - Smart chips: amounts and dates in the text show "Make bill / Add expense / Make task" chips
   - Colour, pin, labels (create + assign), reminder date/time, images (from file picker)
   - Lock a note with a PIN (hashed), locked notes blur in the grid
   - Version history: list of earlier versions, restore one
   - Archive, trash (restore within 30 days), make a copy, convert type
   - Task fields when type is task: horizon, deadline, penalty hint

### Agent 2 — Money (better tracker) · owns `src/features/money/`
1. **Money screen**
   - Month switcher, total spent, count-up numbers
   - Spend by category (bar list with labels, not colour alone), budget per category with progress
   - Upcoming bills: before salary / after salary, last safe day, penalty hints
   - Subscriptions (auto-renew cards) with renewal dates
   - Investments: SIPs, FDs, PPF, gold, stocks — total invested, current value, maturity list
   - Recent expenses list
2. **Entry editor** (`EntryEditor.tsx` for expense, bill, investment)
   - Labelled fields, numeric keypad for amounts, validate on blur
   - Bill: due date, repeat, penalty hint, auto-renews, last-safe-day toggle, "Mark paid" (creates linked expense)
   - Investment: kind, amount, start/next date, maturity, current value (entered by hand in v1)
   - Linked cards list, delete to trash with undo

### Agent 3 — Home + Plan · owns `src/features/home/`, `src/features/plan/`
1. **Hybrid home** (from the mockup the user liked)
   - Keep-style grid of every card type, pinned section, filter chips, search
   - Swipe right = paid/done, left = delay a week, long left = kill; buttons for the same actions in the editor
   - Salary strip (before / after salary due), coin burst + roll-down on paid
   - Floating + : tap = quick add sheet with live Hinglish preview, hold = type fan
2. **Plan screen**
   - My order: drag to re-rank tasks and bills (only order the app uses), hints toggle
   - Timeline: Day / Week / Month / Year zoom with pinch, ctrl+scroll and buttons; salary markers

### Agent 4 — Platform · owns `src/features/settings/`, `src/lib/seed.ts`, tests, PWA files
1. **First run**: consent screen (what is stored, where, how to delete), optional sample data
2. **Settings**: salary day, theme, PIN for locked notes, budgets, labels manager
3. **Your data**: export JSON, import JSON, delete everything (type-to-confirm)
4. **PWA**: manifest, icons, offline service worker
5. **Tests**: parser and money maths with Vitest

### Lead (integration)
- Merge, type-check, build, fix, then click through every flow in a browser at phone and desktop width, both themes

## Later (not in this build)
Cloud sync and login, share-sheet import of bill PDFs, AMFI NAV fetch, family space, widgets, AI weekly summary, Play Store wrapper.
