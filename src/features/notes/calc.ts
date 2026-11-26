/**
 * ₹ calc lines for notes (rules only, like a tiny Math Notes). Pure and safe: a tokenizer and a
 * recursive-descent parser, never eval/Function.
 *
 *   rent = 18000            → defines `rent` (later lines can use it)
 *   salary = 1.2L           → numbers take k / L / lakh / cr suffixes, ₹ / rs prefixes, Indian commas
 *   left = salary - rent =  → defines `left` AND shows the result after the "="
 *   groceries 2400 + 1800 + 650 =   → leading words are a label; the result shows after "="
 *   18% of salary =  /  salary - 10% =   → percent helpers
 *
 * Anything that does not evaluate cleanly is ignored (no result, never a throw).
 */

export interface CalcResult {
  /** 0-based source line. */
  line: number;
  value: number;
  /** 'result' = the line ends with "=" (show the value prominently); 'var' = a plain definition. */
  kind: 'result' | 'var';
  /** Variable name (lower-case) when the line defines one. */
  name?: string;
  /** Short text for the results strip, e.g. "left" or "groceries 2400 + 1800 + 650". */
  label: string;
  /** True when the right side is just a number as typed ("18000", "₹18,000"): no need to echo it. */
  literal: boolean;
}

type Tok =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: '+' | '-' | '*' | '/' | '(' | ')' | '%' | 'of' }
  | { t: 'bad' };

const SUFFIX: Record<string, number> = {
  k: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7,
};
/** Suffix words that may also stand after a space ("1.5 lakh"). Single letters must touch the number. */
const SPACED_SUFFIX = new Set(['lakh', 'lakhs', 'lac', 'lacs', 'cr', 'crore', 'crores']);

const isDigit = (c: string | undefined) => !!c && c >= '0' && c <= '9';
const isWordStart = (c: string | undefined) => !!c && /[a-z_]/.test(c);
const isWord = (c: string | undefined) => !!c && /[a-z0-9_]/.test(c);

/** Splits an expression into tokens. Unknown characters become 'bad' tokens (they make a parse fail). */
export function tokenize(input: string): Tok[] {
  const s = input.toLowerCase();
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === ' ') { i++; continue; }

    // currency prefix: ₹ / rs / rs. / inr, only when a number follows
    let j = i;
    if (c === '₹') j = i + 1;
    else if (s.startsWith('rs', i) && !isWord(s[i - 1])) j = i + 2 + (s[i + 2] === '.' ? 1 : 0);
    else if (s.startsWith('inr', i) && !isWord(s[i - 1])) j = i + 3;
    if (j !== i) {
      let k = j;
      while (s[k] === ' ') k++;
      if (isDigit(s[k]) || (s[k] === '.' && isDigit(s[k + 1]))) { i = k; }
      else if (c === '₹') { out.push({ t: 'bad' }); i++; continue; }
    }

    const d = s[i];
    if (isDigit(d) || (d === '.' && isDigit(s[i + 1]))) {
      let k = i;
      let raw = '';
      while (k < s.length && (isDigit(s[k]) || (s[k] === ',' && isDigit(s[k + 1])))) { if (s[k] !== ',') raw += s[k]; k++; }
      if (s[k] === '.' && isDigit(s[k + 1])) {
        raw += '.'; k++;
        while (isDigit(s[k])) raw += s[k++];
      }
      let v = parseFloat(raw);
      // suffix touching the number: 5k, 1.2l, 2cr, 3lakh
      let m = s.slice(k).match(/^([a-z]+)/);
      if (m && SUFFIX[m[1]] !== undefined) { v *= SUFFIX[m[1]]; k += m[1].length; }
      else if (!m) {
        // spaced word suffix: "1.5 lakh"
        m = s.slice(k).match(/^\s+([a-z]+)(?![a-z0-9_])/);
        if (m && SPACED_SUFFIX.has(m[1])) { v *= SUFFIX[m[1]]; k += m[0].length; }
      }
      if (s.startsWith('/-', k)) k += 2; // "₹500/-"
      if (!Number.isFinite(v)) { out.push({ t: 'bad' }); i = k; continue; }
      out.push({ t: 'num', v });
      i = k;
      continue;
    }

    if (isWordStart(d)) {
      let k = i;
      while (isWord(s[k])) k++;
      const w = s.slice(i, k);
      out.push(w === 'of' ? { t: 'op', v: 'of' } : { t: 'id', v: w });
      i = k;
      continue;
    }

    const op = d === '×' ? '*' : d === '÷' ? '/' : d === '−' || d === '–' ? '-' : d;
    if (op === '+' || op === '-' || op === '*' || op === '/' || op === '(' || op === ')' || op === '%') {
      out.push({ t: 'op', v: op });
    } else {
      out.push({ t: 'bad' });
    }
    i++;
  }
  return out;
}

class Fail extends Error {}

interface Val { v: number; pct: boolean }

/** Parses and evaluates a whole token list. Throws Fail on anything unexpected. */
function evaluate(toks: Tok[], vars: ReadonlyMap<string, number>): number {
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const t = toks[p]; return !!t && t.t === 'op' && t.v === v; };

  const expr = (): Val => {
    let left = term();
    while (isOp('+') || isOp('-')) {
      const sign = (toks[p++] as { v: string }).v === '+' ? 1 : -1;
      const right = term();
      // "1000 + 10%" = 1100, "salary - 10%" = 90% of salary
      left = { v: right.pct ? left.v * (1 + sign * right.v) : left.v + sign * right.v, pct: false };
    }
    return left;
  };

  const term = (): Val => {
    let left = factor();
    while (isOp('*') || isOp('/') || isOp('of')) {
      const op = (toks[p++] as { v: string }).v;
      const right = factor();
      if (op === '/') {
        if (right.v === 0) throw new Fail();
        left = { v: left.v / right.v, pct: false };
      } else {
        left = { v: left.v * right.v, pct: false };
      }
    }
    return left;
  };

  const factor = (): Val => {
    if (isOp('-')) { p++; const f = factor(); return { v: -f.v, pct: f.pct }; }
    if (isOp('+')) { p++; return factor(); }
    let base: Val;
    const t = peek();
    if (!t) throw new Fail();
    if (t.t === 'num') { p++; base = { v: t.v, pct: false }; }
    else if (t.t === 'id') {
      const v = vars.get(t.v);
      if (v === undefined) throw new Fail();
      p++;
      base = { v, pct: false };
    } else if (t.t === 'op' && t.v === '(') {
      p++;
      base = expr();
      if (!isOp(')')) throw new Fail();
      p++;
    } else throw new Fail();
    if (isOp('%')) { p++; base = { v: base.v / 100, pct: true }; }
    return base;
  };

  if (!toks.length) throw new Fail();
  const r = expr();
  if (p !== toks.length) throw new Fail();
  if (!Number.isFinite(r.v)) throw new Fail();
  return r.v;
}

/** Evaluates one expression string. Returns null on any error. */
export function evalExpr(src: string, vars: ReadonlyMap<string, number> = new Map()): number | null {
  try {
    return evaluate(tokenize(src), vars);
  } catch {
    return null;
  }
}

/**
 * For "groceries 2400 + 1800 + 650": skips leading label words and evaluates the longest tail
 * that is a complete expression.
 */
function evalTail(src: string, vars: ReadonlyMap<string, number>): { value: number; start: number } | null {
  const toks = tokenize(src);
  for (let start = 0; start < toks.length; start++) {
    try {
      return { value: evaluate(toks.slice(start), vars), start };
    } catch { /* try a shorter tail */ }
  }
  return null;
}

/** Markdown-lite line prefixes ("- ", "[ ] ", "# ") and **bold** markers are not part of the maths. */
const MD_PREFIX = /^\s*(?:#{1,2}\s+|[-*•]\s+|\[[ xX]?\]\s?)/;
const ASSIGN = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;
const LITERAL = /^\s*(?:₹|rs\.?|inr)?\s*\d[\d,]*(?:\.\d+)?\s*(?:\/-)?\s*$/i;

const clip = (s: string, n = 32) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Every calc line in a note body, in order. Variables only see lines above them. */
export function calcLines(text: string): CalcResult[] {
  if (!text || !text.includes('=')) return [];
  const vars = new Map<string, number>();
  const out: CalcResult[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.includes('=') || raw.length > 400) continue;
    const src = raw.replace(MD_PREFIX, '').replace(/\*\*/g, '').trim();
    const endsEq = /=\s*$/.test(src);
    const body = endsEq ? src.replace(/=\s*$/, '') : src;

    const m = body.match(ASSIGN);
    if (m && !m[2].includes('=') && m[1].toLowerCase() !== 'of') {
      const name = m[1].toLowerCase();
      const value = evalExpr(m[2], vars);
      if (value === null) continue;
      vars.set(name, value);
      out.push({ line: i, value, kind: endsEq ? 'result' : 'var', name, label: name, literal: !endsEq && LITERAL.test(m[2]) });
      continue;
    }
    if (endsEq && !body.includes('=')) {
      const r = evalTail(body, vars);
      if (!r) continue;
      out.push({ line: i, value: r.value, kind: 'result', label: clip(body.trim()), literal: false });
    }
  }
  return out;
}

/** calcLines keyed by line number. */
export function calcByLine(text: string): Map<number, CalcResult> {
  return new Map(calcLines(text).map(r => [r.line, r]));
}

/** ₹ with Indian grouping and up to 2 decimals: ₹1,20,000 · ₹82.5 · −₹400. */
export function fmtCalc(n: number): string {
  const a = Math.abs(n);
  const s = a.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return `${n < 0 && s !== '0' ? '−' : ''}₹${s}`;
}
