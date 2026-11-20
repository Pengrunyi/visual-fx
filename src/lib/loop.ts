export function startLoop(update: (dt: number, time: number) => void): () => void {
  let alive = true;
  let last = performance.now();
  let frame = 0;
  const tick = (now: number) => {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!document.hidden) update(dt, now / 1000);
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => {
    alive = false;
    cancelAnimationFrame(frame);
  };
}

export function mountIntro(title: string, subtitle: string): void {
  const root = document.createElement('div');
  root.className = 'intro';
  const strong = document.createElement('strong');
  const span = document.createElement('span');
  strong.textContent = title;
  span.textContent = subtitle;
  root.append(strong, span);
  document.body.append(root);
  requestAnimationFrame(() => root.classList.add('show'));
  window.setTimeout(() => root.classList.add('hide'), 2400);
  window.setTimeout(() => root.remove(), 3200);
}

export function toast(message: string): void {
  let node = document.querySelector<HTMLElement>('.toast');
  if (!node) {
    node = document.createElement('div');
    node.className = 'toast';
    document.body.append(node);
  }
  node.textContent = message;
  node.classList.add('show');
  window.setTimeout(() => node?.classList.remove('show'), 1600);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function prefersCoarsePointer(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}
