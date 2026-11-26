/** Sample data for first run. Every card carries the "Sample" label so it can be removed in one go. */
import { db, getSettings, saveSettings } from './db';
import { newCard } from './actions';
import { addDays, addMonths, nextSalary, toISO, today, uid } from './format';
import type { Card, CardType } from './types';

export const SAMPLE_LABEL = 'Sample';

/** Day `day` of the month `offset` months from today, clamped to the month's length. */
function dayOfMonth(offset: number, day: number): Date {
  const t = today();
  const first = new Date(t.getFullYear(), t.getMonth() + offset, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(day, last));
}

/** Next occurrence (today or later) of day-of-month `day`. */
function nextDay(day: number): Date {
  const d = dayOfMonth(0, day);
  return d >= today() ? d : dayOfMonth(1, day);
}

/** Expense date `day` in month `offset`, never in the future. */
function pastDay(offset: number, day: number): string {
  const d = dayOfMonth(offset, day);
  const t = today();
  return toISO(d > t ? t : d);
}

export async function loadSampleData(): Promise<void> {
  const t = today();
  const settings = await getSettings();
  const salary = nextSalary(settings.salaryDay, t);
  const base = await db.cards.toArray();
  let rank = base.reduce((m, c) => Math.max(m, c.rank || 0), 0);
  const r = () => ++rank;
  const S = [SAMPLE_LABEL];
  // Every card gets a rank in the order listed: that is the order Home shows them in.
  const mk = (p: Partial<Card> & { type: CardType }) => newCard({ rank: r(), ...p, labels: [...(p.labels ?? []), ...S] });

  // Credit card bill sits a couple of days before salary so the "last safe day" is visible.
  const ccDue = addDays(salary, -3) > t ? addDays(salary, -3) : addDays(t, 4);

  const cards: Card[] = [
    mk({ type: 'task', title: 'Renew PUC for the bike', due: toISO(addDays(t, 3)), horizon: 'week', color: 'haldi', pinned: true,
      penalty: 'Fine up to ₹10,000 without PUC' }),
    mk({ type: 'bill', title: 'Credit card bill', amount: 18450, due: toISO(ccDue), repeat: 'monthly', color: 'rose', pinned: true,
      penalty: 'Late fee ₹900 + GST', lastSafe: true, category: 'Bills' }),
    mk({ type: 'task', title: 'File belated ITR', due: toISO(dayOfMonth(1, 31)), horizon: 'month', color: 'mint',
      penalty: 'Late fee up to ₹5,000 (sec 234F)' }),
    mk({ type: 'bill', title: 'Job portal premium', amount: 1500, due: toISO(addDays(t, 9)), repeat: 'yearly', autorenew: true,
      color: 'lilac', penalty: 'Cancel before the renewal date or it renews', category: 'Entertainment' }),
    mk({ type: 'bill', title: 'Rent', amount: 18000, due: toISO(nextDay(5)), repeat: 'monthly', color: 'sand', category: 'Rent' }),
    mk({ type: 'bill', title: 'Bijli bill', amount: 2400, due: toISO(nextDay(15)), repeat: 'monthly', color: 'white', category: 'Bills' }),
    mk({ type: 'note', title: 'Cousin’s wedding checklist', color: 'white', checklist: [
      { id: uid(), text: 'Gift ₹5,000', done: false },
      { id: uid(), text: 'Train tickets ₹2,400', done: true },
      { id: uid(), text: 'Kurta stitching ₹1,800', done: false },
      { id: uid(), text: 'Book a cab to the station', done: false },
    ] }),
    mk({ type: 'note', title: 'Ask landlord for rent receipts', color: 'white',
      body: 'Needed for the HRA claim. Get all 12 months signed, with his PAN if rent is above ₹1 lakh a year.' }),
    mk({ type: 'note', title: 'Weekend trek to Rajmachi', color: 'mint', labels: ['Ideas'],
      body: 'Leave Friday night. Carry torch, rain jacket, ORS.' }),
    mk({ type: 'invest', title: 'Flexi-cap fund SIP', amount: 5000, color: 'mint', repeat: 'monthly',
      invest: { kind: 'SIP', value: 142300, invested: 125000, next: toISO(nextDay(10)) } }),
    mk({ type: 'invest', title: 'Bank FD', amount: 100000, color: 'sky',
      invest: { kind: 'FD', value: 104200, invested: 100000, maturity: toISO(addMonths(t, 4)) } }),
  ];

  // Spending over this and the previous 5 months, so the Money trend has a shape.
  const spend: [number, number, string, number, string, string][] = [
    // [monthOffset, day, title, amount, category, mode]
    [0, 1, 'Groceries from Blinkit', 1840, 'Groceries', 'UPI'],
    [0, 3, 'Petrol', 1500, 'Fuel', 'Card'],
    [0, 8, 'Dinner order', 640, 'Food', 'UPI'],
    [0, 12, 'Movie tickets', 780, 'Entertainment', 'UPI'],
    [0, 20, 'Medicines', 420, 'Health', 'Cash'],
    [-1, 4, 'Groceries', 2600, 'Groceries', 'UPI'],
    [-1, 11, 'Diwali shopping', 6400, 'Shopping', 'Card'],
    [-1, 18, 'Uber to airport', 950, 'Travel', 'UPI'],
    [-2, 6, 'Groceries', 2300, 'Groceries', 'UPI'],
    [-2, 15, 'Lunch with team', 1200, 'Food', 'UPI'],
    [-2, 24, 'Petrol', 1400, 'Fuel', 'Card'],
    [-3, 2, 'Groceries', 2100, 'Groceries', 'UPI'],
    [-3, 19, 'Doctor visit', 800, 'Health', 'Cash'],
    [-4, 9, 'Groceries', 1900, 'Groceries', 'UPI'],
    [-4, 22, 'New shoes', 2999, 'Shopping', 'Card'],
    [-5, 5, 'Groceries', 2000, 'Groceries', 'UPI'],
    [-5, 14, 'Train tickets home', 1650, 'Travel', 'Net banking'],
  ];
  for (const [off, day, title, amount, category, mode] of spend) {
    cards.push(mk({ type: 'expense', title, amount, category, mode, date: pastDay(off, day) }));
  }

  await db.cards.bulkAdd(cards);
  const labels = new Set(settings.labels);
  labels.add('Ideas');
  labels.add(SAMPLE_LABEL);
  await saveSettings({ labels: [...labels] });
}

export async function countSampleData(): Promise<number> {
  return db.cards.where('labels').equals(SAMPLE_LABEL).count();
}

/** Deletes every card labelled "Sample" (and their versions). Returns how many were removed. */
export async function removeSampleData(): Promise<number> {
  const ids = (await db.cards.where('labels').equals(SAMPLE_LABEL).primaryKeys()) as string[];
  await db.transaction('rw', db.cards, db.versions, async () => {
    await db.cards.bulkDelete(ids);
    await db.versions.where('cardId').anyOf(ids).delete();
  });
  const s = await getSettings();
  await saveSettings({ labels: s.labels.filter(l => l !== SAMPLE_LABEL) });
  return ids.length;
}
