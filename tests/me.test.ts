import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MILK_FROG_MODEL, MILK_FROG_WASM_DIR } from '../src/lib/mediapipePublic';
import {
  createCharacterState,
  eraseWeight,
  headBox,
  jumpShape,
  poseAt,
  stepCharacter,
  type CutoutLayout,
} from '../src/scenes/portrait/personMotion';

const layout = JSON.parse(readFileSync('public/me/layout.json', 'utf8')) as CutoutLayout;

function imageSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP' && buf.toString('ascii', 12, 16) === 'VP8X') {
    return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG' && buf.toString('ascii', 12, 16) === 'IHDR') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  throw new Error(`unsupported image ${path}`);
}

describe('real photo placement', () => {
  it('pins the head cutout on the neck pivot from layout.json', () => {
    const person = imageSize('public/me/person.webp');
    const head = imageSize('public/me/head.png');
    expect(person).toEqual(layout.person);
    expect(head).toEqual({ width: layout.head.w, height: layout.head.h });
    expect(layout.head.x).toBeGreaterThanOrEqual(0);
    expect(layout.head.y).toBeGreaterThanOrEqual(0);
    expect(layout.head.x + layout.head.w).toBeLessThanOrEqual(layout.person.width);
    expect(layout.head.y + layout.head.h).toBeLessThanOrEqual(layout.person.height);
    expect(layout.neck_pivot.x).toBeGreaterThan(layout.head.x);
    expect(layout.neck_pivot.x).toBeLessThan(layout.head.x + layout.head.w);
    expect(layout.neck_pivot.y).toBeGreaterThan(layout.head.y);
    expect(layout.neck_pivot.y).toBeLessThan(layout.head.y + layout.head.h);

    const box = headBox(layout);
    expect(box.left).toBeCloseTo(layout.head.x / layout.person.width, 6);
    expect(box.top).toBeCloseTo(layout.head.y / layout.person.height, 6);
    expect(box.width).toBeCloseTo(layout.head.w / layout.person.width, 6);
    expect(box.height).toBeCloseTo(layout.head.h / layout.person.height, 6);
    expect(box.originX).toBeCloseTo((layout.neck_pivot.x - layout.head.x) / layout.head.w, 6);
    expect(box.originY).toBeCloseTo((layout.neck_pivot.y - layout.head.y) / layout.head.h, 6);
    expect(readFileSync('src/scenes/me/me.css', 'utf8')).toContain(
      `aspect-ratio: ${layout.person.width} / ${layout.person.height}`,
    );
  });

  it('erases the face above the neck and leaves the coat under the hair', () => {
    const pivotX = layout.neck_pivot.x - layout.head.x;
    const pivotY = layout.neck_pivot.y - layout.head.y;
    expect(eraseWeight(1, pivotX, pivotY - 80, pivotX, pivotY)).toBeGreaterThan(0.95);
    expect(eraseWeight(0.2, pivotX, pivotY - 80, pivotX, pivotY)).toBe(0);
    expect(eraseWeight(1, pivotX, pivotY, pivotX, pivotY)).toBeLessThan(0.25);
    expect(eraseWeight(1, 12, pivotY + 40, pivotX, pivotY)).toBe(0);
  });
});

describe('real photo motion', () => {
  it('breathes gently at idle and sways harder when waving', () => {
    const idle = poseAt('idle', 1000, 0, false);
    const wave = poseAt('wave', 1000, 0, false);
    expect(Math.abs(idle.sway)).toBeLessThan(2);
    expect(idle.scaleY).toBeGreaterThan(0.98);
    expect(idle.scaleY).toBeLessThan(1.02);
    expect(idle.wave).toBe(0);
    expect(Math.abs(wave.sway)).toBeGreaterThan(3);
    expect(wave.wave).toBe(1);
  });

  it('squashes before a jump, stretches at the apex, and squashes on landing', () => {
    const anticipate = jumpShape(80);
    const apex = jumpShape(450);
    const land = jumpShape(740);
    expect(anticipate.jump).toBe(0);
    expect(anticipate.scaleY).toBeLessThan(0.95);
    expect(anticipate.scaleX).toBeGreaterThan(1.04);
    expect(apex.jump).toBeGreaterThan(0.95);
    expect(apex.scaleY).toBeGreaterThan(1.08);
    expect(land.jump).toBe(0);
    expect(land.scaleY).toBeLessThan(0.9);
    const jumping = poseAt('jump', 450, 0, false);
    expect(jumping.peace).toBe(1);
    expect(jumping.shadow).toBeLessThan(0.7);
  });

  it('pulls the head back when surprised and bounces for both hands', () => {
    const surprised = poseAt('surprised', 400, 0, false);
    expect(surprised.headNod).toBeLessThan(-4);
    expect(surprised.headLift).toBeLessThan(0);
    expect(surprised.surprised).toBe(1);
    expect(surprised.lines).toBeGreaterThan(0);
    const later = poseAt('surprised', 440, 0, false);
    expect(surprised.headTilt).not.toBeCloseTo(later.headTilt, 1);
    const both = poseAt('both', 1000, 0, false);
    expect(both.both).toBe(1);
    expect(both.jump).toBeGreaterThan(0);
  });

  it('settles back to idle after a reaction', () => {
    const state = createCharacterState();
    state.jump = 1;
    state.wave = 1;
    state.headLift = -0.04;
    const idle = poseAt('idle', 0, 0, true);
    for (let i = 0; i < 50; i += 1) stepCharacter(state, idle, 0.05);
    expect(state.jump).toBeLessThan(0.05);
    expect(state.wave).toBeLessThan(0.05);
    expect(state.headLift).toBeGreaterThan(-0.005);
    expect(state.scaleY).toBeCloseTo(1, 1);
  });

  it('keeps a readable pose when motion is reduced', () => {
    const jump = poseAt('jump', 450, 0, true);
    expect(jump.jump).toBeGreaterThan(0);
    expect(jump.jump).toBeLessThan(0.5);
    expect(jump.scaleY).toBe(1);
    expect(poseAt('wave', 1000, 0, true).wave).toBe(1);
  });
});

describe('me page reuses milk-frog assets', () => {
  it('points the page at the shared wasm directory and model', () => {
    const main = readFileSync('src/scenes/me/main.ts', 'utf8');
    const shared = readFileSync('src/scenes/portrait/page.ts', 'utf8');
    const html = readFileSync('me/index.html', 'utf8');
    expect(main).toContain('mountGesturePortrait');
    expect(main).toContain("folder: 'me'");
    expect(shared).toContain('MILK_FROG_WASM_DIR');
    expect(shared).toContain('MILK_FROG_MODEL');
    expect(shared).toContain('cameraErrorMessage');
    expect(main).not.toContain('cdn.');
    expect(MILK_FROG_WASM_DIR).toBe('milk-frog/wasm');
    expect(MILK_FROG_MODEL).toBe('milk-frog/hand_landmarker.task');
    expect(existsSync(`public/${MILK_FROG_MODEL}`)).toBe(true);
    expect(existsSync('public/me/hand_landmarker.task')).toBe(false);
    expect(existsSync('public/me/person.webp')).toBe(true);
    expect(existsSync('public/me/head.png')).toBe(true);
    expect(html).toContain('用手势，让它做个反应');
    expect(html).toContain('1 挥手');
    expect(html).toContain('4 张掌');
    expect(html).toContain('开启摄像头');
    expect(html).not.toMatch(/cdn\.|googleapis|jsdelivr|unpkg|esm\.sh/i);
  });
});
