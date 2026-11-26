import { clamp } from '../../lib/loop';
import type { SceneMode } from './gestures';

export interface StageState {
  /** 0 is a taut constellation, 1 lets the stars drift and the lines soften. */
  loosen: number;
  /** 0 hides the snow, 1 is a steady fine fall. */
  snow: number;
  /** 0 hides the frames, 1 hangs them on the branches. */
  photos: number;
}

export interface StageRates {
  loosen: number;
  snow: number;
  photos: number;
}

export const DEFAULT_STAGE_RATES: StageRates = {
  loosen: 1.7,
  snow: 1.35,
  photos: 2.05,
};

export function damp(current: number, goal: number, speed: number, dt: number): number {
  if (speed <= 0 || dt <= 0) return current;
  const t = 1 - Math.exp(-speed * dt);
  return current + (goal - current) * t;
}

/** Snow and soft lines belong to the open palm. Photos hang on the finished tree. */
export function stepStage(
  stage: StageState,
  target: SceneMode,
  dt: number,
  reduced = false,
  rates: StageRates = DEFAULT_STAGE_RATES,
): StageState {
  if (reduced) {
    return {
      loosen: target === 'snow' ? 1 : 0,
      snow: target === 'snow' ? 1 : 0,
      photos: target === 'photos' ? 1 : 0,
    };
  }
  return {
    loosen: clamp(damp(stage.loosen, target === 'snow' ? 1 : 0, rates.loosen, dt), 0, 1),
    snow: clamp(damp(stage.snow, target === 'snow' ? 1 : 0, rates.snow, dt), 0, 1),
    photos: clamp(damp(stage.photos, target === 'photos' ? 1 : 0, rates.photos, dt), 0, 1),
  };
}

export function smoothstep01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

/** Later frames wait, so the ornaments settle one after another. */
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

export function cappedPixelRatio(dpr: number, width: number, reduced: boolean): number {
  const cap = reduced ? 1 : width < 760 ? 1.25 : 1.5;
  return Math.min(Math.max(dpr || 1, 1), cap);
}

export function starBudget(width: number, reduced: boolean): number {
  if (reduced) return 48;
  if (width < 760) return 84;
  return 128;
}

export function snowBudget(width: number, reduced: boolean): number {
  if (reduced) return 28;
  if (width < 760) return 56;
  return 86;
}
