import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ATTENTION_SCALE,
  D_HEAD,
  D_MODEL,
  FOCUS_SCORE,
  I_C0,
  I_C1,
  I_CONTENT,
  I_COS,
  I_FIRST,
  I_ONE,
  I_PUNCT,
  I_SIN,
  LOCAL_SCORE,
  MAX_TOKENS,
  POS_OMEGA,
  charFeatures,
  computeAttention,
  concatContext,
  dot,
  headById,
  matvec,
  softmax,
  tokenize,
} from '../src/scenes/attention/attention';
import { MODEL_FACTS, STEPS, headFocus, narrate, sceneCaption } from '../src/scenes/attention/copy';

const CAT = '猫追老鼠，老鼠躲猫';

function nonzeroRows(matrix: number[][]): number[] {
  return matrix
    .map((row, index) => (row.some((value) => value !== 0) ? index : -1))
    .filter((index) => index >= 0);
}

describe('attention lab math', () => {
  it('tokenizes Chinese by character and English by word and punctuation', () => {
    expect(tokenize('我爱北京天安门').tokens.map((token) => token.text)).toEqual(['我', '爱', '北', '京', '天', '安', '门']);
    expect(tokenize('我爱北京天安门').tokens.every((token) => token.kind === 'han')).toBe(true);
    expect(tokenize('Attention is all you need.').tokens.map((token) => token.text)).toEqual([
      'Attention', 'is', 'all', 'you', 'need', '.',
    ]);
    expect(tokenize('Attention is all you need.').tokens.at(-1)?.kind).toBe('punct');
    expect(tokenize("don't stop.").tokens.map((token) => token.text)).toEqual(["don't", 'stop', '.']);
    expect(tokenize('我爱 AI。').tokens.map((token) => token.text)).toEqual(['我', '爱', 'AI', '。']);
    expect(tokenize('  a   b  ').tokens.map((token) => token.text)).toEqual(['a', 'b']);
    expect(tokenize('').tokens).toEqual([]);
    expect(tokenize('一二三四五六七八九十甲乙').truncated).toBe(false);
    expect(tokenize('一二三四五六七八九十甲乙').tokens).toHaveLength(MAX_TOKENS);
    expect(tokenize('一二三四五六七八九十甲乙丙').truncated).toBe(true);
    expect(tokenize('一二三四五六七八九十甲乙丙').tokens).toHaveLength(MAX_TOKENS);
  });

  it('uses the documented dimensions and the real scale 1/sqrt(d_k)', () => {
    expect(D_MODEL).toBe(8);
    expect(D_HEAD).toBe(4);
    expect(ATTENTION_SCALE).toBe(0.5);
    expect(MODEL_FACTS.scaleDivisor).toBe(2);
    expect(POS_OMEGA).toBeCloseTo(Math.PI / 10);
    expect(LOCAL_SCORE).toBe(12);
    expect(FOCUS_SCORE).toBe(6);
    expect(STEPS.map((step) => step.id)).toEqual(['tokens', 'embed', 'qkv', 'scores', 'scale', 'softmax', 'mix']);
    expect(STEPS.find((step) => step.id === 'scale')?.bodyZh).toContain('√d_k');
    expect(STEPS.find((step) => step.id === 'scale')?.formula).toContain('√d_k');
    expect(STEPS.find((step) => step.id === 'softmax')?.formula).toContain('exp');
    expect(STEPS.find((step) => step.id === 'mix')?.bodyZh).toContain('W_O');
  });

  it('builds embeddings and projections that match the head stories', () => {
    const pass = computeAttention(CAT, false);
    expect(pass.tokens.map((token) => token.text)).toEqual(['猫', '追', '老', '鼠', '，', '老', '鼠', '躲', '猫']);
    expect(pass.embeddings[0][I_FIRST]).toBe(1);
    expect(pass.embeddings[1][I_FIRST]).toBe(0);
    expect(pass.embeddings[0][I_ONE]).toBe(1);
    expect(pass.embeddings[0][I_CONTENT]).toBe(1);
    expect(pass.embeddings[0][I_PUNCT]).toBe(0);
    expect(pass.embeddings[4][I_PUNCT]).toBe(1);
    expect(pass.embeddings[4][I_CONTENT]).toBe(0);
    expect(pass.embeddings[0][I_C0]).toBeCloseTo(pass.embeddings[8][I_C0]);
    expect(pass.embeddings[0][I_C1]).toBeCloseTo(pass.embeddings[8][I_C1]);
    const [c0, c1] = charFeatures('猫');
    expect(c0 * c0 + c1 * c1).toBeCloseTo(1);

    expect(nonzeroRows(headById('local').Wq)).toEqual([I_SIN, I_COS]);
    expect(nonzeroRows(headById('local').Wk)).toEqual([I_SIN, I_COS]);
    expect(nonzeroRows(headById('match').Wq)).toEqual([I_C0, I_C1]);
    expect(nonzeroRows(headById('punct').Wq)).toEqual([I_CONTENT]);
    expect(nonzeroRows(headById('punct').Wk)).toEqual([I_PUNCT]);
    expect(nonzeroRows(headById('first').Wq)).toEqual([I_ONE]);
    expect(nonzeroRows(headById('first').Wk)).toEqual([I_FIRST]);

    const local = pass.heads.find((head) => head.id === 'local');
    expect(local).toBeTruthy();
    for (let i = 0; i < pass.tokens.length; i += 1) {
      for (let j = 0; j < pass.tokens.length; j += 1) {
        const expected = LOCAL_SCORE * Math.cos((i - j) * POS_OMEGA);
        expect(local?.scores[i][j]).toBeCloseTo(expected);
        expect(local?.scaled[i][j]).toBeCloseTo(expected * ATTENTION_SCALE);
      }
    }

    const first = headById('first');
    const q = matvec(first.Wq, pass.embeddings[3]);
    expect(pass.heads.find((head) => head.id === 'first')?.q[3][0]).toBeCloseTo(q[0]);
    expect(q[0]).toBeCloseTo(Math.sqrt(FOCUS_SCORE));
  });

  it('specializes the four heads and keeps softmax a real distribution', () => {
    const pass = computeAttention(CAT, false);
    const weightsOf = (id: 'local' | 'match' | 'punct' | 'first') => (
      pass.heads.find((head) => head.id === id)?.weights ?? []
    );
    for (const head of pass.heads) {
      for (const row of head.weights) {
        expect(row.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
        for (const value of row) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(value)).toBe(true);
        }
      }
      const query = 2;
      expect(head.weights[query]).toEqual(softmax(head.scaled[query]));
      for (let dim = 0; dim < D_HEAD; dim += 1) {
        let mixed = 0;
        head.weights[query].forEach((weight, key) => {
          mixed += weight * head.v[key][dim];
        });
        expect(head.context[query][dim]).toBeCloseTo(mixed);
      }
    }

    const match = weightsOf('match');
    expect(match[0][0]).toBeCloseTo(match[0][8]);
    expect(match[0][0]).toBeGreaterThan(match[0][1]);
    expect(match[1][1]).toBeGreaterThan(match[1][0]);

    const punct = weightsOf('punct');
    expect(punct[1][4]).toBeGreaterThan(punct[1][0]);
    expect(punct[1][4]).toBeGreaterThan(punct[1][2]);
    const uniform = 1 / pass.tokens.length;
    punct[4].forEach((weight) => expect(weight).toBeCloseTo(uniform));

    const first = weightsOf('first');
    first.forEach((row) => {
      row.forEach((weight, index) => {
        if (index !== 0) expect(row[0]).toBeGreaterThan(weight);
      });
    });

    const local = weightsOf('local');
    expect(local[4][4]).toBeGreaterThan(local[4][3]);
    expect(local[4][3]).toBeCloseTo(local[4][5]);
    expect(local[4][3]).toBeGreaterThan(local[4][0]);
    expect(local[4][3]).toBeGreaterThan(local[4][8]);

    expect(concatContext(pass, 1)).toHaveLength(D_HEAD * pass.heads.length);
    expect(dot(charFeatures('猫'), charFeatures('猫'))).toBeCloseTo(1);
  });

  it('masks future keys in causal mode before softmax', () => {
    const pass = computeAttention('Attention is all you need.', true);
    expect(pass.tokens.at(-1)?.text).toBe('.');
    const row = pass.heads[0].weights[0];
    expect(row[0]).toBeCloseTo(1);
    expect(row[1]).toBe(0);
    expect(pass.heads[0].scores[0][1]).toBe(Number.NEGATIVE_INFINITY);
    expect(pass.heads[0].scaled[2][4]).toBe(Number.NEGATIVE_INFINITY);
    const last = pass.heads[2].weights[pass.tokens.length - 1];
    expect(last.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);

    const open = computeAttention('Attention is all you need.', false);
    const punct = open.heads.find((head) => head.id === 'punct');
    expect(punct?.weights[0].at(-1) ?? 0).toBeGreaterThan(punct?.weights[0][1] ?? 1);

    const stable = softmax([1000, 0, Number.NEGATIVE_INFINITY]);
    expect(stable[2]).toBe(0);
    expect(stable[0] + stable[1]).toBeCloseTo(1);
    expect(stable[0]).toBeGreaterThan(0.999);
  });

  it('narrates the real argmax in Chinese', () => {
    const pass = computeAttention(CAT, false);
    const match = narrate(pass, 0, 'match', 'softmax');
    expect(match.zh).toContain('同形');
    expect(match.zh).toContain('猫');
    const punct = narrate(pass, 1, 'punct', 'softmax');
    expect(punct.zh).toContain('，');
    expect(punct.zh).toContain('标点');
    const first = narrate(pass, 5, 'first', 'softmax');
    expect(first.zh).toContain('猫');
    expect(sceneCaption(pass, 1, 'all', 'softmax', 'zh')).toContain('标点');
    expect(headFocus('punct', 'zh')).toContain('标点');
    expect(headFocus('local', 'zh')).toContain('cos');
    expect(narrate(computeAttention('', false), 0, 'all', 'tokens').zh.length).toBeGreaterThan(4);
  });
});

describe('attention lab page', () => {
  it('is listed in the README with a screenshot', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toContain('https://pengrunyi.github.io/visual-fx/attention/');
    expect(readme).toContain('docs/screenshots/attention.jpg');
    expect(readme).toContain('注意力实验室');
    expect(readme).toContain('| `/attention/` |');
    const shot = statSync('docs/screenshots/attention.jpg');
    expect(shot.size).toBeGreaterThan(8000);
  });
});
