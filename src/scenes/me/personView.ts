import type { Reaction } from '../milk-frog/gestures';
import {
  createCharacterState,
  eraseWeight,
  headBox,
  JUMP_CYCLE_MS,
  poseAt,
  stepCharacter,
  type CharacterState,
  type CutoutLayout,
  type ShownReaction,
} from './personMotion';

const BIT_COLORS = ['#ffe9a8', '#fffaf2', '#9ec0ea', '#f4efe6', '#ffd4ea', '#ffffff'];

function must<T extends Element>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`missing ${selector}`);
  return node;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(src));
    image.src = src;
  });
}

function dilate(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius <= 0) return src;
  const out = new Float32Array(src.length);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      let max = 0;
      for (let yy = y0; yy <= y1; yy += 1) {
        const row = yy * width;
        for (let xx = x0; xx <= x1; xx += 1) {
          const value = src[row + xx] ?? 0;
          if (value > max) max = value;
        }
      }
      out[y * width + x] = max;
    }
  }
  return out;
}

function paintLines(host: HTMLElement): void {
  const specs = [
    { left: '0%', top: '28%', width: '24%', rot: -10 },
    { left: '2%', top: '55%', width: '18%', rot: 8 },
    { left: '4%', top: '8%', width: '14%', rot: -32 },
    { left: '76%', top: '24%', width: '24%', rot: 12 },
    { left: '80%', top: '52%', width: '18%', rot: -8 },
    { left: '78%', top: '6%', width: '16%', rot: 28 },
  ];
  specs.forEach((spec) => {
    const line = document.createElement('span');
    line.style.left = spec.left;
    line.style.top = spec.top;
    line.style.width = spec.width;
    line.style.transform = `rotate(${spec.rot}deg)`;
    host.append(line);
  });
}

export function createPersonView(root: HTMLElement, onError: (message: string) => void): {
  trigger: (reaction: Reaction, holdMs?: number) => void;
  frame: (now: number) => ShownReaction;
} {
  const actor = must<HTMLElement>(root, '#actor');
  const rig = must<HTMLElement>(root, '#rig');
  const canvas = must<HTMLCanvasElement>(root, '#body-canvas');
  const head = must<HTMLImageElement>(root, '#head');
  const shadow = must<HTMLElement>(root, '#shadow');
  const wave = must<HTMLElement>(root, '#wave-hand');
  const bothLeft = must<HTMLElement>(root, '#both-left');
  const bothRight = must<HTMLElement>(root, '#both-right');
  const peace = must<HTMLElement>(root, '#peace-pop');
  const wow = must<HTMLElement>(root, '#wow-pop');
  const bang = must<HTMLElement>(root, '#bang-pop');
  const lines = must<HTMLElement>(root, '#lines');
  const bits = must<HTMLElement>(root, '#bits');
  paintLines(lines);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state: CharacterState = createCharacterState();
  let reaction: ShownReaction = 'idle';
  let reactionUntil = 0;
  let reactionStarted = 0;
  let lastFrame = performance.now();
  let layout: CutoutLayout | null = null;
  let personPixels: ImageData | null = null;
  let baseErase: Float32Array | null = null;
  let eraseSize = { w: 0, h: 0 };
  let eraseOrigin = { x: 0, y: 0 };
  let paintedRadius = -1;
  const dilatedMasks = new Map<number, Float32Array>();
  let lastJumpU = 0;

  const trigger = (next: Reaction, holdMs = 1700) => {
    const now = performance.now();
    if (reaction !== next) {
      reactionStarted = now;
      if (next === 'jump') spawnBits();
    }
    reaction = next;
    reactionUntil = now + holdMs;
    root.dataset.reaction = next;
  };

  function spawnBits(): void {
    for (let i = 0; i < 26; i += 1) {
      const bit = document.createElement('span');
      bit.className = i % 5 === 0 ? 'bit star' : 'bit';
      if (i % 5 === 0) bit.textContent = '✦';
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.35;
      const dist = 46 + Math.random() * 110;
      bit.style.left = `${36 + Math.random() * 28}%`;
      bit.style.top = `${4 + Math.random() * 16}%`;
      bit.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      bit.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      if (i % 5 !== 0) bit.style.background = BIT_COLORS[i % BIT_COLORS.length] ?? '#fff';
      bit.style.animationDelay = `${Math.random() * 70}ms`;
      bit.addEventListener('animationend', () => bit.remove());
      bits.append(bit);
    }
  }

  function compose(radius: number, strength: number): void {
    if (!personPixels) return;
    if (radius <= 0 || strength <= 0 || !baseErase) {
      canvas.width = personPixels.width;
      canvas.height = personPixels.height;
      canvas.getContext('2d')?.putImageData(personPixels, 0, 0);
      paintedRadius = 0;
      return;
    }
    let erased = dilatedMasks.get(radius);
    if (!erased) {
      erased = dilate(baseErase, eraseSize.w, eraseSize.h, radius);
      dilatedMasks.set(radius, erased);
    }
    const copy = new ImageData(new Uint8ClampedArray(personPixels.data), personPixels.width, personPixels.height);
    const data = copy.data;
    const { x: originX, y: originY } = eraseOrigin;
    for (let y = 0; y < eraseSize.h; y += 1) {
      for (let x = 0; x < eraseSize.w; x += 1) {
        const weight = (erased[y * eraseSize.w + x] ?? 0) * strength;
        if (weight <= 0) continue;
        const px = originX + x;
        const py = originY + y;
        if (px < 0 || py < 0 || px >= copy.width || py >= copy.height) continue;
        const index = (py * copy.width + px) * 4 + 3;
        data[index] = Math.round((data[index] ?? 0) * (1 - weight));
      }
    }
    canvas.width = copy.width;
    canvas.height = copy.height;
    canvas.getContext('2d')?.putImageData(copy, 0, 0);
    paintedRadius = radius + Math.round(strength * 8) / 8;
  }

  function apply(now: number, dt: number): void {
    const still = document.documentElement.dataset.pose === 'still';
    const target = still
      ? poseAt('idle', 0, 0, true)
      : poseAt(reaction, now, reactionStarted, reduceMotion);
    if (still) {
      Object.assign(state, createCharacterState());
    } else {
      stepCharacter(state, target, dt);
    }
    const height = actor.offsetHeight || 1;
    const jumpPx = -state.jump * height * 0.11;
    const bodyLift = state.headLift * height * 0.2;
    actor.style.transform = `translate3d(${state.sway * 0.35}px, ${jumpPx + bodyLift}px, 0) scale(${state.scaleX}, ${state.scaleY})`;
    rig.style.transform = `rotate(${state.sway}deg)`;
    head.style.transform = `translate3d(0, ${state.headLift * height}px, 0) rotate(${state.headTilt}deg) rotateX(${state.headNod}deg)`;
    const shadowScale = Math.max(0.45, state.shadow * (1 - state.jump * 0.15));
    shadow.style.width = `${Math.max(48, actor.offsetWidth * 0.72)}px`;
    shadow.style.transform = `translateX(-50%) scale(${shadowScale}, ${0.75 + shadowScale * 0.25})`;
    shadow.style.opacity = (0.28 + shadowScale * 0.22).toFixed(3);

    const waveTurn = Math.sin(target.wavePhase) * 28;
    wave.style.opacity = String(Math.min(1, Math.max(0, state.wave)));
    wave.style.transform = `rotate(${waveTurn}deg) scale(${Math.max(0, state.wave)})`;
    const bothScale = Math.max(0, state.both);
    bothLeft.style.opacity = String(Math.min(1, bothScale));
    bothRight.style.opacity = String(Math.min(1, bothScale));
    bothLeft.style.transform = `rotate(${Math.sin(target.bothPhase) * 26}deg) scale(${bothScale})`;
    bothRight.style.transform = `rotate(${Math.sin(target.bothPhase + Math.PI) * 26}deg) scale(${bothScale})`;
    const peaceScale = Math.max(0, state.peace);
    peace.style.opacity = String(Math.min(1, peaceScale));
    peace.style.transform = `translateY(${(1 - Math.min(1, peaceScale)) * 10}px) rotate(${(1 - Math.min(1, peaceScale)) * -18}deg) scale(${peaceScale})`;
    const pop = Math.max(0, state.surprised);
    wow.style.opacity = String(Math.min(1, pop));
    bang.style.opacity = String(Math.min(1, pop));
    wow.style.transform = `scale(${pop}) rotate(${state.headTilt * 0.4}deg)`;
    bang.style.transform = `translateY(${(1 - Math.min(1, pop)) * -8}px) scale(${pop * 1.05})`;
    lines.style.opacity = String(Math.max(0, state.lines));
    lines.style.transform = `translateX(${state.headTilt * 0.35}px)`;

    if (!still && layout && baseErase) {
      const motion = Math.hypot(state.headTilt, state.headNod);
      const strength = Math.min(1, Math.max(0, (motion - 2.3) / 1.4));
      const radius = strength <= 0 ? 0 : Math.min(5, Math.max(1, Math.round((motion - 2.3) * 1.15)));
      const signature = radius + Math.round(strength * 8) / 8;
      if (signature !== paintedRadius) compose(radius, strength);
    }
  }

  const frame = (now: number): ShownReaction => {
    if (reaction !== 'idle' && now > reactionUntil) {
      reaction = 'idle';
      root.dataset.reaction = 'idle';
    }
    const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    if (reaction === 'jump') {
      const cycle = ((now - reactionStarted) % JUMP_CYCLE_MS) / JUMP_CYCLE_MS;
      if (cycle < lastJumpU) spawnBits();
      lastJumpU = cycle;
    } else {
      lastJumpU = 0;
    }
    apply(now, dt);
    return reaction;
  };

  const base = import.meta.env.BASE_URL;
  void (async () => {
    try {
      const [layoutResponse, person, headImage] = await Promise.all([
        fetch(`${base}me/layout.json`),
        loadImage(`${base}me/person.webp`),
        loadImage(`${base}me/head.png`),
      ]);
      if (!layoutResponse.ok) throw new Error('layout');
      const parsed = await layoutResponse.json() as CutoutLayout;
      if (!parsed?.person?.width || !parsed.head || !parsed.neck_pivot) throw new Error('layout');
      layout = parsed;
      const box = headBox(parsed);
      actor.style.aspectRatio = `${parsed.person.width} / ${parsed.person.height}`;
      head.src = headImage.src;
      head.style.left = `${box.left * 100}%`;
      head.style.top = `${box.top * 100}%`;
      head.style.width = `${box.width * 100}%`;
      head.style.height = `${box.height * 100}%`;
      head.style.transformOrigin = `${box.originX * 100}% ${box.originY * 100}%`;

      const scratch = document.createElement('canvas');
      scratch.width = person.naturalWidth;
      scratch.height = person.naturalHeight;
      const ctx = scratch.getContext('2d');
      if (!ctx) throw new Error('canvas');
      ctx.drawImage(person, 0, 0);
      personPixels = ctx.getImageData(0, 0, scratch.width, scratch.height);

      const headCanvas = document.createElement('canvas');
      headCanvas.width = parsed.head.w;
      headCanvas.height = parsed.head.h;
      const headCtx = headCanvas.getContext('2d');
      if (!headCtx) throw new Error('canvas');
      headCtx.drawImage(headImage, 0, 0, parsed.head.w, parsed.head.h);
      const headPixels = headCtx.getImageData(0, 0, parsed.head.w, parsed.head.h);
      const pivotX = parsed.neck_pivot.x - parsed.head.x;
      const pivotY = parsed.neck_pivot.y - parsed.head.y;
      baseErase = new Float32Array(parsed.head.w * parsed.head.h);
      for (let y = 0; y < parsed.head.h; y += 1) {
        for (let x = 0; x < parsed.head.w; x += 1) {
          const alpha = (headPixels.data[(y * parsed.head.w + x) * 4 + 3] ?? 0) / 255;
          baseErase[y * parsed.head.w + x] = eraseWeight(alpha, x, y, pivotX, pivotY);
        }
      }
      eraseSize = { w: parsed.head.w, h: parsed.head.h };
      eraseOrigin = { x: Math.round(parsed.head.x), y: Math.round(parsed.head.y) };
      compose(0, 0);
      root.dataset.ready = '1';
    } catch {
      root.dataset.ready = 'error';
      onError('照片没有加载成功。请刷新页面；按键 1-4 仍然可以试。');
    }
  })();

  return { trigger, frame };
}
