import { clamp } from '../../lib/loop';
import type { SceneMode } from './gestures';

export interface StageState {
  /** 0 is the tree, 1 is the spark cloud. */
  particle: number;
  /** 0 hides the frames, 1 shows them. */
  photos: number;
}

export interface StageRates {
  particle: number;
  photos: number;
  /** Frames stay hidden until the cloud has opened this far. */
  photoGate: number;
  /** The tree waits until the frames have faded below this. */
  treeGate: number;
}

export const DEFAULT_STAGE_RATES: StageRates = {
  particle: 1.65,
  photos: 2.15,
  photoGate: 0.72,
  treeGate: 0.12,
};

export function damp(current: number, goal: number, speed: number, dt: number): number {
  if (speed <= 0 || dt <= 0) return current;
  const t = 1 - Math.exp(-speed * dt);
  return current + (goal - current) * t;
}

/**
 * Photos appear only after the burst has opened. The tree reforms only after
 * the frames have left. Reduced motion snaps to the target.
 */
export function stepStage(
  stage: StageState,
  target: SceneMode,
  dt: number,
  reduced = false,
  rates: StageRates = DEFAULT_STAGE_RATES,
): StageState {
  if (reduced) {
    return {
      particle: target === 'tree' ? 0 : 1,
      photos: target === 'photos' ? 1 : 0,
    };
  }
  const particleGoal = target === 'tree' ? 0 : 1;
  const photoGoal = target === 'photos' ? 1 : 0;
  const photosBlocked = photoGoal > stage.photos && stage.particle < rates.photoGate;
  const treeBlocked = particleGoal < stage.particle && stage.photos > rates.treeGate;
  return {
    particle: clamp(damp(stage.particle, treeBlocked ? stage.particle : particleGoal, rates.particle, dt), 0, 1),
    photos: clamp(damp(stage.photos, photosBlocked ? stage.photos : photoGoal, rates.photos, dt), 0, 1),
  };
}

export function smoothstep01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

/** Later frames wait, so the cards pop out one after another. */
export function framePresence(progress: number, index: number, count: number): number {
  if (count <= 0) return 0;
  const start = (index / count) * 0.42;
  const span = Math.max(0.001, 1 - start);
  return smoothstep01((progress - start) / span);
}

export function popScale(presence: number): number {
  const t = clamp(presence, 0, 1);
  return t * 0.92 + Math.sin(t * Math.PI) * 0.08 * t;
}

export interface FramePose {
  x: number;
  y: number;
  z: number;
}

/** A shallow fan in front of the cloud, so every frame stays readable. */
export function framePose(index: number, count: number, time: number): FramePose {
  const safe = Math.max(1, count);
  const centered = safe === 1 ? 0 : (index - (safe - 1) / 2) / ((safe - 1) / 2);
  const sway = Math.sin(time * 0.55 + index * 0.8) * 0.05;
  return {
    x: centered * 1.58 + sway,
    y: 1.9 + (index % 2) * 0.22 + Math.sin(time * 0.7 + index) * 0.05,
    z: 0.42 + (index % 2) * 0.18,
  };
}

/** Baubles stay solid through the start of the burst, then dissolve into sparks. */
export function ornamentPresence(morph: number): number {
  if (morph <= 0.62) return 1;
  return 1 - smoothstep01((morph - 0.62) / 0.38);
}

export function starPresence(morph: number): number {
  return 1 - smoothstep01(morph / 0.45);
}

export function cappedPixelRatio(dpr: number, width: number, reduced: boolean): number {
  const cap = reduced ? 1 : width < 760 ? 1.25 : 1.5;
  return Math.min(Math.max(dpr || 1, 1), cap);
}

export function particleBudget(width: number, reduced: boolean): number {
  if (reduced) return 3200;
  if (width < 760) return 7000;
  return 11000;
}

export function ornamentBudget(width: number, reduced: boolean): number {
  if (reduced) return 6;
  if (width < 760) return 8;
  return 12;
}
