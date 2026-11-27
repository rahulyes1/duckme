import { describe, expect, it } from 'vitest';
import { countWords, debounce, fmtWords, tileText } from './text-stats';

describe('countWords', () => {
  it('counts plain, Hinglish, Hindi and money words', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n ')).toBe(0);
    expect(countWords('rent 18000 bhejna hai')).toBe(4);
    expect(countWords("don't pay ₹1,200 late")).toBe(4);
    expect(countWords('# Ghar\n- [ ] doodh lana\n---')).toBe(3);
    expect(countWords('नमस्ते दुनिया')).toBe(2);
  });
  it('handles 10,000 words quickly', () => {
    const big = Array.from({ length: 10000 }, (_, i) => `word${i}`).join(' ');
    const t = performance.now();
    expect(countWords(big)).toBe(10000);
    expect(performance.now() - t).toBeLessThan(200);
  });
});

describe('fmtWords', () => {
  it('uses Indian grouping and singular', () => {
    expect(fmtWords(1)).toBe('1 word');
    expect(fmtWords(1240)).toBe('1,240 words');
    expect(fmtWords(125000)).toBe('1,25,000 words');
  });
});

describe('debounce', () => {
  const fake = () => {
    let t = 0;
    let q: { at: number; f: () => void; id: number }[] = [];
    let id = 0;
    return {
      now: () => t,
      setT: (f: () => void, ms: number) => { q.push({ at: t + ms, f, id: ++id }); return id; },
      clearT: (h: unknown) => { q = q.filter(x => x.id !== h); },
      advance(ms: number) {
        t += ms;
        for (;;) {
          const due = q.filter(x => x.at <= t).sort((a, b) => a.at - b.at)[0];
          if (!due) break;
          q = q.filter(x => x !== due);
          due.f();
        }
      },
    };
  };

  it('runs once after the burst with the last args', () => {
    const c = fake();
    const calls: number[] = [];
    const d = debounce((n: number) => calls.push(n), 250, c);
    d(1); c.advance(100); d(2); c.advance(100); d(3);
    expect(calls).toEqual([]);
    c.advance(250);
    expect(calls).toEqual([3]);
  });

  it('maxWait forces a run during a long burst', () => {
    const c = fake();
    const calls: number[] = [];
    const d = debounce((n: number) => calls.push(n), 250, { ...c, maxWait: 1000 });
    for (let i = 0; i < 20; i++) { d(i); c.advance(100); }
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]).toBe(9);
  });

  it('flush runs now, cancel drops', () => {
    const c = fake();
    const calls: number[] = [];
    const d = debounce((n: number) => calls.push(n), 250, c);
    d(1); d.flush();
    expect(calls).toEqual([1]);
    d(2); d.cancel(); c.advance(500);
    expect(calls).toEqual([1]);
    d.flush();
    expect(calls).toEqual([1]);
  });
});

describe('tileText', () => {
  it('keeps short notes whole', () => {
    expect(tileText('one\ntwo\n\n')).toEqual({ text: 'one\ntwo', more: false });
  });
  it('cuts long notes and flags more', () => {
    const big = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
    const r = tileText(big);
    expect(r.more).toBe(true);
    expect(r.text.split('\n').length).toBeLessThanOrEqual(10);
    expect(r.text.startsWith('line 0\nline 1')).toBe(true);
  });
  it('counts wrapped rows of one long paragraph', () => {
    const para = 'word '.repeat(2000);
    const r = tileText(para);
    expect(r.more).toBe(true);
    expect(r.text.length).toBeLessThan(400);
  });
});
