/**
 * Pedagogical scaled dot-product attention.
 *
 * This is not a pretrained model. Token features and the four heads' projection
 * matrices are hand-built so each head specializes in a way you can check by
 * hand. The arithmetic is the real one:
 *
 *   score = q · k
 *   scaled = score / sqrt(d_k)
 *   weight = softmax(scaled)          (optional causal mask → −∞ before softmax)
 *   output = Σ weight · v
 *
 * d_model = 8, d_k = 4, heads = 4, so every score is divided by 2.
 * W_O is the identity: the published output is the concatenation of the heads.
 */

export const D_MODEL = 8;
export const D_HEAD = 4;
export const MAX_TOKENS = 12;
export const POS_OMEGA = Math.PI / 10;
export const LOCAL_SCORE = 12;
export const FOCUS_SCORE = 6;
export const ATTENTION_SCALE = 1 / Math.sqrt(D_HEAD);

export const I_SIN = 0;
export const I_COS = 1;
export const I_FIRST = 2;
export const I_PUNCT = 3;
export const I_CONTENT = 4;
export const I_C0 = 5;
export const I_C1 = 6;
export const I_ONE = 7;

export const HEAD_IDS = ['local', 'match', 'punct', 'first'] as const;
export type HeadId = (typeof HEAD_IDS)[number];

export interface Token {
  text: string;
  kind: 'han' | 'word' | 'punct';
}

export interface TokenizeResult {
  tokens: Token[];
  truncated: boolean;
}

export interface HeadDef {
  id: HeadId;
  zh: string;
  en: string;
  color: string;
  /** Shape [d_model][d_k]. Row-vector projection: y = x · W. */
  Wq: number[][];
  Wk: number[][];
  Wv: number[][];
}

export interface HeadResult {
  id: HeadId;
  q: number[][];
  k: number[][];
  v: number[][];
  /** Raw dots. Masked keys are −Infinity. */
  scores: number[][];
  scaled: number[][];
  weights: number[][];
  context: number[][];
}

export interface AttentionPass {
  tokens: Token[];
  truncated: boolean;
  embeddings: number[][];
  heads: HeadResult[];
  causal: boolean;
}

function matrix(): number[][] {
  return Array.from({ length: D_MODEL }, () => Array.from({ length: D_HEAD }, () => 0));
}

function buildHeads(): HeadDef[] {
  const localLen = Math.sqrt(LOCAL_SCORE);
  const focusLen = Math.sqrt(FOCUS_SCORE);

  const localQ = matrix();
  const localK = matrix();
  const localV = matrix();
  localQ[I_SIN][0] = localLen;
  localQ[I_COS][1] = localLen;
  localK[I_SIN][0] = localLen;
  localK[I_COS][1] = localLen;
  localV[I_SIN][0] = 1;
  localV[I_COS][1] = 1;
  localV[I_C0][2] = 1;
  localV[I_C1][3] = 1;

  const matchQ = matrix();
  const matchK = matrix();
  const matchV = matrix();
  matchQ[I_C0][0] = focusLen;
  matchQ[I_C1][1] = focusLen;
  matchK[I_C0][0] = focusLen;
  matchK[I_C1][1] = focusLen;
  matchV[I_C0][0] = 1;
  matchV[I_C1][1] = 1;
  matchV[I_CONTENT][2] = 1;
  matchV[I_SIN][3] = 1;

  const punctQ = matrix();
  const punctK = matrix();
  const punctV = matrix();
  punctQ[I_CONTENT][0] = focusLen;
  punctK[I_PUNCT][0] = focusLen;
  punctV[I_PUNCT][0] = 1;
  punctV[I_CONTENT][1] = 1;
  punctV[I_C0][2] = 1;
  punctV[I_C1][3] = 1;

  const firstQ = matrix();
  const firstK = matrix();
  const firstV = matrix();
  firstQ[I_ONE][0] = focusLen;
  firstK[I_FIRST][0] = focusLen;
  firstV[I_FIRST][0] = 1;
  firstV[I_C0][1] = 1;
  firstV[I_C1][2] = 1;
  firstV[I_ONE][3] = 1;

  return [
    { id: 'local', zh: '邻近', en: 'Local', color: '#7af0ff', Wq: localQ, Wk: localK, Wv: localV },
    { id: 'match', zh: '同形', en: 'Match', color: '#ffb15a', Wq: matchQ, Wk: matchK, Wv: matchV },
    { id: 'punct', zh: '标点', en: 'Punct', color: '#ff6b9a', Wq: punctQ, Wk: punctK, Wv: punctV },
    { id: 'first', zh: '句首', en: 'First', color: '#c4b5fd', Wq: firstQ, Wk: firstK, Wv: firstV },
  ];
}

export const HEADS: readonly HeadDef[] = buildHeads();

export function headById(id: HeadId): HeadDef {
  const found = HEADS.find((head) => head.id === id);
  if (!found) throw new Error(`unknown head ${id}`);
  return found;
}

export function matvec(weights: readonly (readonly number[])[], vector: readonly number[]): number[] {
  const cols = weights[0]?.length ?? 0;
  const out = Array.from({ length: cols }, () => 0);
  for (let row = 0; row < vector.length; row += 1) {
    const value = vector[row] ?? 0;
    const line = weights[row];
    if (!line || value === 0) continue;
    for (let col = 0; col < cols; col += 1) out[col] += value * line[col];
  }
  return out;
}

export function dot(left: readonly number[], right: readonly number[]): number {
  let sum = 0;
  const n = Math.min(left.length, right.length);
  for (let i = 0; i < n; i += 1) sum += left[i] * right[i];
  return sum;
}

/** Stable softmax. Non-finite scores (the causal mask) contribute 0. */
export function softmax(scores: readonly number[]): number[] {
  let max = Number.NEGATIVE_INFINITY;
  for (const score of scores) {
    if (Number.isFinite(score) && score > max) max = score;
  }
  if (!Number.isFinite(max)) return scores.map(() => 0);
  const exps = scores.map((score) => (Number.isFinite(score) ? Math.exp(score - max) : 0));
  const sum = exps.reduce((total, value) => total + value, 0);
  if (sum === 0) return scores.map(() => 0);
  return exps.map((value) => value / sum);
}

export function isHanChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x3400 && code <= 0x4dbf)
    || (code >= 0x4e00 && code <= 0x9fff)
    || (code >= 0xf900 && code <= 0xfaff)
    || code === 0x3007
  );
}

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r' || ch === '\u3000' || ch === '\u00a0';
}

function isAsciiWordPart(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

/**
 * Chinese is split per character. English (ASCII letters and digits) is split
 * into words; an apostrophe stays inside a word when it joins two word parts
 * (`don't`). Everything else that is not whitespace — punctuation, symbols,
 * fullwidth marks — is its own token. Whitespace never becomes a token.
 */
export function tokenize(input: string): TokenizeResult {
  const chars = Array.from(input);
  const tokens: Token[] = [];
  let index = 0;
  while (index < chars.length && tokens.length < MAX_TOKENS) {
    const ch = chars[index];
    if (isSpace(ch)) {
      index += 1;
      continue;
    }
    if (isHanChar(ch)) {
      tokens.push({ text: ch, kind: 'han' });
      index += 1;
      continue;
    }
    if (isAsciiWordPart(ch)) {
      let end = index + 1;
      while (end < chars.length) {
        const next = chars[end];
        if (isAsciiWordPart(next)) {
          end += 1;
          continue;
        }
        if ((next === "'" || next === '’') && end + 1 < chars.length && isAsciiWordPart(chars[end + 1])) {
          end += 2;
          continue;
        }
        break;
      }
      tokens.push({ text: chars.slice(index, end).join(''), kind: 'word' });
      index = end;
      continue;
    }
    tokens.push({ text: ch, kind: 'punct' });
    index += 1;
  }
  let truncated = false;
  for (let rest = index; rest < chars.length; rest += 1) {
    if (!isSpace(chars[rest])) {
      truncated = true;
      break;
    }
  }
  return { tokens, truncated };
}

/** Two unit-length features. Identical strings land on the same angle. */
export function charFeatures(text: string): [number, number] {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const angle = ((hash >>> 0) / 4294967296) * Math.PI * 2;
  return [Math.cos(angle), Math.sin(angle)];
}

export function embedToken(token: Token, index: number): number[] {
  const angle = index * POS_OMEGA;
  const [c0, c1] = charFeatures(token.text);
  const punct = token.kind === 'punct' ? 1 : 0;
  return [
    Math.sin(angle),
    Math.cos(angle),
    index === 0 ? 1 : 0,
    punct,
    punct === 0 ? 1 : 0,
    c0,
    c1,
    1,
  ];
}

export function computeAttention(input: string, causal: boolean): AttentionPass {
  const { tokens, truncated } = tokenize(input);
  const embeddings = tokens.map((token, index) => embedToken(token, index));
  const heads = HEADS.map((def) => projectHead(def, embeddings, causal));
  return { tokens, truncated, embeddings, heads, causal };
}

function projectHead(def: HeadDef, embeddings: number[][], causal: boolean): HeadResult {
  const q = embeddings.map((vector) => matvec(def.Wq, vector));
  const k = embeddings.map((vector) => matvec(def.Wk, vector));
  const v = embeddings.map((vector) => matvec(def.Wv, vector));
  const scores = q.map((query, i) => k.map((key, j) => (
    causal && j > i ? Number.NEGATIVE_INFINITY : dot(query, key)
  )));
  const scaled = scores.map((row) => row.map((score) => (
    Number.isFinite(score) ? score * ATTENTION_SCALE : score
  )));
  const weights = scaled.map((row) => softmax(row));
  const context = weights.map((row) => mixValues(row, v));
  return { id: def.id, q, k, v, scores, scaled, weights, context };
}

function mixValues(weights: readonly number[], values: number[][]): number[] {
  const mixed = Array.from({ length: D_HEAD }, () => 0);
  weights.forEach((weight, index) => {
    const value = values[index];
    if (!value || weight === 0) return;
    for (let dim = 0; dim < D_HEAD; dim += 1) mixed[dim] += weight * value[dim];
  });
  return mixed;
}

/** Concatenate the four head outputs. W_O is the identity, so this is the layer output. */
export function concatContext(pass: AttentionPass, query: number): number[] {
  return pass.heads.flatMap((head) => head.context[query] ?? []);
}

export function formatNum(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '−∞';
  return value.toFixed(digits);
}

export function meanVectors(rows: readonly (readonly number[])[]): number[] {
  if (rows.length === 0) return [];
  const width = rows[0].length;
  const acc = Array.from({ length: width }, () => 0);
  for (const row of rows) {
    for (let i = 0; i < width; i += 1) {
      const value = row[i];
      acc[i] += Number.isFinite(value) ? value : 0;
    }
  }
  const finite = rows.map((row) => row.map((value) => Number.isFinite(value)));
  return acc.map((total, index) => {
    let count = 0;
    for (const mask of finite) if (mask[index]) count += 1;
    if (count === 0) return Number.NEGATIVE_INFINITY;
    return total / count;
  });
}
