/**
 * Note templates. Built-ins are computed from today and the salary day; your own templates are
 * stored as ordinary notes with the "Template" label and status 'archived', so they stay out of
 * every grid, total and the Home screen without any schema change.
 */
import type { Card, CardColor, ChecklistItem } from '../../lib/types';
import { addDaysISO, fmtDate, fromISO, nextSalary, toISO, uid } from '../../lib/format';

export const TEMPLATE_LABEL = 'Template';
export const isTemplate = (c: Pick<Card, 'labels'>) => c.labels.includes(TEMPLATE_LABEL);

export type TemplateIcon = 'month' | 'tax' | 'trip' | 'festival' | 'grocery' | 'warranty';

export interface BuiltinTemplate {
  id: TemplateIcon;
  name: string;
  hint: string;
  color: CardColor;
  title: string;
  items: string[];
}

/** Built-in templates. Amounts are "₹0" placeholders so the list total updates as you fill them in. */
export function builtinTemplates(salaryDay: number, todayIso: string): BuiltinTemplate[] {
  const pay = toISO(nextSalary(salaryDay, fromISO(todayIso)));
  const by = (days: number) => fmtDate(addDaysISO(pay, days));
  const t = fromISO(todayIso);
  // ITR due date: the next 31 July on or after today.
  const itrYear = t.getMonth() > 6 ? t.getFullYear() + 1 : t.getFullYear();
  return [
    {
      id: 'month', name: 'Month start', hint: 'Rent, EMI, card bill, SIP… with pay-by dates', color: 'white',
      title: `Month start · salary ${fmtDate(pay)}`,
      items: [
        `SIP ₹0 · on ${by(2)}`,
        `Maid ₹0 · by ${by(1)}`,
        `Rent ₹0 · by ${by(5)}`,
        `Home loan EMI ₹0 · by ${by(5)}`,
        `Wi-Fi ₹0 · by ${by(7)}`,
        `Electricity ₹0 · by ${by(10)}`,
        `Credit card bill ₹0 · by ${by(12)}`,
      ],
    },
    {
      id: 'tax', name: 'Tax season', hint: `Proofs, Form 16, ITR due ${fmtDate(`${itrYear}-07-31`)}`, color: 'white',
      title: `Tax season · ITR due ${fmtDate(`${itrYear}-07-31`)}`,
      items: [
        '80C proofs: PPF, ELSS, LIC, tuition fees, home loan principal',
        'HRA rent receipts and landlord PAN',
        'TDS certificate (Form16) from employer',
        '80D health insurance premium receipt',
        'Check AIS and Form 26AS',
        'File ITR and e-verify',
      ],
    },
    {
      id: 'trip', name: 'Trip packing', hint: 'Tickets, IDs, chargers, medicines', color: 'mint',
      title: 'Trip packing',
      items: [
        'Tickets and hotel booking', 'Aadhaar / ID card', 'Phone charger and power bank', 'Medicines', 'Clothes', 'Toiletries',
        'Cash and cards', 'House keys, lights and gas off',
      ],
    },
    {
      id: 'festival', name: 'Diwali gifts', hint: 'Gift budget per person', color: 'white',
      title: 'Diwali gifts · budget',
      items: [
        'Parents ₹0', 'Siblings ₹0', 'Maid and staff bonus ₹0', 'Office team ₹0', 'Sweets and dry fruits ₹0', 'Diyas and decoration ₹0',
      ],
    },
    {
      id: 'grocery', name: 'Grocery list', hint: 'Monthly kirana basics', color: 'mint',
      title: 'Groceries',
      items: ['Atta', 'Rice', 'Dal', 'Cooking oil', 'Milk', 'Sugar', 'Tea', 'Vegetables', 'Fruits', 'Eggs'],
    },
    {
      id: 'warranty', name: 'Warranty / document', hint: 'Photo + expiry reminder', color: 'white',
      title: 'Warranty: ',
      items: ['Bought from', 'Price ₹0', 'Invoice / warranty card photo (tap the image button)', 'Service centre number', 'Set Expires below'],
    },
  ];
}

const freshItems = (items: ChecklistItem[] | undefined): ChecklistItem[] | undefined =>
  items?.filter(i => i.text.trim()).map(i => ({ id: uid(), text: i.text, done: false }));

/** "[x] item" → "[ ] item" so a template body starts unticked. */
export const untick = (body: string) => body.replace(/^(\s*)\[[xX]\]/gm, '$1[ ]');

/** The new checklist note for a built-in template. */
export function noteFromBuiltin(t: BuiltinTemplate): Partial<Card> & { type: 'note' } {
  return { type: 'note', title: t.title, color: t.color, checklist: t.items.map(text => ({ id: uid(), text, done: false })) };
}

/** Saving a note as a template: a hidden copy (label "Template", archived), unticked, with fresh ids. */
export function templateFromNote(src: { title: string; body: string; checklist?: ChecklistItem[]; color: CardColor }): Partial<Card> & { type: 'note' } {
  return {
    type: 'note', title: src.title.trim() || 'My template', body: untick(src.body), checklist: freshItems(src.checklist),
    color: src.color, labels: [TEMPLATE_LABEL], status: 'archived',
  };
}

/** Using one of your templates: an open note copied from it, without the Template label. */
export function noteFromTemplate(t: Card): Partial<Card> & { type: 'note' } {
  return {
    type: 'note', title: t.title, body: untick(t.body), checklist: freshItems(t.checklist), color: t.color,
    labels: t.labels.filter(l => l !== TEMPLATE_LABEL),
  };
}
