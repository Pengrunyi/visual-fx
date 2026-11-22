import type { Reaction } from './gestures';

export type FrogReaction = Reaction | 'idle';

interface Pivot {
  x: number;
  y: number;
}

function must<T extends Element>(root: ParentNode, selector: string): T {
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`missing ${selector}`);
  return node;
}

function pivotOf(element: SVGGElement): Pivot {
  const parts = (element.dataset.pivot ?? '0 0').split(/\s+/).map(Number);
  return { x: parts[0] || 0, y: parts[1] || 0 };
}

function setVisibility(element: SVGElement, visible: boolean): void {
  element.setAttribute('visibility', visible ? 'visible' : 'hidden');
}

export function createFrogView(svg: SVGSVGElement): {
  trigger: (reaction: Reaction, holdMs?: number) => void;
  frame: (now: number) => FrogReaction;
} {
  const bob = must<SVGGElement>(svg, '#frog-bob');
  const breathe = must<SVGGElement>(svg, '#frog-breathe');
  const shadow = must<SVGEllipseElement>(svg, '#shadow');
  const armLeft = must<SVGGElement>(svg, '#arm-left');
  const armRight = must<SVGGElement>(svg, '#arm-right');
  const eyeLeft = must<SVGGElement>(svg, '#eye-left');
  const eyeRight = must<SVGGElement>(svg, '#eye-right');
  const pupilLeft = must<SVGGElement>(svg, '#pupil-left');
  const pupilRight = must<SVGGElement>(svg, '#pupil-right');
  const mouthSmile = must<SVGPathElement>(svg, '#mouth-smile');
  const mouthHappy = must<SVGPathElement>(svg, '#mouth-happy');
  const mouthO = must<SVGEllipseElement>(svg, '#mouth-o');
  const leftPivot = pivotOf(armLeft);
  const rightPivot = pivotOf(armRight);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let reaction: FrogReaction = 'idle';
  let reactionUntil = 0;
  let reactionStarted = 0;

  const trigger = (next: Reaction, holdMs = 1700) => {
    const now = performance.now();
    if (reaction !== next) reactionStarted = now;
    reaction = next;
    reactionUntil = now + holdMs;
    svg.dataset.reaction = next;
  };

  const frame = (now: number): FrogReaction => {
    if (reaction !== 'idle' && now > reactionUntil) {
      reaction = 'idle';
      svg.dataset.reaction = 'idle';
    }
    const seconds = now / 1000;
    const breath = reduceMotion ? 1 : 1 + Math.sin(seconds * 2.05) * 0.028;
    breathe.setAttribute('transform', `translate(240 310) scale(${1 + (breath - 1) * 0.35} ${breath}) translate(-240 -310)`);

    const blinkWindow = seconds % 4.4;
    const blinking = !reduceMotion && reaction !== 'surprised' && blinkWindow > 4.12 && blinkWindow < 4.28;
    const eyeScale = reaction === 'surprised' ? 1.08 : blinking ? 0.1 : 1;
    eyeLeft.setAttribute('transform', `translate(176 214) scale(1 ${eyeScale}) translate(-176 -214)`);
    eyeRight.setAttribute('transform', `translate(304 214) scale(1 ${eyeScale}) translate(-304 -214)`);
    const pupilScale = reaction === 'surprised' ? 1.28 : 1;
    pupilLeft.setAttribute('transform', `translate(188 222) scale(${pupilScale}) translate(-188 -222)`);
    pupilRight.setAttribute('transform', `translate(292 222) scale(${pupilScale}) translate(-292 -222)`);

    let jump = 0;
    if (reaction === 'jump' && !reduceMotion) {
      const cycle = ((now - reactionStarted) % 1500) / 680;
      jump = cycle <= 1 ? Math.sin(cycle * Math.PI) : 0;
    } else if (reaction === 'jump') {
      jump = 0.35;
    }
    const shake = reaction === 'surprised' && !reduceMotion ? Math.sin(seconds * 26) * 3.2 : 0;
    const squash = 1 - jump * 0.06;
    const lift = -jump * 86;
    bob.setAttribute('transform', `translate(${shake} ${lift}) translate(240 360) scale(1 ${squash}) translate(-240 -360)`);
    const shadowScale = 1 - jump * 0.38;
    shadow.setAttribute('transform', `translate(240 474) scale(${shadowScale}) translate(-240 -474)`);
    shadow.setAttribute('opacity', (0.28 - jump * 0.14).toFixed(3));

    const wave = reduceMotion ? 0 : Math.sin(seconds * 9.2);
    let left = 0;
    let right = 0;
    // Negative rotation lifts the frog's right arm; positive lifts the left.
    if (reaction === 'wave') right = -30 + wave * 16;
    if (reaction === 'both') {
      left = 30 - wave * 16;
      right = -30 + wave * 16;
    }
    armLeft.setAttribute('transform', `rotate(${left} ${leftPivot.x} ${leftPivot.y})`);
    armRight.setAttribute('transform', `rotate(${right} ${rightPivot.x} ${rightPivot.y})`);

    setVisibility(mouthSmile, reaction !== 'jump' && reaction !== 'surprised');
    setVisibility(mouthHappy, reaction === 'jump');
    setVisibility(mouthO, reaction === 'surprised');
    svg.dataset.blink = blinking ? '1' : '0';
    return reaction;
  };

  return { trigger, frame };
}
