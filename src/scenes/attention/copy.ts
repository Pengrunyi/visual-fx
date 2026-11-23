import {
  ATTENTION_SCALE,
  D_HEAD,
  D_MODEL,
  FOCUS_SCORE,
  HEAD_IDS,
  HEADS,
  LOCAL_SCORE,
  POS_OMEGA,
  formatNum,
  headById,
  type AttentionPass,
  type HeadId,
  type Token,
} from './attention';

export const STEP_IDS = ['tokens', 'embed', 'qkv', 'scores', 'scale', 'softmax', 'mix'] as const;
export type StepId = (typeof STEP_IDS)[number];

export interface StepCopy {
  id: StepId;
  zh: string;
  en: string;
  shortZh: string;
  shortEn: string;
  formula: string;
  bodyZh: string;
  bodyEn: string;
}

export const STEPS: readonly StepCopy[] = [
  {
    id: 'tokens',
    zh: '分词',
    en: 'Tokens',
    shortZh: '分词',
    shortEn: 'Tokens',
    formula: 'sentence → t1 … tn',
    bodyZh: '注意力不读整句，先切成 token。本页中文按字、英文按单词，标点单独成块，空格只负责把英文词隔开，自己不进计算。这比真实模型的 BPE 简单，是为了让你对着每个字看完后面的乘法。',
    bodyEn: 'Attention reads tokens, not a raw sentence. Chinese splits by character, English by word, and punctuation stands alone. Spaces only separate words. Real models use BPE; this cut keeps every later multiplication visible.',
  },
  {
    id: 'embed',
    zh: '嵌入',
    en: 'Embed',
    shortZh: '嵌入',
    shortEn: 'Embed',
    formula: 'x(i) ∈ R^8',
    bodyZh: '每个 token 写成 8 个数：位置的正弦和余弦、是不是句首、是不是标点、是不是内容、两维由字符算出的字形，再加上一个恒等于 1 的常数。相同的字，字形那两维完全一样。特征是手写的，不是训练出来的词向量；从下一步起，乘法和真实的注意力层相同。',
    bodyEn: 'Each token becomes 8 numbers: sine and cosine of position, flags for first / punctuation / content, two character features, and a constant 1. Identical tokens share the character features. The features are hand-built, not pretrained. From the next step on, the arithmetic matches a real attention layer.',
  },
  {
    id: 'qkv',
    zh: '查询 · 键 · 值',
    en: 'Query · Key · Value',
    shortZh: 'QKV',
    shortEn: 'QKV',
    formula: 'q = x Wq    k = x Wk    v = x Wv',
    bodyZh: '每个头有自己的三套投影矩阵。Q 是「我在找什么」，K 是「我能被怎样找到」，V 是「被选中时我带去的内容」。矩阵乘完还是一组数，这里每个向量 4 维，所以 d_k = 4。四个头会去找不同的东西，因为它们的矩阵不同。',
    bodyEn: 'Each head has its own three matrices. Q is what a token looks for, K is how it can be found, and V is the content it contributes. Each vector has d_k = 4. Heads look for different things because their matrices differ.',
  },
  {
    id: 'scores',
    zh: '分数',
    en: 'Scores',
    shortZh: '分数',
    shortEn: 'Scores',
    formula: 's(i,j) = q(i) · k(j)',
    bodyZh: '查询和每一个键做点积。方向越接近，分数越大；方向相反，分数为负。这一步还没有归一化，所以分数不是概率，一行也不必加总为 1。',
    bodyEn: 'Each query is dotted with every key. Closer directions score higher; opposite directions go negative. These are not probabilities, and a row does not need to sum to 1.',
  },
  {
    id: 'scale',
    zh: '缩放',
    en: 'Scale',
    shortZh: '缩放',
    shortEn: 'Scale',
    formula: 's~(i,j) = s(i,j) / √d_k',
    bodyZh: '点积的幅度会跟着维度涨。除以 √d_k 把分数拉回温和的范围，后面的 Softmax 才不会把几乎全部质量压到最大的那一项。这里 d_k = 4，√4 = 2，所以每个分数都除以 2。',
    bodyEn: 'Dot products grow with dimension. Dividing by √d_k keeps softmax from collapsing onto a single winner. Here d_k = 4, so √4 = 2 and every score is divided by 2.',
  },
  {
    id: 'softmax',
    zh: '权重',
    en: 'Softmax',
    shortZh: '权重',
    shortEn: 'Softmax',
    formula: 'a(i,j) = exp(s~(i,j)) / Σ_j exp(s~(i,j))',
    bodyZh: '先取指数，再除以这一行的总和。权重不会是负数，并且每个查询的一行加起来正好等于 1。分数越高，分到的注意越多。打开「只看左边」时，右边键的分数会在这一步之前换成负无穷，权重就是 0。',
    bodyEn: 'Exponentiate, then divide by the row sum. Weights are never negative, and each query\'s row sums to exactly 1. Higher scores take more of the attention. In past-only mode, future keys are set to negative infinity before this step, so their weight is 0.',
  },
  {
    id: 'mix',
    zh: '加权混合',
    en: 'Mix',
    shortZh: '混合',
    shortEn: 'Mix',
    formula: 'o(i) = Σ_j a(i,j) · v(j)',
    bodyZh: '用权重把各个值向量加起来。权重大的 token，它的 V 占得更多。四个头各自得到 4 个数，拼成 16 维，这就是这一层的输出。标准 Transformer 还会再乘一个输出矩阵 W_O；教学模型把 W_O 设成单位映射，不额外搅在一起。',
    bodyEn: 'The output is a weighted sum of value vectors. Each head produces 4 numbers; concatenating them yields 16, which is this layer\'s output. A full Transformer would still multiply by W_O. Here W_O is the identity, so the mix stays readable.',
  },
];

export function stepById(id: StepId): StepCopy {
  const found = STEPS.find((step) => step.id === id);
  if (!found) throw new Error(`unknown step ${id}`);
  return found;
}

export interface Sample {
  text: string;
  zh: string;
  en: string;
}

export const SAMPLES: readonly Sample[] = [
  { text: '猫追老鼠，老鼠躲猫', zh: '重复的字', en: 'Repeated' },
  { text: '我爱北京天安门。', zh: '一句中文', en: 'Chinese' },
  { text: 'Attention is all you need.', zh: '经典英文', en: 'English' },
  { text: '今天天气真好！', zh: '句末标点', en: 'Punctuation' },
];

export const DEFAULT_SENTENCE = SAMPLES[0].text;

export const FEATURES: readonly { zh: string; en: string }[] = [
  { zh: '位置 sin', en: 'pos sin' },
  { zh: '位置 cos', en: 'pos cos' },
  { zh: '句首', en: 'first' },
  { zh: '标点', en: 'punct' },
  { zh: '内容', en: 'content' },
  { zh: '字形 1', en: 'char 1' },
  { zh: '字形 2', en: 'char 2' },
  { zh: '常数 1', en: 'const 1' },
];

const HEAD_FOCUS: Record<HeadId, { zh: string; en: string }> = {
  local: {
    zh: `Q 和 K 只保留位置的正弦与余弦，长度是 √${LOCAL_SCORE}。分数 = ${LOCAL_SCORE} × cos(位置差 × π/10)。角度差为 0 时最大，所以自己最亮，左右邻居次之。`,
    en: `Q and K keep only sine and cosine of position, with length √${LOCAL_SCORE}. Score = ${LOCAL_SCORE} × cos(Δindex × π/10). Offset 0 is the maximum, so the token itself is brightest and its neighbors come next.`,
  },
  match: {
    zh: `Q 和 K 只保留两维字形，字形被做成单位向量，系数是 √${FOCUS_SCORE}。相同的字点积是 ${FOCUS_SCORE}，不同的字一般更小。`,
    en: `Q and K keep only the two character features, packed as a unit vector and scaled by √${FOCUS_SCORE}. Identical tokens dot to ${FOCUS_SCORE}; different tokens usually score lower.`,
  },
  punct: {
    zh: `Q 只读取「是不是内容」，K 只读取「是不是标点」，系数都是 √${FOCUS_SCORE}。内容词看向标点时点积是 ${FOCUS_SCORE}，否则是 0。这一句若没有标点，整行都是 0，Softmax 变成均匀分配。`,
    en: `Q reads the content flag and K reads the punctuation flag, both scaled by √${FOCUS_SCORE}. A content token looking at punctuation scores ${FOCUS_SCORE}; every other pair scores 0. With no punctuation, the row is all zeros and softmax is uniform.`,
  },
  first: {
    zh: `Q 读取恒为 1 的常数维，K 读取「是不是句首」，系数同样是 √${FOCUS_SCORE}。看向第一个词时点积是 ${FOCUS_SCORE}，看向其他词是 0。`,
    en: `Q reads the constant 1 and K reads the first-token flag, both scaled by √${FOCUS_SCORE}. Looking at the first token scores ${FOCUS_SCORE}; looking anywhere else scores 0.`,
  },
};

export function headFocus(id: HeadId | 'all', lang: 'zh' | 'en'): string {
  if (id === 'all') {
    return lang === 'zh'
      ? '四色光带同时画：青是邻近，琥珀是同形，玫红是标点，紫是句首。点一个头，可以单独看它的矩阵。平均只用于总览，模型真正交出去的是四个头拼起来的向量。'
      : 'Four beams at once: cyan local, amber match, rose punctuation, violet first. Pick one head to read its own matrix. Averages are only an overview; the layer output is the concatenation of the four heads.';
  }
  return HEAD_FOCUS[id][lang];
}

export interface Narration {
  zh: string;
  en: string;
}

function nth(tokens: readonly Token[], index: number, lang: 'zh' | 'en'): string {
  const text = tokens[index]?.text ?? '';
  let total = 0;
  let seen = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].text !== text) continue;
    total += 1;
    if (i <= index) seen += 1;
  }
  if (total <= 1) return lang === 'zh' ? `「${text}」` : `"${text}"`;
  return lang === 'zh' ? `第${seen}个「${text}」` : `"${text}" #${seen}`;
}

function percent(weight: number): string {
  return `${Math.round(weight * 100)}%`;
}

function ranked(row: readonly number[]): { index: number; value: number }[] {
  return row
    .map((value, index) => ({ index, value: Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY }))
    .sort((a, b) => b.value - a.value);
}

function kindZh(kind: Token['kind']): string {
  if (kind === 'han') return '字';
  if (kind === 'word') return '词';
  return '标点';
}

function topLine(pass: AttentionPass, query: number, id: HeadId, lang: 'zh' | 'en', field: 'scores' | 'scaled' | 'weights'): string {
  const head = pass.heads.find((item) => item.id === id);
  const def = headById(id);
  if (!head) return '';
  const row = head[field][query] ?? [];
  const order = ranked(row);
  const best = order[0];
  const second = order[1];
  const name = def[lang === 'zh' ? 'zh' : 'en'];
  const who = nth(pass.tokens, query, lang);
  if (!best || !Number.isFinite(best.value)) {
    return lang === 'zh' ? `${name}：${who}这一行没有可用的分数。` : `${name}: ${who} has no finite scores.`;
  }
  if (field === 'weights') {
    const low = order[order.length - 1]?.value ?? 0;
    if (best.value - low < 0.04) {
      return lang === 'zh'
        ? `${name}：${who}几乎平均分配，每个大约 ${percent(1 / row.length)}。`
        : `${name}: ${who} is almost uniform, about ${percent(1 / row.length)} each.`;
    }
    if (second && second.value >= best.value * 0.85 && second.index !== best.index) {
      return lang === 'zh'
        ? `${name}：${who}主要看着${nth(pass.tokens, best.index, 'zh')}（${percent(best.value)}）和${nth(pass.tokens, second.index, 'zh')}（${percent(second.value)}）。`
        : `${name}: ${who} mainly attends to ${nth(pass.tokens, best.index, 'en')} (${percent(best.value)}) and ${nth(pass.tokens, second.index, 'en')} (${percent(second.value)}).`;
    }
    return lang === 'zh'
      ? `${name}：${who}最注意${nth(pass.tokens, best.index, 'zh')}，权重 ${percent(best.value)}。`
      : `${name}: ${who} attends most to ${nth(pass.tokens, best.index, 'en')}, weight ${percent(best.value)}.`;
  }
  const shown = formatNum(best.value);
  const scaledNote = field === 'scores' ? formatNum(best.value * ATTENTION_SCALE) : shown;
  if (field === 'scores') {
    return lang === 'zh'
      ? `${name}：${who}对${nth(pass.tokens, best.index, 'zh')}的点积最大，是 ${shown}，除以 2 之后是 ${scaledNote}。`
      : `${name}: ${who} dots highest with ${nth(pass.tokens, best.index, 'en')} at ${shown}, which is ${scaledNote} after dividing by 2.`;
  }
  return lang === 'zh'
    ? `${name}：缩放后最大的是${nth(pass.tokens, best.index, 'zh')}，${shown}。`
    : `${name}: after scaling, ${nth(pass.tokens, best.index, 'en')} leads at ${shown}.`;
}

/** One line for the canvas. Long enough to teach, short enough to sit on the light. */
export function sceneCaption(pass: AttentionPass, query: number, head: HeadId | 'all', step: StepId, lang: 'zh' | 'en'): string {
  const { tokens } = pass;
  if (tokens.length === 0) return lang === 'zh' ? '输入一句话' : 'Type a sentence';
  const q = Math.max(0, Math.min(query, tokens.length - 1));
  const numeric = step === 'scores' || step === 'scale' || step === 'softmax' || step === 'mix';
  if (numeric && tokens.length > 1 && head === 'all') {
    const field = step === 'scores' ? 'scores' : step === 'scale' ? 'scaled' : 'weights';
    return HEAD_IDS.map((id) => {
      const result = pass.heads.find((item) => item.id === id);
      const def = headById(id);
      const row = result?.[field][q] ?? [];
      const order = ranked(row);
      const best = order[0];
      const low = order[order.length - 1]?.value ?? 0;
      if (!best) return def[lang === 'zh' ? 'zh' : 'en'];
      const label = def[lang === 'zh' ? 'zh' : 'en'];
      if (field === 'weights' && best.value - low < 0.04) {
        return lang === 'zh' ? `${label} 均匀` : `${label} uniform`;
      }
      const target = nth(tokens, best.index, lang);
      const value = field === 'weights' ? percent(best.value) : formatNum(best.value);
      return `${label} ${target} ${value}`;
    }).join(lang === 'zh' ? ' · ' : ' · ');
  }
  const text = narrate(pass, q, head, step)[lang];
  const line = text.split('\n').find((item) => item.trim().length > 0) ?? text;
  return line.length > 72 ? `${line.slice(0, 71)}…` : line;
}

export function narrate(pass: AttentionPass, query: number, head: HeadId | 'all', step: StepId): Narration {
  const { tokens } = pass;
  if (tokens.length === 0) {
    return {
      zh: '输入一句话，或点一个例子。计算留在这台设备上。',
      en: 'Type a sentence or pick an example. The math stays on this device.',
    };
  }
  const q = Math.max(0, Math.min(query, tokens.length - 1));
  const token = tokens[q];
  if (tokens.length === 1 && (step === 'softmax' || step === 'mix' || step === 'scores' || step === 'scale')) {
    return {
      zh: `只有${nth(tokens, 0, 'zh')}一个 token。它只能注意自己，权重是 1。`,
      en: `Only ${nth(tokens, 0, 'en')}. It can only attend to itself, so the weight is 1.`,
    };
  }
  if (step === 'tokens') {
    const extra = pass.truncated ? ' 后面的内容超出 12 个 token，没有画出来。' : '';
    const extraEn = pass.truncated ? ' Anything past 12 tokens is left out.' : '';
    return {
      zh: `切成 ${tokens.length} 个 token。当前是${nth(tokens, q, 'zh')}，类型是${kindZh(token.kind)}。${extra}`.trim(),
      en: `${tokens.length} tokens. Now on ${nth(tokens, q, 'en')}, a ${token.kind} token.${extraEn}`,
    };
  }
  if (step === 'embed') {
    const vector = pass.embeddings[q] ?? [];
    return {
      zh: `${nth(tokens, q, 'zh')}写成 8 个数：sin ${formatNum(vector[0] ?? 0)}，cos ${formatNum(vector[1] ?? 0)}，句首 ${formatNum(vector[2] ?? 0, 0)}，标点 ${formatNum(vector[3] ?? 0, 0)}，内容 ${formatNum(vector[4] ?? 0, 0)}，字形 ${formatNum(vector[5] ?? 0)} / ${formatNum(vector[6] ?? 0)}，常数 ${formatNum(vector[7] ?? 0, 0)}。`,
      en: `${nth(tokens, q, 'en')} is 8 numbers: sin ${formatNum(vector[0] ?? 0)}, cos ${formatNum(vector[1] ?? 0)}, first ${formatNum(vector[2] ?? 0, 0)}, punct ${formatNum(vector[3] ?? 0, 0)}, content ${formatNum(vector[4] ?? 0, 0)}, char ${formatNum(vector[5] ?? 0)} / ${formatNum(vector[6] ?? 0)}, const ${formatNum(vector[7] ?? 0, 0)}.`,
    };
  }
  if (step === 'qkv') {
    const ids = head === 'all' ? HEAD_IDS : [head];
    const zh = ids.map((id) => {
      const result = pass.heads.find((item) => item.id === id);
      const def = headById(id);
      const qv = result?.q[q] ?? [];
      return `${def.zh} Q [${qv.map((value) => formatNum(value)).join(', ')}]`;
    }).join('\n');
    const en = ids.map((id) => {
      const result = pass.heads.find((item) => item.id === id);
      const def = headById(id);
      const qv = result?.q[q] ?? [];
      return `${def.en} Q [${qv.map((value) => formatNum(value)).join(', ')}]`;
    }).join('\n');
    return {
      zh: `${nth(tokens, q, 'zh')}的查询向量，d_k = ${D_HEAD}。\n${zh}`,
      en: `Query vectors for ${nth(tokens, q, 'en')}, d_k = ${D_HEAD}.\n${en}`,
    };
  }
  const field = step === 'scores' ? 'scores' : step === 'scale' ? 'scaled' : 'weights';
  const ids = head === 'all' ? HEAD_IDS : [head];
  let zh = ids.map((id) => topLine(pass, q, id, 'zh', field)).join('\n');
  let en = ids.map((id) => topLine(pass, q, id, 'en', field)).join('\n');
  if (pass.causal && q < tokens.length - 1 && (step === 'softmax' || step === 'mix' || step === 'scores' || step === 'scale')) {
    zh += '\n右边的键被因果遮罩挡住，权重是 0。';
    en += '\nKeys to the right are causally masked, so their weight is 0.';
  }
  if (step === 'mix') {
    const dims = head === 'all'
      ? pass.heads.reduce((sum, item) => sum + (item.context[q]?.length ?? 0), 0)
      : D_HEAD;
    zh += `\n混合结果是 ${dims} 维（d_model = ${D_MODEL}，四个头拼起来是 ${D_HEAD * HEADS.length} 维）。`;
    en += `\nThe mix has ${dims} dimensions (d_model = ${D_MODEL}; four heads concatenate to ${D_HEAD * HEADS.length}).`;
  }
  return { zh, en };
}

/** Documented constants the page claims out loud. Tests pin the prose to these. */
export const MODEL_FACTS = {
  dModel: D_MODEL,
  dHead: D_HEAD,
  heads: HEADS.length,
  scaleDivisor: 1 / ATTENTION_SCALE,
  posOmega: POS_OMEGA,
  localScore: LOCAL_SCORE,
  focusScore: FOCUS_SCORE,
} as const;
