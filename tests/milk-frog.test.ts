import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MILK_FROG_MODEL, MILK_FROG_WASM_FILES } from '../src/lib/mediapipePublic';
import {
  cameraErrorMessage,
  classifyPose,
  gestureLabel,
  motionSpan,
  reactionForPose,
  REACTION_BY_KEY,
  type Point,
} from '../src/scenes/milk-frog/gestures';

function hand(flags: { index: boolean; middle: boolean; ring: boolean; pinky: boolean }): Point[] {
  const landmarks: Point[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.78 }));
  landmarks[0] = { x: 0.5, y: 0.82 };
  const fingers = [
    ['index', 5, 0.4],
    ['middle', 9, 0.5],
    ['ring', 13, 0.58],
    ['pinky', 17, 0.66],
  ] as const;
  for (const [name, start, x] of fingers) {
    const up = flags[name];
    for (let joint = 0; joint < 4; joint += 1) {
      landmarks[start + joint] = up
        ? { x, y: 0.8 - (joint + 1) * 0.13 }
        : { x: 0.51, y: 0.8 - (3 - joint) * 0.025 };
    }
  }
  return landmarks;
}

describe('milk frog gestures', () => {
  it('maps keys 1-4 onto the four reactions', () => {
    expect(REACTION_BY_KEY['1']).toBe('wave');
    expect(REACTION_BY_KEY['2']).toBe('jump');
    expect(REACTION_BY_KEY['3']).toBe('surprised');
    expect(REACTION_BY_KEY['4']).toBe('both');
  });

  it('classifies fist, peace, and an open palm from landmarks', () => {
    const fist = hand({ index: false, middle: false, ring: false, pinky: false });
    const peace = hand({ index: true, middle: true, ring: false, pinky: false });
    const open = hand({ index: true, middle: true, ring: true, pinky: true });
    expect(classifyPose(fist)).toBe('fist');
    expect(classifyPose(peace)).toBe('peace');
    expect(classifyPose(open)).toBe('open');
    expect(classifyPose(fist.slice(0, 10))).toBe('none');
  });

  it('turns a held open palm into both arms, and a moving one into a wave', () => {
    expect(reactionForPose('open', 520, 0.01, 0)).toBe('both');
    expect(reactionForPose('open', 80, 0.12, 1)).toBe('wave');
    expect(reactionForPose('fist', 200, 0, 0)).toBe('surprised');
    expect(reactionForPose('peace', 200, 0, 0)).toBe('jump');
    expect(reactionForPose('fist', 40, 0, 0)).toBeNull();
    expect(gestureLabel('open', 'wave')).toBe('挥手');
    expect(gestureLabel('open', 'both')).toBe('张开手掌');
  });

  it('counts a left-right wrist reversal as a wave', () => {
    const samples = [0.4, 0.48, 0.56, 0.47, 0.39, 0.5].map((x, index) => ({ t: index * 80, x }));
    const moving = motionSpan(samples, 400);
    expect(moving.span).toBeGreaterThan(0.08);
    expect(moving.reversals).toBeGreaterThanOrEqual(1);
    const still = [0, 1, 2, 3].map((index) => ({ t: index * 40, x: 0.5 }));
    expect(motionSpan(still, 120).span).toBeLessThan(0.04);
  });

  it('explains camera failures in Chinese, including WeChat and HTTPS', () => {
    const denied = cameraErrorMessage({ name: 'NotAllowedError' }, { secure: true, supported: true });
    expect(denied).toContain('微信');
    expect(denied).toContain('系统浏览器');
    expect(cameraErrorMessage({ name: 'SecurityError' }, { secure: true, supported: true })).toContain('HTTPS');
    expect(cameraErrorMessage(new Error('x'), { secure: false, supported: true })).toContain('HTTPS');
    expect(cameraErrorMessage(new Error('x'), { secure: true, supported: false })).toContain('系统浏览器');
  });
});

describe('milk frog local assets', () => {
  it('keeps the wasm list and the committed float16 model in the repo', () => {
    expect(MILK_FROG_WASM_FILES).toEqual([
      'vision_wasm_internal.js',
      'vision_wasm_internal.wasm',
      'vision_wasm_nosimd_internal.js',
      'vision_wasm_nosimd_internal.wasm',
    ]);
    for (const name of MILK_FROG_WASM_FILES) {
      expect(existsSync(`node_modules/@mediapipe/tasks-vision/wasm/${name}`)).toBe(true);
    }
    const model = `public/${MILK_FROG_MODEL}`;
    expect(existsSync(model)).toBe(true);
    expect(readFileSync(model).length).toBeGreaterThan(7_000_000);
  });

  it('does not point the page at a CDN', () => {
    const sources = [
      'milk-frog/index.html',
      'src/scenes/milk-frog/main.ts',
      'src/scenes/milk-frog/frogView.ts',
      'src/scenes/milk-frog/gestures.ts',
    ];
    for (const file of sources) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/cdn\.|googleapis|jsdelivr|unpkg|esm\.sh/i);
    }
  });
});
