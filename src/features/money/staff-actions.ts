/** Writes for the household staff ledger. Every action returns an undo. No money moves: these are records. */
import { createCard, payBill, updateCard, withUndo, type Undo } from '../../lib/actions';
import { db } from '../../lib/db';
import { nextSalary, todayISO, toISO, uid } from '../../lib/format';
import type { Card, StaffInfo } from '../../lib/types';
import { addAdvance, addStaffDays, recordPayment, STAFF_CATEGORY, type NetPay } from './staff';

export interface NewStaff {
  name: string;
  role: string;
  pay: number;
  /** Day of the month you pay them (1–31). */
  payDay: number;
  phone?: string;
  advance?: number;
}

/** A staff member is a monthly repeating bill with a ledger. */
export async function createStaff(p: NewStaff): Promise<Card> {
  return createCard({
    type: 'bill', title: p.name.trim(), category: STAFF_CATEGORY, repeat: 'monthly', amount: p.pay,
    due: toISO(nextSalary(p.payDay)), color: 'sand',
    staff: { role: p.role, ...(p.phone?.trim() ? { phone: p.phone.trim() } : {}), advance: p.advance ?? 0, log: [] },
  });
}

const staffOf = (c: Card): StaffInfo => c.staff ?? { role: 'Other', advance: 0, log: [] };

/**
 * Pays a staff member: payBill marks this month done, logs the expense and creates next month's card
 * (payBill copies the whole card, so `staff` carries forward). Then the expense gets the NET amount,
 * and the 'paid' entry plus the lower advance go on the next card (or this one if it doesn't repeat).
 */
export async function payStaff(id: string, p: NetPay, mode: string): Promise<{ undo: Undo; nextDue: string | null }> {
  let nextDue: string | null = null;
  const undo = await withUndo(async () => {
    const bill = await db.cards.get(id);
    if (!bill) return;
    const r = await payBill(id);
    nextDue = r.nextDue;
    await db.cards.update(r.expense.id, { amount: p.net, mode, category: STAFF_CATEGORY, title: `${bill.title || 'Staff'} pay`, updatedAt: Date.now() });
    const staff = recordPayment(staffOf(bill), p, todayISO(), [uid(), uid()], mode);
    await db.cards.update(r.nextBill?.id ?? id, { staff, updatedAt: Date.now() });
  });
  return { undo, nextDue };
}

/** Advance given: logged on the ledger, added to what's outstanding, and recorded as a Staff expense. */
export async function giveAdvance(id: string, amount: number, mode: string): Promise<Undo> {
  return withUndo(async () => {
    const c = await db.cards.get(id);
    if (!c || amount <= 0) return;
    const exp = await createCard({
      type: 'expense', title: `Advance to ${c.title || 'staff'}`, amount, date: todayISO(), category: STAFF_CATEGORY, mode, links: [id],
    });
    await updateCard(id, { staff: addAdvance(staffOf(c), amount, todayISO(), uid(), mode), links: [...c.links, exp.id] });
  });
}

export async function logStaffDays(id: string, kind: 'leave' | 'extra', days: number, date = todayISO()): Promise<Undo> {
  return withUndo(async () => {
    const c = await db.cards.get(id);
    if (!c) return;
    await updateCard(id, { staff: addStaffDays(staffOf(c), kind, days, date, uid()) });
  });
}
