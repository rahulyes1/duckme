import { describe, expect, it } from 'vitest';
import { readIncomingShare, shareToNote } from './share';

describe('readIncomingShare', () => {
  it('reads shortcuts', () => {
    expect(readIncomingShare('?new=note')).toEqual({ kind: 'new', type: 'note' });
    expect(readIncomingShare('?new=expense')).toEqual({ kind: 'new', type: 'expense' });
    expect(readIncomingShare('?new=bogus')).toBeNull();
  });
  it('reads shared title / text / url and drops empty ones', () => {
    expect(readIncomingShare('?title=Hi&text=Pay%20%E2%82%B9500&url=')).toEqual({ kind: 'share', title: 'Hi', text: 'Pay ₹500' });
    expect(readIncomingShare('?url=https%3A%2F%2Fx.in')).toEqual({ kind: 'share', url: 'https://x.in' });
  });
  it('returns null when nothing is there', () => {
    expect(readIncomingShare('')).toBeNull();
    expect(readIncomingShare('?title=%20&text=')).toBeNull();
  });
});

describe('shareToNote', () => {
  it('keeps the url unless the text already has it', () => {
    expect(shareToNote({ text: 'Look https://x.in', url: 'https://x.in' })).toEqual({ type: 'note', title: '', body: 'Look https://x.in' });
    expect(shareToNote({ title: 'Article', url: 'https://x.in' })).toEqual({ type: 'note', title: 'Article', body: 'https://x.in' });
  });
  it('does not repeat a title that equals the text', () => {
    expect(shareToNote({ title: 'Milk', text: 'Milk' })).toEqual({ type: 'note', title: 'Milk', body: '' });
  });
  it('returns null for an empty share', () => {
    expect(shareToNote({})).toBeNull();
  });
});
