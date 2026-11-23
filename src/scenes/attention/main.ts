import './attention.css';
import { chrome, getLang, setLang } from '../../lib/i18n';
import { startLoop, toast } from '../../lib/loop';
import { SITE_BASE } from '../../lib/site';
import { copyText, pageUrl } from '../../lib/url';
import {
  HEADS,
  computeAttention,
  concatContext,
  formatNum,
  headById,
  meanVectors,
  type AttentionPass,
  type HeadId,
} from './attention';
import {
  FEATURES,
  SAMPLES,
  STEPS,
  DEFAULT_SENTENCE,
  headFocus,
  narrate,
  sceneCaption,
  stepById,
  type StepId,
} from './copy';

const stage = document.querySelector<HTMLCanvasElement>('#stage');
const app = document.querySelector<HTMLElement>('#app');
if (!stage || !app) throw new Error('missing attention nodes');
const ctx = stage.getContext('2d');
if (!ctx) throw new Error('2d context unavailable');

const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","WenQuanYi Micro Hei",sans-serif';
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const copy = {
  zh: {
    lede: '点一个词，看光投向谁。',
    ledeSub: 'Tap a token and watch where the light lands.',
    sentence: '句子 · Sentence',
    placeholder: '输入一句中文或英文',
    prev: '上一步',
    next: '下一步',
    play: '播放',
    pause: '暂停',
    both: '双向',
    past: '只看左边',
    more: '矩阵和数字',
    foot: '手写投影 · 本地计算 · 不是预训练模型。中文按字，英文按词，标点单独，最多 12 个 token。',
    matrixAll: '格子是四个头的平均，只作总览。点一个头看它自己的矩阵。遮罩显示为 · 。',
    matrixOne: '这一头自己的矩阵。遮罩显示为 · 。',
  },
  en: {
    lede: 'Tap a token and watch where the light lands.',
    ledeSub: '点一个词，看光投向谁。',
    sentence: 'Sentence · 句子',
    placeholder: 'Type Chinese or English',
    prev: 'Back',
    next: 'Next',
    play: 'Play',
    pause: 'Pause',
    both: 'Both ways',
    past: 'Past only',
    more: 'Matrix and numbers',
    foot: 'Hand-built projections, computed locally, not a pretrained model. Chinese is split by character, English by word, punctuation alone, 12 tokens max.',
    matrixAll: 'Cells average the four heads, as an overview only. Pick a head for its own matrix. Masks show as · .',
    matrixOne: 'This head\'s own matrix. Masks show as · .',
  },
} as const;

interface Orb {
  x: number;
  y: number;
  r: number;
  index: number;
}

interface Mote {
  from: number;
  to: number;
  head: number;
  bow: number;
  t: number;
  speed: number;
  size: number;
}

const state = {
  text: DEFAULT_SENTENCE,
  step: 'softmax' as StepId,
  query: 1,
  hover: null as number | null,
  head: 'all' as HeadId | 'all',
  causal: false,
  playing: false,
  lang: getLang(),
};

let pass: AttentionPass = computeAttention(state.text, state.causal);
let playClock = 0;
let tokenKey = '';
const orbs: Orb[] = [];
const motes: Mote[] = [];
const stars = Array.from({ length: 64 }, () => ({
  x: Math.random(),
  y: Math.random(),
  r: Math.random() * 1.25 + 0.25,
  p: Math.random() * Math.PI * 2,
  warm: Math.random() > 0.62,
}));

const ui = build();
paint();
resize();
draw(0);

startLoop((dt, time) => {
  if (state.playing && pass.tokens.length > 0) {
    playClock += dt;
    if (playClock >= 1.75) {
      playClock = 0;
      advance();
    }
  }
  if (!reduced) driftMotes(dt);
  draw(time);
});

window.addEventListener('resize', resize);
stage.addEventListener('pointerdown', (event) => {
  const index = hitOrb(event);
  if (index === null) return;
  lockQuery(index);
});
stage.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch') return;
  const index = hitOrb(event);
  if (index === state.hover) return;
  state.hover = index;
  paint();
});
stage.addEventListener('pointerleave', () => {
  if (state.hover === null) return;
  state.hover = null;
  paint();
});
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key === 'ArrowRight') nudgeQuery(1);
  else if (event.key === 'ArrowLeft') nudgeQuery(-1);
  else if (event.key === 'ArrowDown') nudgeStep(1);
  else if (event.key === 'ArrowUp') nudgeStep(-1);
  else if (event.key === ' ') {
    event.preventDefault();
    togglePlay();
  }
});

function build() {
  app!.replaceChildren();
  const top = document.createElement('header');
  top.className = 'top';
  top.id = 'top';
  const nav = document.createElement('div');
  nav.className = 'nav';
  const home = document.createElement('a');
  home.className = 'linkish';
  home.href = SITE_BASE;
  const navActions = document.createElement('div');
  navActions.className = 'nav-actions';
  const lang = document.createElement('button');
  lang.type = 'button';
  lang.className = 'linkish';
  lang.addEventListener('click', () => {
    state.lang = state.lang === 'zh' ? 'en' : 'zh';
    setLang(state.lang);
    paint();
  });
  const share = document.createElement('button');
  share.type = 'button';
  share.className = 'linkish';
  share.addEventListener('click', () => {
    const strings = chrome[state.lang];
    void copyText(pageUrl('/attention/')).then((ok) => {
      toast(ok ? strings.copied : strings.copyFail);
    });
  });
  navActions.append(lang, share);
  nav.append(home, navActions);

  const brand = document.createElement('h1');
  brand.className = 'brand';
  brand.append(document.createTextNode('注意力实验室'));
  const brandEn = document.createElement('span');
  brandEn.textContent = 'Attention Lab';
  brand.append(brandEn);
  const lede = document.createElement('p');
  lede.className = 'lede';
  const dims = document.createElement('p');
  dims.className = 'dims';
  dims.textContent = 'd_model = 8 · d_k = 4 · 4 heads · ÷ √4 = 2';
  top.append(nav, brand, lede, dims);

  const dock = document.createElement('section');
  dock.className = 'dock';
  dock.id = 'dock';
  const narrateNode = document.createElement('p');
  narrateNode.className = 'narrate';
  const field = document.createElement('label');
  field.className = 'field';
  const fieldLabel = document.createElement('span');
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 48;
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.spellcheck = false;
  input.value = state.text;
  input.addEventListener('input', () => {
    state.text = input.value;
    state.playing = false;
    recompute();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) input.blur();
  });
  field.append(fieldLabel, input);

  const samples = document.createElement('div');
  samples.className = 'samples';
  const tokens = document.createElement('div');
  tokens.className = 'tokens';
  const transport = document.createElement('div');
  transport.className = 'row';
  const prev = button('', () => nudgeStep(-1));
  const play = button('', togglePlay);
  play.classList.add('primary');
  const next = button('', () => nudgeStep(1));
  const causal = button('', () => {
    state.causal = !state.causal;
    state.playing = false;
    recompute();
  });
  transport.append(prev, play, next, causal);

  const steps = document.createElement('div');
  steps.className = 'steps';
  steps.setAttribute('role', 'tablist');
  const explain = document.createElement('article');
  explain.className = 'explain';
  const stepTitle = document.createElement('h2');
  const formula = document.createElement('p');
  formula.className = 'formula';
  const body = document.createElement('p');
  explain.append(stepTitle, formula, body);
  const focus = document.createElement('p');
  focus.className = 'focus';
  const heads = document.createElement('div');
  heads.className = 'heads';
  const strip = document.createElement('div');
  strip.className = 'strip';

  const more = document.createElement('details');
  more.className = 'more';
  more.open = false;
  const summary = document.createElement('summary');
  const matrixNote = document.createElement('p');
  matrixNote.className = 'matrix-note';
  const matrixScroll = document.createElement('div');
  matrixScroll.className = 'matrix-scroll';
  const matrix = document.createElement('div');
  matrix.className = 'matrix';
  matrixScroll.append(matrix);
  const tableScroll = document.createElement('div');
  tableScroll.className = 'table-scroll';
  const table = document.createElement('div');
  tableScroll.append(table);
  const foot = document.createElement('p');
  foot.className = 'foot';
  more.append(summary, matrixNote, matrixScroll, tableScroll);
  dock.append(narrateNode, field, samples, tokens, transport, steps, explain, focus, heads, strip, more, foot);

  app!.append(top, dock);
  return {
    home, lang, share, lede, fieldLabel, input, narrate: narrateNode, samples, tokens, prev, play, next, causal,
    steps, stepTitle, formula, body, focus, heads, strip, summary, matrixNote, matrix, table, foot,
  };
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.addEventListener('click', onClick);
  return node;
}

function recompute() {
  pass = computeAttention(state.text, state.causal);
  if (pass.tokens.length === 0) state.query = 0;
  else if (state.query >= pass.tokens.length) state.query = pass.tokens.length - 1;
  state.hover = null;
  motes.length = 0;
  paint();
}

function activeQuery(): number {
  if (state.hover !== null && state.hover < pass.tokens.length) return state.hover;
  if (pass.tokens.length === 0) return 0;
  return Math.max(0, Math.min(state.query, pass.tokens.length - 1));
}

function lockQuery(index: number) {
  state.query = index;
  state.hover = null;
  state.playing = false;
  paint();
  const node = ui.tokens.children[index];
  if (node instanceof HTMLElement) {
    const left = node.offsetLeft;
    const right = left + node.offsetWidth;
    if (left < ui.tokens.scrollLeft) ui.tokens.scrollLeft = Math.max(0, left - 8);
    else if (right > ui.tokens.scrollLeft + ui.tokens.clientWidth) {
      ui.tokens.scrollLeft = right - ui.tokens.clientWidth + 8;
    }
  }
}

function nudgeQuery(delta: number) {
  if (pass.tokens.length === 0) return;
  state.playing = false;
  state.hover = null;
  state.query = (activeQuery() + delta + pass.tokens.length) % pass.tokens.length;
  paint();
}

function nudgeStep(delta: number) {
  state.playing = false;
  const index = STEPS.findIndex((step) => step.id === state.step);
  const next = Math.max(0, Math.min(STEPS.length - 1, index + delta));
  state.step = STEPS[next].id;
  paint();
}

function togglePlay() {
  state.playing = !state.playing;
  playClock = 0;
  paint();
}

function advance() {
  const index = STEPS.findIndex((step) => step.id === state.step);
  if (index < STEPS.length - 1) state.step = STEPS[index + 1].id;
  else if (pass.tokens.length > 0) state.query = (state.query + 1) % pass.tokens.length;
  paint();
}

function paint() {
  const lang = state.lang;
  const strings = copy[lang];
  const chromeStrings = chrome[lang];
  const query = activeQuery();
  const step = stepById(state.step);
  const said = narrate(pass, query, state.head, state.step);

  ui.home.textContent = chromeStrings.home;
  ui.lang.textContent = chromeStrings.lang;
  ui.share.textContent = lang === 'zh' ? '复制链接' : 'Copy link';
  ui.lede.replaceChildren(document.createTextNode(strings.lede));
  const ledeSub = document.createElement('span');
  ledeSub.textContent = strings.ledeSub;
  ui.lede.append(ledeSub);
  ui.fieldLabel.textContent = strings.sentence;
  ui.input.placeholder = strings.placeholder;
  if (document.activeElement !== ui.input && ui.input.value !== state.text) ui.input.value = state.text;
  ui.prev.textContent = strings.prev;
  ui.play.textContent = state.playing ? strings.pause : strings.play;
  ui.play.setAttribute('aria-pressed', state.playing ? 'true' : 'false');
  ui.next.textContent = strings.next;
  ui.causal.textContent = state.causal ? strings.past : strings.both;
  ui.causal.setAttribute('aria-pressed', state.causal ? 'true' : 'false');
  ui.summary.textContent = strings.more;
  ui.foot.textContent = strings.foot;
  ui.matrixNote.textContent = state.head === 'all' ? strings.matrixAll : strings.matrixOne;

  ui.narrate.replaceChildren();
  const overview = state.head === 'all' && (state.step === 'scores' || state.step === 'scale' || state.step === 'softmax' || state.step === 'mix');
  ui.narrate.hidden = overview;
  const primaryText = lang === 'zh' ? said.zh : said.en;
  const secondaryText = lang === 'zh' ? said.en : said.zh;
  ui.narrate.append(document.createTextNode(primaryText));
  const sub = document.createElement('span');
  sub.className = 'sub';
  sub.textContent = secondaryText;
  ui.narrate.append(sub);

  ui.stepTitle.replaceChildren();
  ui.stepTitle.append(document.createTextNode(lang === 'zh' ? step.zh : step.en));
  const stepSub = document.createElement('span');
  stepSub.className = 'sub';
  stepSub.textContent = lang === 'zh' ? step.en : step.zh;
  ui.stepTitle.append(stepSub);
  ui.formula.textContent = step.formula;
  ui.body.replaceChildren();
  ui.body.append(document.createTextNode(lang === 'zh' ? step.bodyZh : step.bodyEn));
  const bodySub = document.createElement('span');
  bodySub.className = 'sub';
  bodySub.textContent = lang === 'zh' ? step.bodyEn : step.bodyZh;
  ui.body.append(bodySub);
  ui.focus.textContent = headFocus(state.head, lang);
  stage!.setAttribute('aria-label', sceneCaption(pass, query, state.head, state.step, lang));

  renderSamples();
  renderTokens(query);
  renderSteps();
  renderHeads();
  renderStrip(query);
  renderMatrix(query);
  renderTable(query);
}

function renderSamples() {
  ui.samples.replaceChildren();
  SAMPLES.forEach((sample) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'sample';
    if (sample.text === state.text) node.classList.add('on');
    node.textContent = state.lang === 'zh' ? sample.zh : sample.en;
    node.addEventListener('click', () => {
      state.text = sample.text;
      state.query = 1;
      state.playing = false;
      ui.input.value = sample.text;
      recompute();
    });
    ui.samples.append(node);
  });
}

function renderTokens(query: number) {
  const key = pass.tokens.map((token) => token.text).join('\u0001');
  if (key !== tokenKey) {
    tokenKey = key;
    ui.tokens.replaceChildren();
    pass.tokens.forEach((token, index) => {
      const node = document.createElement('button');
      node.type = 'button';
      node.className = 'chip';
      node.textContent = token.text;
      node.addEventListener('pointerenter', (event) => {
        if (event.pointerType === 'touch') return;
        if (state.hover === index) return;
        state.hover = index;
        paint();
      });
      node.addEventListener('pointerleave', (event) => {
        if (event.pointerType === 'touch') return;
        if (state.hover !== index) return;
        state.hover = null;
        paint();
      });
      node.addEventListener('click', () => lockQuery(index));
      ui.tokens.append(node);
    });
  }
  Array.from(ui.tokens.children).forEach((node, index) => {
    node.classList.toggle('on', index === query);
    node.setAttribute('aria-pressed', index === state.query ? 'true' : 'false');
  });
}

function renderSteps() {
  ui.steps.replaceChildren();
  STEPS.forEach((step) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'step';
    node.setAttribute('role', 'tab');
    node.setAttribute('aria-selected', step.id === state.step ? 'true' : 'false');
    if (step.id === state.step) node.classList.add('on');
    node.textContent = state.lang === 'zh' ? step.shortZh : step.shortEn;
    node.addEventListener('click', () => {
      state.step = step.id;
      state.playing = false;
      paint();
    });
    ui.steps.append(node);
  });
}

function renderHeads() {
  ui.heads.replaceChildren();
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'head';
  if (state.head === 'all') all.classList.add('on');
  all.style.background = state.head === 'all' ? '#f2f5ff' : '';
  all.textContent = state.lang === 'zh' ? '全部' : 'All';
  all.addEventListener('click', () => {
    state.head = 'all';
    paint();
  });
  ui.heads.append(all);
  HEADS.forEach((head) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'head';
    const dot = document.createElement('i');
    dot.className = 'swatch';
    dot.style.background = head.color;
    dot.style.color = head.color;
    node.append(dot, document.createTextNode(state.lang === 'zh' ? head.zh : head.en));
    if (state.head === head.id) {
      node.classList.add('on');
      node.style.background = head.color;
    }
    node.addEventListener('click', () => {
      state.head = head.id;
      paint();
    });
    ui.heads.append(node);
  });
}

function selectedHeads(): HeadId[] {
  return state.head === 'all' ? HEADS.map((head) => head.id) : [state.head];
}

function rowFor(id: HeadId, query: number, field: 'scores' | 'scaled' | 'weights'): number[] {
  const head = pass.heads.find((item) => item.id === id);
  return head?.[field][query] ?? [];
}

function overviewRow(query: number, field: 'scores' | 'scaled' | 'weights'): number[] {
  if (state.head !== 'all') return rowFor(state.head, query, field);
  const rows = pass.heads.map((head) => head[field][query] ?? []);
  return meanVectors(rows);
}

function stripNumber(query: number, index: number): string {
  const token = pass.tokens[index];
  if (!token) return '';
  if (state.step === 'tokens') {
    if (state.lang === 'zh') return token.kind === 'han' ? '字' : token.kind === 'word' ? '词' : '标点';
    return token.kind;
  }
  if (state.step === 'embed') return formatNum(pass.embeddings[query]?.[index] ?? 0);
  const field = state.step === 'scores' ? 'scores' : state.step === 'scale' ? 'scaled' : 'weights';
  const value = overviewRow(query, field)[index];
  if (!Number.isFinite(value)) return '·';
  if (field === 'weights') return `${Math.round(value * 100)}%`;
  return formatNum(value);
}

function renderStrip(query: number) {
  ui.strip.replaceChildren();
  if (pass.tokens.length === 0) return;
  if (state.step === 'embed') {
    FEATURES.forEach((feature, index) => {
      const card = document.createElement('div');
      card.className = 'cell-card';
      const name = document.createElement('strong');
      name.textContent = state.lang === 'zh' ? feature.zh : feature.en;
      const value = document.createElement('em');
      value.textContent = formatNum(pass.embeddings[query]?.[index] ?? 0);
      card.append(name, value);
      ui.strip.append(card);
    });
    return;
  }
  if (state.step === 'qkv') {
    selectedHeads().forEach((id) => {
      const head = pass.heads.find((item) => item.id === id);
      const def = headById(id);
      (['Q', 'K', 'V'] as const).forEach((letter) => {
        const vector = letter === 'Q' ? head?.q[query] : letter === 'K' ? head?.k[query] : head?.v[query];
        const card = document.createElement('div');
        card.className = 'cell-card';
        const name = document.createElement('strong');
        name.textContent = `${state.lang === 'zh' ? def.zh : def.en} ${letter}`;
        const value = document.createElement('em');
        value.textContent = (vector ?? []).map((item) => formatNum(item)).join(' ');
        card.append(name, value);
        ui.strip.append(card);
      });
    });
    return;
  }
  if (state.head === 'all') {
    const field = matrixField();
    HEADS.forEach((def) => {
      const row = rowFor(def.id, query, field);
      let best = 0;
      for (let index = 1; index < row.length; index += 1) {
        const next = Number.isFinite(row[index]) ? row[index] : Number.NEGATIVE_INFINITY;
        const current = Number.isFinite(row[best]) ? row[best] : Number.NEGATIVE_INFINITY;
        if (next > current) best = index;
      }
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'cell-card';
      card.style.borderColor = def.color;
      const name = document.createElement('strong');
      name.textContent = `${state.lang === 'zh' ? def.zh : def.en} → ${pass.tokens[best]?.text ?? ''}`;
      const value = document.createElement('em');
      const shown = row[best] ?? 0;
      value.textContent = field === 'weights' ? `${Math.round(shown * 100)}%` : formatNum(shown);
      card.append(name, value);
      card.addEventListener('click', () => {
        state.head = def.id;
        state.playing = false;
        paint();
      });
      ui.strip.append(card);
    });
    return;
  }
  pass.tokens.forEach((token, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'cell-card';
    if (index === query) card.classList.add('self');
    const name = document.createElement('strong');
    name.textContent = token.text;
    const value = document.createElement('em');
    value.textContent = stripNumber(query, index);
    card.append(name, value);
    card.addEventListener('click', () => lockQuery(index));
    ui.strip.append(card);
  });
}

function matrixField(): 'scores' | 'scaled' | 'weights' {
  if (state.step === 'scores') return 'scores';
  if (state.step === 'scale') return 'scaled';
  return 'weights';
}

function renderMatrix(query: number) {
  const n = pass.tokens.length;
  ui.matrix.replaceChildren();
  if (n === 0) return;
  const field = matrixField();
  const color = state.head === 'all' ? '#d7e7ff' : headById(state.head).color;
  ui.matrix.style.gridTemplateColumns = `auto repeat(${n}, minmax(32px, 1fr))`;
  const corner = document.createElement('div');
  corner.className = 'h';
  ui.matrix.append(corner);
  pass.tokens.forEach((token) => {
    const label = document.createElement('div');
    label.className = 'h';
    label.textContent = token.text;
    ui.matrix.append(label);
  });
  for (let row = 0; row < n; row += 1) {
    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'h rh';
    label.textContent = pass.tokens[row].text;
    if (row === query) label.classList.add('query');
    label.addEventListener('click', () => lockQuery(row));
    ui.matrix.append(label);
    const values = state.head === 'all'
      ? meanVectors(pass.heads.map((head) => head[field][row] ?? []))
      : (pass.heads.find((head) => head.id === state.head)?.[field][row] ?? []);
    let maxAbs = 0;
    for (const value of values) if (Number.isFinite(value)) maxAbs = Math.max(maxAbs, Math.abs(value));
    values.forEach((value) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      if (row === query) cell.classList.add('query');
      cell.style.background = cellColor(value, maxAbs, field === 'weights' ? 'weight' : 'score', color);
      cell.textContent = Number.isFinite(value) ? formatNum(value, n > 8 ? 1 : 2) : '·';
      cell.addEventListener('click', () => lockQuery(row));
      ui.matrix.append(cell);
    });
  }
}

function renderTable(query: number) {
  ui.table.replaceChildren();
  if (pass.tokens.length === 0) return;
  const table = document.createElement('table');
  const head = document.createElement('tr');
    const columns = state.head === 'all'
    ? [state.lang === 'zh' ? '词' : 'token', ...HEADS.map((item) => (state.lang === 'zh' ? item.zh : item.en))]
    : [
      'token',
      state.lang === 'zh' ? '分数' : 'score',
      state.lang === 'zh' ? '缩放' : 'scaled',
      state.lang === 'zh' ? '权重' : 'weight',
    ];
  columns.forEach((label) => {
    const cell = document.createElement('th');
    cell.textContent = label;
    head.append(cell);
  });
  table.append(head);
  pass.tokens.forEach((token, index) => {
    const row = document.createElement('tr');
    if (index === query) row.classList.add('query');
    const name = document.createElement('td');
    name.textContent = token.text;
    row.append(name);
    if (state.head === 'all') {
      const field = matrixField();
      HEADS.forEach((item) => {
        const cell = document.createElement('td');
        const value = pass.heads.find((head) => head.id === item.id)?.[field][query]?.[index];
        cell.textContent = formatNum(value ?? 0);
        row.append(cell);
      });
    } else {
      const chosen = pass.heads.find((item) => item.id === state.head);
      [chosen?.scores[query]?.[index], chosen?.scaled[query]?.[index], chosen?.weights[query]?.[index]].forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = formatNum(value ?? 0);
        row.append(cell);
      });
    }
    table.append(row);
  });
  ui.table.append(table);

  if (state.step === 'mix' || state.step === 'qkv') {
    const note = document.createElement('p');
    note.className = 'vec';
    const lines = selectedHeads().map((id) => {
      const def = headById(id);
      const vector = state.step === 'mix'
        ? pass.heads.find((item) => item.id === id)?.context[query] ?? []
        : pass.heads.find((item) => item.id === id)?.q[query] ?? [];
      const label = state.lang === 'zh' ? def.zh : def.en;
      const what = state.step === 'mix' ? 'o' : 'Q';
      return `${label} ${what} [${vector.map((value) => formatNum(value)).join(', ')}]`;
    });
    if (state.step === 'mix' && state.head === 'all') {
      const joined = concatContext(pass, query).map((value) => formatNum(value)).join(', ');
      lines.push(`${state.lang === 'zh' ? '拼接' : 'concat'} [${joined}]`);
    }
    note.textContent = lines.join('\n');
    note.style.whiteSpace = 'pre-line';
    ui.table.append(note);
  }
}

function cellColor(value: number, maxAbs: number, mode: 'score' | 'weight', color: string): string {
  if (!Number.isFinite(value)) return 'rgba(255,255,255,0.04)';
  if (mode === 'score') {
    if (maxAbs === 0) return 'rgba(255,255,255,0.06)';
    const t = value / maxAbs;
    return t >= 0
      ? `rgba(255, 177, 90, ${(0.14 + t * 0.8).toFixed(3)})`
      : `rgba(110, 150, 255, ${(0.14 + -t * 0.8).toFixed(3)})`;
  }
  return rgba(color, 0.08 + Math.min(1, Math.max(0, value)) * 0.88);
}

function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  stage!.width = Math.floor(width * dpr);
  stage!.height = Math.floor(height * dpr);
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
}

interface Band { top: number; bottom: number; left: number; right: number }

function artBand(): Band {
  const topRect = document.querySelector('#top')?.getBoundingClientRect();
  const dockRect = document.querySelector('#dock')?.getBoundingClientRect();
  const width = window.innerWidth;
  const height = window.innerHeight;
  let top = (topRect?.bottom ?? 88) + 8;
  let bottom = height - 12;
  let left = 20;
  let right = width - 20;
  if (dockRect && dockRect.width > 0) {
    const onLeft = dockRect.right < width * 0.62 && dockRect.top < height * 0.4 && dockRect.height > height * 0.45;
    if (onLeft) left = dockRect.right + 24;
    else bottom = Math.min(bottom, dockRect.top - 8);
  }
  if (bottom - top < 120) {
    top = Math.max(72, height * 0.16);
    bottom = Math.max(top + 120, height * 0.5);
  }
  return { top, bottom, left, right };
}

function layoutOrbs(band: Band, n: number): void {
  orbs.length = 0;
  if (n === 0) return;
  const captionH = 46;
  const usableW = Math.max(80, band.right - band.left);
  const usableH = Math.max(80, band.bottom - band.top - captionH);
  const rawGap = n === 1 ? 0 : usableW / (n - 1);
  const gap = Math.min(rawGap, 86);
  const total = gap * Math.max(0, n - 1);
  const start = band.left + (usableW - total) / 2;
  const radius = Math.max(12, Math.min(22, n === 1 ? 22 : gap * 0.28));
  const mid = band.top + usableH * 0.58;
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const lift = Math.sin(t * Math.PI) * Math.min(34, usableH * 0.16);
    orbs.push({ x: start + gap * i, y: mid - lift, r: radius, index: i });
  }
}

function draw(time: number) {
  const context = ctx!;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const band = artBand();
  layoutOrbs(band, pass.tokens.length);

  const sky = context.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#08101c');
  sky.addColorStop(0.42, '#0a1222');
  sky.addColorStop(1, '#05060d');
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = sky;
  context.fillRect(0, 0, width, height);
  bloom(context, width * 0.2, band.top, 220, 'rgba(122, 240, 255, 0.09)');
  bloom(context, width * 0.82, height * 0.72, 260, 'rgba(255, 177, 90, 0.07)');

  for (const star of stars) {
    const flicker = reduced ? 0.7 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time * 1.4 + star.p));
    context.fillStyle = star.warm ? `rgba(255, 196, 140, ${0.35 * flicker})` : `rgba(190, 220, 255, ${0.45 * flicker})`;
    context.fillRect(star.x * width, star.y * height, star.r, star.r);
  }

  if (pass.tokens.length === 0) {
    drawEmpty(context, band);
    return;
  }

  const query = activeQuery();
  const queryOrb = orbs[query];
  if (queryOrb) {
    bloom(context, queryOrb.x, queryOrb.y, 150, 'rgba(122, 240, 255, 0.14)');
  }

  if (state.step === 'tokens') drawThread(context);
  else if (state.step === 'embed') drawSatellites(context, query, time);
  else drawBeams(context, query);

  if (!reduced && (state.step === 'softmax' || state.step === 'mix')) drawMotes(context);

  orbs.forEach((orb, index) => {
    const bob = reduced ? 0 : Math.sin(time * 1.25 + index * 0.7) * 2.2;
    drawOrb(context, { ...orb, y: orb.y + bob }, index === query, weightOf(query, index));
  });

  if (state.step === 'scale' && queryOrb) {
    context.save();
    context.font = `600 13px ${FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'bottom';
    context.fillStyle = '#d7ecff';
    context.shadowColor = 'rgba(0,0,0,0.8)';
    context.shadowBlur = 8;
    context.fillText('÷ √4 = 2', queryOrb.x, queryOrb.y - queryOrb.r - 10);
    context.restore();
  }

  drawLegend(context, band);
  drawCaption(context, band);
}

function hitOrb(event: PointerEvent): number | null {
  const rect = stage!.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  let best = -1;
  let bestDist = Infinity;
  orbs.forEach((orb) => {
    const dist = Math.hypot(orb.x - x, orb.y - y);
    if (dist <= orb.r + 22 && dist < bestDist) {
      best = orb.index;
      bestDist = dist;
    }
  });
  return best >= 0 ? best : null;
}

function drawLegend(context: CanvasRenderingContext2D, band: Band) {
  context.save();
  context.font = `12px ${FONT}`;
  context.textBaseline = 'middle';
  context.textAlign = 'left';
  context.shadowColor = 'rgba(0,0,0,0.85)';
  context.shadowBlur = 8;
  let x = band.left;
  const y = band.top + 10;
  HEADS.forEach((head) => {
    if (x > band.right - 36) return;
    context.fillStyle = head.color;
    context.beginPath();
    context.arc(x + 4, y, 4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e7eefc';
    const label = state.lang === 'zh' ? head.zh : head.en;
    context.fillText(label, x + 12, y);
    x += 18 + context.measureText(label).width + 10;
  });
  context.restore();
}

function drawEmpty(context: CanvasRenderingContext2D, band: Band) {
  context.save();
  context.font = `15px ${FONT}`;
  context.fillStyle = '#c9d4ea';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(state.lang === 'zh' ? '输入一句话，光会从这里长出来' : 'Type a sentence and the light appears here', (band.left + band.right) / 2, (band.top + band.bottom) / 2);
  context.restore();
}

function drawThread(context: CanvasRenderingContext2D) {
  if (orbs.length < 2) return;
  context.save();
  context.strokeStyle = 'rgba(214, 226, 255, 0.35)';
  context.lineWidth = 1.25;
  context.beginPath();
  orbs.forEach((orb, index) => {
    if (index === 0) context.moveTo(orb.x, orb.y);
    else context.lineTo(orb.x, orb.y);
  });
  context.stroke();
  context.restore();
}

function drawSatellites(context: CanvasRenderingContext2D, query: number, time: number) {
  const orb = orbs[query];
  const vector = pass.embeddings[query];
  if (!orb || !vector) return;
  context.save();
  vector.forEach((value, index) => {
    const angle = (reduced ? 0 : time * 0.35) + (index / vector.length) * Math.PI * 2;
    const radius = orb.r + 26;
    const x = orb.x + Math.cos(angle) * radius;
    const y = orb.y + Math.sin(angle) * radius * 0.72;
    context.fillStyle = value >= 0 ? rgba('#7af0ff', 0.35 + Math.min(1, Math.abs(value)) * 0.6) : rgba('#ff6b9a', 0.35 + Math.min(1, Math.abs(value)) * 0.6);
    context.beginPath();
    context.arc(x, y, 2.4 + Math.min(4, Math.abs(value) * 2.2), 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

function beamAmount(value: number, maxAbs: number, field: 'scores' | 'scaled' | 'weights'): number {
  if (!Number.isFinite(value)) return 0;
  if (field === 'weights') return Math.max(0, value);
  if (maxAbs === 0) return 0;
  return Math.abs(value) / maxAbs;
}

function bowFor(headIndex: number, amount: number): number {
  const spread = state.head === 'all' ? 14 + headIndex * 28 : 54;
  return spread + amount * 34;
}

function drawBeams(context: CanvasRenderingContext2D, query: number) {
  const heads = state.head === 'all' ? HEADS.map((_, index) => index) : [HEADS.findIndex((head) => head.id === state.head)];
  const field = state.step === 'scores' || state.step === 'qkv' ? 'scores' : state.step === 'scale' ? 'scaled' : 'weights';
  const arcs: { from: Orb; to: Orb; bow: number; color: string; amount: number }[] = [];
  heads.forEach((headIndex) => {
    const head = pass.heads[headIndex];
    const def = HEADS[headIndex];
    if (!head) return;
    const row = head[field][query] ?? [];
    let maxAbs = 0;
    for (const value of row) if (Number.isFinite(value)) maxAbs = Math.max(maxAbs, Math.abs(value));
    row.forEach((value, key) => {
      if (key === query || !Number.isFinite(value)) return;
      const from = orbs[query];
      const to = orbs[key];
      if (!from || !to) return;
      const amount = beamAmount(value, maxAbs, field);
      if (amount < 0.05) return;
      const color = field === 'weights' ? def.color : value >= 0 ? '#ffb15a' : '#8eb4ff';
      arcs.push({ from, to, bow: bowFor(headIndex, amount), color, amount });
    });
    const self = row[query];
    const orb = orbs[query];
    if (orb && Number.isFinite(self)) {
      const amount = beamAmount(self, maxAbs, field);
      context.save();
      context.shadowColor = def.color;
      context.shadowBlur = 12 + amount * 16;
      context.strokeStyle = rgba(def.color, 0.35 + amount * 0.65);
      context.lineWidth = 2 + amount * 6;
      context.beginPath();
      context.arc(orb.x, orb.y, orb.r + 8 + headIndex * 4.5, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
  });
  arcs.sort((a, b) => a.amount - b.amount);
  context.save();
  context.globalCompositeOperation = 'lighter';
  context.lineCap = 'round';
  for (const arc of arcs) {
    strokeBeam(context, arc.from, arc.to, arc.bow, arc.color, 0.12 + arc.amount * 0.28, 8 + arc.amount * 26);
    strokeBeam(context, arc.from, arc.to, arc.bow, arc.color, 0.55 + arc.amount * 0.45, 1.6 + arc.amount * 4.5);
  }
  context.restore();
}

function strokeBeam(
  context: CanvasRenderingContext2D,
  from: Orb,
  to: Orb,
  bow: number,
  color: string,
  alpha: number,
  width: number,
) {
  const control = controlOf(from, to, bow);
  context.strokeStyle = color.startsWith('#') ? rgba(color, alpha) : color;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.quadraticCurveTo(control.x, control.y, to.x, to.y);
  context.stroke();
}

function controlOf(from: Orb, to: Orb, bow: number): { x: number; y: number } {
  return { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - bow };
}

function weightOf(query: number, index: number): number {
  if (state.step !== 'softmax' && state.step !== 'mix') return index === query ? 1 : 0.55;
  const row = overviewRow(query, 'weights');
  return row[index] ?? 0;
}

function drawOrb(context: CanvasRenderingContext2D, orb: Orb, active: boolean, weight: number) {
  const radius = orb.r * (active ? 1.16 : 1);
  const alpha = active ? 1 : 0.42 + Math.min(0.58, weight * 1.3);
  context.save();
  context.globalAlpha = alpha;
  const glow = context.createRadialGradient(orb.x, orb.y, radius * 0.2, orb.x, orb.y, radius * 2.4);
  glow.addColorStop(0, 'rgba(255,255,255,0.35)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = glow;
  context.beginPath();
  context.arc(orb.x, orb.y, radius * 2.4, 0, Math.PI * 2);
  context.fill();
  const body = context.createRadialGradient(orb.x - radius * 0.35, orb.y - radius * 0.4, radius * 0.1, orb.x, orb.y, radius);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.42, active ? '#bff6ff' : '#d5e2f4');
  body.addColorStop(1, 'rgba(90, 120, 160, 0.15)');
  context.fillStyle = body;
  context.beginPath();
  context.arc(orb.x, orb.y, radius, 0, Math.PI * 2);
  context.fill();
  const token = pass.tokens[orb.index];
  if (token) {
    let size = Math.max(11, Math.min(15, radius));
    context.textAlign = 'center';
    context.textBaseline = 'top';
    context.fillStyle = '#f4f7ff';
    context.shadowColor = 'rgba(0,0,0,0.85)';
    context.shadowBlur = 8;
    do {
      context.font = `600 ${size}px ${FONT}`;
      size -= 1;
    } while (size > 9 && context.measureText(token.text).width > 72);
    const labelY = orb.y + radius + 14;
    context.lineWidth = 4;
    context.strokeStyle = 'rgba(5, 7, 14, 0.85)';
    context.strokeText(token.text, orb.x, labelY);
    context.fillText(token.text, orb.x, labelY);
  }
  context.restore();
}

function drawCaption(context: CanvasRenderingContext2D, band: Band) {
  const text = sceneCaption(pass, activeQuery(), state.head, state.step, state.lang);
  context.save();
  context.font = `13px ${FONT}`;
  context.textAlign = 'center';
  context.textBaseline = 'bottom';
  context.fillStyle = 'rgba(236, 242, 255, 0.94)';
  context.shadowColor = 'rgba(0,0,0,0.9)';
  context.shadowBlur = 12;
  const maxWidth = Math.max(120, band.right - band.left - 8);
  const lines = wrapCaption(context, text, maxWidth).slice(0, 2);
  lines.forEach((line, index) => {
    context.fillText(line, (band.left + band.right) / 2, band.bottom - 8 - (lines.length - 1 - index) * 18);
  });
  context.restore();
}

function wrapCaption(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  if (context.measureText(text).width <= maxWidth) return [text];
  const parts = text.includes(' · ') ? text.split(' · ') : [...text];
  const joiner = text.includes(' · ') ? ' · ' : '';
  const lines: string[] = [];
  let line = '';
  for (const part of parts) {
    const next = line ? line + joiner + part : part;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = part;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function bloom(context: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function driftMotes(dt: number) {
  if (state.step !== 'softmax' && state.step !== 'mix') {
    motes.length = 0;
    return;
  }
  const query = activeQuery();
  const heads = state.head === 'all' ? HEADS.map((_, index) => index) : [HEADS.findIndex((head) => head.id === state.head)];
  if (motes.length < 90) {
    heads.forEach((headIndex) => {
      const row = pass.heads[headIndex]?.weights[query] ?? [];
      row.forEach((weight, key) => {
        if (key === query || weight < 0.04) return;
        if (Math.random() < weight * dt * 7) {
          motes.push({
            from: key,
            to: query,
            head: headIndex,
            bow: bowFor(headIndex, weight),
            t: 0,
            speed: 0.25 + weight * 0.55,
            size: 1.2 + weight * 2.2,
          });
        }
      });
    });
  }
  for (let i = motes.length - 1; i >= 0; i -= 1) {
    motes[i].t += dt * motes[i].speed;
    if (motes[i].t >= 1) motes.splice(i, 1);
  }
}

function drawMotes(context: CanvasRenderingContext2D) {
  context.save();
  context.globalCompositeOperation = 'lighter';
  for (const mote of motes) {
    const from = orbs[mote.from];
    const to = orbs[mote.to];
    if (!from || !to) continue;
    const control = controlOf(from, to, mote.bow);
    const x = quad(from.x, control.x, to.x, mote.t);
    const y = quad(from.y, control.y, to.y, mote.t);
    context.fillStyle = rgba(HEADS[mote.head]?.color ?? '#fff', 0.85);
    context.beginPath();
    context.arc(x, y, mote.size, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function quad(a: number, b: number, c: number, t: number): number {
  const u = 1 - t;
  return u * u * a + 2 * u * t * b + t * t * c;
}
