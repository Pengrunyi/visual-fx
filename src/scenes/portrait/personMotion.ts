import type { Reaction } from '../milk-frog/gestures';

export type ShownReaction = Reaction | 'idle';

export interface CutoutLayout {
  person: { width: number; height: number };
  head: { x: number; y: number; w: number; h: number };
  neck_pivot: { x: number; y: number };
}

/** Fractions of the person box, plus the neck pivot inside the head image. */
export function headBox(layout: CutoutLayout): {
  left: number;
  top: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
} {
  const { person, head, neck_pivot: pivot } = layout;
  return {
    left: head.x / person.width,
    top: head.y / person.height,
    width: head.w / person.width,
    height: head.h / person.height,
    originX: (pivot.x - head.x) / head.w,
    originY: (pivot.y - head.y) / head.h,
  };
}

/**
 * How much of the body photo to punch out under the head layer.
 * Solid face pixels above the neck go away so a turn does not leave a second face.
 * The fade ends just below the pivot, so long hair and the coat under it stay on
 * the body instead of leaving holes when the head rotates.
 * `y` is the row inside the head image. The horizontal arguments stay in the
 * signature so callers can pass the neck point as a pair.
 */
export function eraseWeight(alpha: number, _x: number, y: number, _pivotX: number, pivotY: number): number {
  const t = clamp01((alpha - 0.72) / 0.24);
  const solid = t * t * (3 - 2 * t);
  const fadeStart = pivotY - 28;
  const fadeEnd = pivotY + 6;
  if (y <= fadeStart) return solid;
  const along = clamp01((fadeEnd - y) / (fadeEnd - fadeStart));
  const vertical = along * along * (3 - 2 * along);
  return solid * vertical;
}

export interface PoseFrame {
  sway: number;
  jump: number;
  scaleX: number;
  scaleY: number;
  headTilt: number;
  headNod: number;
  headLift: number;
  shadow: number;
  wave: number;
  wavePhase: number;
  both: number;
  bothPhase: number;
  peace: number;
  surprised: number;
  lines: number;
}

export const JUMP_CYCLE_MS = 1000;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeOut(u: number): number {
  const t = clamp01(u);
  return 1 - (1 - t) ** 3;
}

function easeIn(u: number): number {
  const t = clamp01(u);
  return t * t * t;
}

function idleNod(seconds: number): number {
  const local = seconds % 6.4;
  if (local > 4.85 && local < 5.75) {
    const k = (local - 4.85) / 0.9;
    return Math.sin(k * Math.PI) * 1.7;
  }
  return Math.sin(seconds * 0.35) * 0.55;
}

function breathOf(seconds: number, reduceMotion: boolean): number {
  if (reduceMotion) return 1;
  return 1 + Math.sin(seconds * 1.65) * 0.012;
}

/** Squash, rise with stretch, then a landing squash. `jump` is 1 at the apex. */
export function jumpShape(elapsedMs: number): { jump: number; scaleX: number; scaleY: number } {
  const u = (elapsedMs % JUMP_CYCLE_MS) / JUMP_CYCLE_MS;
  if (u < 0.16) {
    const k = easeOut(u / 0.16);
    return { jump: 0, scaleX: 1 + 0.07 * k, scaleY: 1 - 0.1 * k };
  }
  if (u < 0.46) {
    const k = easeOut((u - 0.16) / 0.3);
    return { jump: k, scaleX: 1.07 - 0.13 * k, scaleY: 0.9 + 0.22 * k };
  }
  if (u < 0.66) {
    const k = easeIn((u - 0.46) / 0.2);
    return { jump: 1 - k, scaleX: 0.94 + 0.1 * k, scaleY: 1.12 - 0.2 * k };
  }
  if (u < 0.82) {
    const k = (u - 0.66) / 0.16;
    const squash = Math.sin(k * Math.PI);
    return { jump: 0, scaleX: 1.04 - 0.04 * k + 0.06 * squash, scaleY: 0.92 - 0.08 * squash };
  }
  const k = easeOut((u - 0.82) / 0.18);
  return { jump: 0, scaleX: 1, scaleY: 0.92 + 0.08 * k };
}

function restPose(seconds: number, reduceMotion: boolean): PoseFrame {
  const breath = breathOf(seconds, reduceMotion);
  return {
    sway: reduceMotion ? 0 : Math.sin(seconds * 0.8) * 1.15,
    jump: 0,
    scaleX: 1,
    scaleY: breath,
    headTilt: reduceMotion ? 0 : Math.sin(seconds * 0.47) * 1.15,
    headNod: reduceMotion ? 0 : idleNod(seconds),
    headLift: 0,
    shadow: 1 - (breath - 1) * 1.4,
    wave: 0,
    wavePhase: seconds * 9.2,
    both: 0,
    bothPhase: seconds * 10,
    peace: 0,
    surprised: 0,
    lines: 0,
  };
}

function reducedPose(reaction: ShownReaction, seconds: number): PoseFrame {
  const base = restPose(seconds, true);
  if (reaction === 'wave') {
    return { ...base, sway: 3.2, headTilt: 4, headNod: 2.4, wave: 1, wavePhase: 0.7 };
  }
  if (reaction === 'jump') {
    return { ...base, jump: 0.35, peace: 1, shadow: 0.78 };
  }
  if (reaction === 'surprised') {
    return { ...base, headNod: -6, headTilt: 2, headLift: -0.02, surprised: 1, lines: 1, sway: 1.4 };
  }
  if (reaction === 'both') {
    return { ...base, jump: 0.05, both: 1, headNod: 3, bothPhase: 0.8, shadow: 0.94 };
  }
  return base;
}

export function poseAt(reaction: ShownReaction, nowMs: number, startedMs: number, reduceMotion: boolean): PoseFrame {
  const seconds = nowMs / 1000;
  if (reduceMotion) return reducedPose(reaction, seconds);
  const idle = restPose(seconds, false);
  if (reaction === 'idle') return idle;
  const elapsed = Math.max(0, nowMs - startedMs);
  const breath = breathOf(seconds, false);
  if (reaction === 'wave') {
    const beat = Math.sin(seconds * 7.3);
    return {
      ...idle,
      sway: beat * 4.8,
      scaleY: breath + Math.abs(beat) * 0.012,
      headTilt: beat * 5.2,
      headNod: Math.sin(seconds * 7.3 + 0.55) * 3.6 + 1.4,
      jump: Math.abs(beat) * 0.03,
      shadow: 1 - Math.abs(beat) * 0.06,
      wave: 1,
      wavePhase: seconds * 9.4,
    };
  }
  if (reaction === 'jump') {
    const shape = jumpShape(elapsed);
    return {
      ...idle,
      sway: Math.sin(seconds * 3.2) * 1.4,
      jump: shape.jump,
      scaleX: shape.scaleX,
      scaleY: shape.scaleY * breath,
      headNod: -3.5 * shape.jump + idle.headNod * 0.25,
      headTilt: idle.headTilt * 0.3,
      shadow: 1 - shape.jump * 0.46,
      peace: 1,
    };
  }
  if (reaction === 'surprised') {
    const attack = easeOut(elapsed / 90);
    const shake = Math.sin(seconds * 32);
    return {
      ...idle,
      sway: shake * 1.35 * attack,
      jump: attack * 0.018,
      scaleX: 1 + 0.035 * attack,
      scaleY: breath * (1 - 0.045 * attack),
      headTilt: shake * 3.6,
      headNod: -5.4 * attack + shake * 0.8,
      headLift: -0.004 * attack,
      shadow: 1 + 0.06 * attack,
      surprised: 1,
      lines: 0.45 + 0.55 * Math.abs(shake),
    };
  }
  const bounce = Math.abs(Math.sin(seconds * 9.1));
  const side = Math.sin(seconds * 9.1);
  return {
    ...idle,
    sway: side * 2.4,
    jump: bounce * 0.42,
    scaleX: 1 + bounce * 0.045,
    scaleY: breath * (1 - bounce * 0.055),
    headTilt: side * 3.2,
    headNod: bounce * 4.6,
    shadow: 1 - bounce * 0.1,
    both: 1,
    bothPhase: seconds * 10.2,
  };
}

export interface CharacterState {
  sway: number;
  swayV: number;
  jump: number;
  jumpV: number;
  scaleX: number;
  scaleXV: number;
  scaleY: number;
  scaleYV: number;
  headTilt: number;
  headTiltV: number;
  headNod: number;
  headNodV: number;
  headLift: number;
  headLiftV: number;
  shadow: number;
  shadowV: number;
  wave: number;
  waveV: number;
  both: number;
  bothV: number;
  peace: number;
  peaceV: number;
  surprised: number;
  surprisedV: number;
  lines: number;
  linesV: number;
}

export function createCharacterState(): CharacterState {
  return {
    sway: 0,
    swayV: 0,
    jump: 0,
    jumpV: 0,
    scaleX: 1,
    scaleXV: 0,
    scaleY: 1,
    scaleYV: 0,
    headTilt: 0,
    headTiltV: 0,
    headNod: 0,
    headNodV: 0,
    headLift: 0,
    headLiftV: 0,
    shadow: 1,
    shadowV: 0,
    wave: 0,
    waveV: 0,
    both: 0,
    bothV: 0,
    peace: 0,
    peaceV: 0,
    surprised: 0,
    surprisedV: 0,
    lines: 0,
    linesV: 0,
  };
}

/** Analytic damped spring. Stable at the frame-time cap, and it can overshoot when zeta < 1. */
function damp(value: number, velocity: number, target: number, dt: number, freq: number, zeta: number): [number, number] {
  const omega = freq * Math.PI * 2;
  const offset = value - target;
  if (omega <= 0 || dt <= 0) return [value, velocity];
  if (zeta < 1) {
    const omegaD = omega * Math.sqrt(1 - zeta * zeta);
    const envelope = Math.exp(-zeta * omega * dt);
    const cos = Math.cos(omegaD * dt);
    const sin = Math.sin(omegaD * dt);
    const c1 = offset;
    const c2 = (velocity + zeta * omega * offset) / omegaD;
    const nextOffset = envelope * (c1 * cos + c2 * sin);
    const nextV = -zeta * omega * nextOffset + envelope * omegaD * (-c1 * sin + c2 * cos);
    return [target + nextOffset, nextV];
  }
  const envelope = Math.exp(-omega * dt);
  const nextOffset = envelope * (offset + (velocity + omega * offset) * dt);
  const nextV = -omega * nextOffset + envelope * (velocity + omega * offset);
  return [target + nextOffset, nextV];
}

/** Ease toward the pose. Emoji channels overshoot; the body tracks more tightly. */
export function stepCharacter(state: CharacterState, target: PoseFrame, dt: number): void {
  if (dt <= 0) return;
  const body = 7.2;
  const head = 8.4;
  const pop = 5.2;
  [state.sway, state.swayV] = damp(state.sway, state.swayV, target.sway, dt, body, 0.78);
  [state.jump, state.jumpV] = damp(state.jump, state.jumpV, target.jump, dt, 8.5, 0.72);
  [state.scaleX, state.scaleXV] = damp(state.scaleX, state.scaleXV, target.scaleX, dt, 9, 0.8);
  [state.scaleY, state.scaleYV] = damp(state.scaleY, state.scaleYV, target.scaleY, dt, 9, 0.8);
  [state.headTilt, state.headTiltV] = damp(state.headTilt, state.headTiltV, target.headTilt, dt, head, 0.62);
  [state.headNod, state.headNodV] = damp(state.headNod, state.headNodV, target.headNod, dt, head, 0.62);
  [state.headLift, state.headLiftV] = damp(state.headLift, state.headLiftV, target.headLift, dt, head, 0.7);
  [state.shadow, state.shadowV] = damp(state.shadow, state.shadowV, target.shadow, dt, body, 0.85);
  [state.wave, state.waveV] = damp(state.wave, state.waveV, target.wave, dt, pop, 0.46);
  [state.both, state.bothV] = damp(state.both, state.bothV, target.both, dt, pop, 0.46);
  [state.peace, state.peaceV] = damp(state.peace, state.peaceV, target.peace, dt, pop, 0.42);
  [state.surprised, state.surprisedV] = damp(state.surprised, state.surprisedV, target.surprised, dt, 7.5, 0.48);
  [state.lines, state.linesV] = damp(state.lines, state.linesV, target.lines, dt, 10, 0.7);
}
