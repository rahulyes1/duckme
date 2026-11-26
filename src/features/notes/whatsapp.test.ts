import { describe, expect, it } from 'vitest';
import { noteToPlain, noteToWhatsApp, whatsAppLink } from './whatsapp';

describe('noteToWhatsApp', () => {
  it('bolds the title and turns markup into WhatsApp text', () => {
    const t = noteToWhatsApp({ title: 'Weekend', body: '# Plan\n- **milk**\n[ ] call mom\n[x] pay maid\n---\nok' });
    expect(t).toBe('*Weekend*\n*Plan*\n• *milk*\n☐ call mom\n☑ pay maid\n———\nok');
  });
  it('includes calc results after "=" lines', () => {
    const t = noteToWhatsApp({ title: '', body: 'salary = 1L\nrent = 18000\nleft = salary - rent =' });
    expect(t).toContain('salary = 1L (₹1,00,000)');
    expect(t).toContain('rent = 18000\n');
    expect(t).toContain('left = salary - rent = ₹82,000');
  });
  it('lists checklist items with ☐/☑ and adds a ₹ total', () => {
    const t = noteToWhatsApp({
      title: 'Groceries', body: '',
      checklist: [{ id: '1', text: 'Atta ₹450', done: false }, { id: '2', text: 'Oil ₹300', done: true }, { id: '3', text: ' ', done: false }],
    });
    expect(t).toBe('*Groceries*\n☐ Atta ₹450\n☑ Oil ₹300\n\n*Total ₹750 · ₹450 left*');
  });
  it('plain text has no * markers', () => {
    const t = noteToPlain({ title: 'Trip', body: '**Goa**', checklist: [{ id: '1', text: 'Tickets ₹6000', done: false }] });
    expect(t).toBe('Trip\nGoa\n\n☐ Tickets ₹6000\n\nTotal ₹6,000');
  });
  it('builds an encoded wa.me link', () => {
    expect(whatsAppLink('*Hi* & ₹5')).toBe('https://wa.me/?text=*Hi*%20%26%20%E2%82%B95');
  });
});
