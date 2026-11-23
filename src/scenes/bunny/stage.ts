const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function svg(markup: string): string {
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${markup}</svg>`;
}

const GLYPHS = {
  bow: svg('<path d="M24 22c-6-10-18-8-16 2 2 6 8 8 16 4 8 4 14 2 16-4 2-10-10-12-16-2z" fill="#c9b4e6"/><circle cx="24" cy="24" r="3.2" fill="#f4d7e6"/><path d="M22 26l-6 10M26 26l6 10" stroke="#b89ad4" stroke-width="2" fill="none" stroke-linecap="round"/>'),
  heart: svg('<path d="M24 40C10 30 6 20 12 14c4-4 8-2 12 4 4-6 8-8 12-4 6 6 2 16-12 26z" fill="#f3b7cf"/>'),
  star: svg('<path d="M24 6l4 10 11 1-8 8 2 11-9-6-9 6 2-11-8-8 11-1z" fill="#ffe7a8"/>'),
  carrot: svg('<path d="M24 14c8 8 12 20 8 26-6 2-14-6-16-16 2-6 4-10 8-10z" fill="#f0b27a"/><path d="M18 16c2-6 6-8 10-6" stroke="#8fbf7a" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M24 14c0-6 4-8 8-6" stroke="#6ea86a" stroke-width="2" fill="none" stroke-linecap="round"/>'),
  bunny: svg('<ellipse cx="16" cy="14" rx="4" ry="9" fill="#d9c6ee"/><ellipse cx="28" cy="14" rx="4" ry="9" fill="#d9c6ee"/><ellipse cx="22" cy="26" rx="10" ry="8" fill="#efe4f8"/><circle cx="18" cy="25" r="1" fill="#6d5478"/><circle cx="26" cy="25" r="1" fill="#6d5478"/>'),
} as const;

type Glyph = keyof typeof GLYPHS;

const DRIFT: { kind: Glyph; left: string; top: string; size: number; dur: string; delay: string }[] = [
  { kind: 'bow', left: '7%', top: '18%', size: 36, dur: '11s', delay: '0s' },
  { kind: 'bow', left: '88%', top: '26%', size: 30, dur: '13s', delay: '-3s' },
  { kind: 'heart', left: '12%', top: '62%', size: 22, dur: '10s', delay: '-2s' },
  { kind: 'heart', left: '84%', top: '58%', size: 18, dur: '12s', delay: '-6s' },
  { kind: 'star', left: '18%', top: '34%', size: 16, dur: '9s', delay: '-1s' },
  { kind: 'star', left: '80%', top: '42%', size: 14, dur: '14s', delay: '-4s' },
  { kind: 'carrot', left: '6%', top: '74%', size: 28, dur: '15s', delay: '-5s' },
  { kind: 'bunny', left: '90%', top: '72%', size: 34, dur: '16s', delay: '-7s' },
];

function lace(): string {
  return `<svg class="lace-valance" viewBox="0 0 1200 86" preserveAspectRatio="none" aria-hidden="true">
    <path fill="rgba(255,255,255,0.72)" d="M0 0h1200v34c-18 0-28 22-40 22s-22-22-40-22-28 22-40 22-22-22-40-22-28 22-40 22-22-22-40-22-28 22-40 22-22-22-40-22-28 22-40 22-22-22-40-22-28 22-40 22-22-22-40-22-28 22-40 22-22-22-40-22-28 22-40 22-22-22-40-22-28 22-40 22-22-22-40-22-28 22-40 22-22-22-40-22-28 22-40 22-22-22-40-22-28 22-40 22-22-22-40-22-28 22-40 22-22-22-40-22-28 22-40 22-22-22-40-22-28 22-40 22-22-22-40-22-28 22-40 22S18 34 0 34z"/>
    <path fill="none" stroke="rgba(201,180,230,0.85)" stroke-width="1.4" d="M20 28c20 18 20 18 40 0s20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0 20 18 40 0"/>
  </svg>`;
}

export function mountPastelStage(person: HTMLElement): (reaction: string) => void {
  const stage = document.createElement('div');
  stage.className = 'pastel-stage';
  stage.setAttribute('aria-hidden', 'true');
  stage.innerHTML = `${lace()}<div class="bokeh b1"></div><div class="bokeh b2"></div><div class="bokeh b3"></div><div class="bokeh b4"></div>`;
  const drift = document.createElement('div');
  drift.className = 'pastel-drift';
  for (const item of DRIFT) {
    const node = document.createElement('span');
    node.className = 'float-item';
    node.style.left = item.left;
    node.style.top = item.top;
    node.style.width = `${item.size}px`;
    node.style.setProperty('--dur', item.dur);
    node.style.setProperty('--delay', item.delay);
    node.innerHTML = GLYPHS[item.kind];
    drift.append(node);
  }
  stage.append(drift);
  document.body.prepend(stage);

  const halo = document.createElement('div');
  halo.className = 'pastel-halo';
  person.prepend(halo);

  const front = document.createElement('div');
  front.className = 'pastel-front';
  for (let i = 0; i < 6; i += 1) {
    const mote = document.createElement('span');
    mote.className = 'mote';
    mote.style.left = `${18 + (i * 13) % 64}%`;
    mote.style.top = `${12 + (i * 17) % 55}%`;
    mote.style.setProperty('--delay', `${-i * 1.3}s`);
    mote.innerHTML = GLYPHS.star;
    front.append(mote);
  }
  person.append(front);

  const bursts = document.createElement('div');
  bursts.className = 'pastel-bursts';
  person.append(bursts);

  return (reaction: string) => {
    if (REDUCE || reaction === 'idle') return;
    const kind: Glyph = reaction === 'jump' ? 'heart' : reaction === 'wave' ? 'star' : reaction === 'both' ? 'bow' : 'star';
    const count = reaction === 'jump' ? 10 : 7;
    for (let i = 0; i < count; i += 1) {
      const bit = document.createElement('span');
      bit.className = 'flare';
      bit.innerHTML = GLYPHS[kind];
      bit.style.left = `${30 + Math.random() * 40}%`;
      bit.style.top = `${18 + Math.random() * 28}%`;
      bit.style.setProperty('--dx', `${(Math.random() - 0.5) * 140}px`);
      bit.style.setProperty('--dy', `${-30 - Math.random() * 90}px`);
      bit.addEventListener('animationend', () => bit.remove());
      window.setTimeout(() => bit.remove(), 1400);
      bursts.append(bit);
    }
  };
}
