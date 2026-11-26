import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  burstPoint,
  createCloud,
  horizontalRadius,
  mulberry32,
  TREE_HEIGHT,
  treePoint,
} from '../src/scenes/christmas/cloud';
import {
  classifyHandPose,
  createDebounce,
  decidePose,
  DEFAULT_DEBOUNCE,
  lockPose,
  MODE_BY_KEY,
  poseForMode,
  pushPose,
  type HandPose,
  type Point,
} from '../src/scenes/christmas/gestures';
import { frameCover, MAX_LOCAL_PHOTOS, selectLocalImages } from '../src/scenes/christmas/photos';
import {
  cappedPixelRatio,
  framePose,
  framePresence,
  ornamentPresence,
  particleBudget,
  popScale,
  starPresence,
  stepStage,
} from '../src/scenes/christmas/stage';

function placeFinger(landmarks: Point[], mcp: number, x: number, extended: boolean): void {
  for (let joint = 0; joint < 4; joint += 1) {
    landmarks[mcp + joint] = extended
      ? { x, y: 0.62 - joint * 0.12 }
      : { x: 0.5 + (x - 0.5) * 0.15, y: 0.68 + joint * 0.03 };
  }
}

function makeHand(flags: { index: boolean; middle: boolean; ring: boolean; pinky: boolean }): Point[] {
  const landmarks: Point[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.74 }));
  landmarks[0] = { x: 0.5, y: 0.86 };
  landmarks[1] = { x: 0.38, y: 0.78 };
  landmarks[2] = { x: 0.34, y: 0.7 };
  landmarks[3] = { x: 0.32, y: 0.62 };
  landmarks[4] = { x: 0.3, y: 0.54 };
  placeFinger(landmarks, 5, 0.42, flags.index);
  placeFinger(landmarks, 9, 0.5, flags.middle);
  placeFinger(landmarks, 13, 0.58, flags.ring);
  placeFinger(landmarks, 17, 0.66, flags.pinky);
  return landmarks;
}

function pinch(landmarks: Point[]): void {
  const indexTip = landmarks[8];
  if (!indexTip) return;
  landmarks[4] = { x: indexTip.x + 0.01, y: indexTip.y + 0.01 };
}

describe('christmas hand poses', () => {
  it('classifies a fist, an open palm, and ignores a short landmark list', () => {
    expect(classifyHandPose(makeHand({ index: false, middle: false, ring: false, pinky: false }))).toBe('fist');
    expect(classifyHandPose(makeHand({ index: true, middle: true, ring: true, pinky: true }))).toBe('open');
    expect(classifyHandPose(makeHand({ index: true, middle: true, ring: false, pinky: false }))).toBe('none');
    expect(classifyHandPose([])).toBe('none');
  });

  it('prefers OK when the thumb pinches the index, even if that index still reads as extended', () => {
    const ok = makeHand({ index: false, middle: true, ring: true, pinky: true });
    pinch(ok);
    expect(classifyHandPose(ok)).toBe('ok');

    const pinchedOpen = makeHand({ index: true, middle: true, ring: true, pinky: true });
    pinch(pinchedOpen);
    expect(classifyHandPose(pinchedOpen)).toBe('ok');

    const pinchedFist = makeHand({ index: false, middle: false, ring: false, pinky: false });
    pinch(pinchedFist);
    expect(classifyHandPose(pinchedFist)).toBe('fist');
  });

  it('lets three OK votes beat a larger run of open palms', () => {
    const history: HandPose[] = ['open', 'open', 'open', 'open', 'open', 'ok', 'ok', 'ok'];
    expect(decidePose(history, 'open')).toBe('ok');
    expect(decidePose(['open', 'open', 'open', 'open'], 'none')).toBe('none');
    expect(decidePose(['fist', 'fist', 'fist', 'fist', 'fist'], 'none')).toBe('fist');
  });

  it('debounces fist and open palm, and lets OK interrupt sooner', () => {
    let state = createDebounce(0);
    let mode: string | null = null;
    for (let i = 0; i < 4; i += 1) {
      const step = pushPose(state, 'fist', (i + 1) * 40);
      state = step.state;
      mode = step.mode ?? mode;
    }
    expect(mode).toBeNull();
    const fifth = pushPose(state, 'fist', 200);
    expect(fifth.mode).toBe('tree');

    let held = lockPose('fist', 0);
    let switched: string | null = null;
    for (let i = 0; i < 6; i += 1) {
      const step = pushPose(held, 'open', 80 + i * 40);
      held = step.state;
      switched = step.mode ?? switched;
    }
    expect(switched).toBeNull();
    const later = pushPose(held, 'open', 520);
    expect(later.mode).toBe('burst');

    let posing = lockPose('open', 0);
    for (let i = 0; i < 2; i += 1) posing = pushPose(posing, 'ok', 70 + i * 70).state;
    const early = pushPose(posing, 'ok', 180);
    expect(early.mode).toBeNull();
    const ready = pushPose(early.state, 'ok', 260);
    expect(ready.mode).toBe('photos');
    expect(poseForMode('photos')).toBe('ok');
    expect(MODE_BY_KEY['1']).toBe('tree');
    expect(MODE_BY_KEY['2']).toBe('burst');
    expect(MODE_BY_KEY['3']).toBe('photos');
    expect(DEFAULT_DEBOUNCE.okVotes).toBeLessThan(DEFAULT_DEBOUNCE.poseVotes);
    expect(DEFAULT_DEBOUNCE.okHoldMs).toBeLessThan(DEFAULT_DEBOUNCE.minHoldMs);
  });
});

describe('christmas stage', () => {
  it('holds photos until the cloud opens, then holds the tree until the frames leave', () => {
    let stage = stepStage({ particle: 0, photos: 0 }, 'photos', 0.4);
    expect(stage.photos).toBe(0);
    expect(stage.particle).toBeGreaterThan(0.3);
    expect(stage.particle).toBeLessThan(0.72);
    for (let i = 0; i < 40; i += 1) stage = stepStage(stage, 'photos', 0.12);
    expect(stage.particle).toBeGreaterThan(0.72);
    expect(stage.photos).toBeGreaterThan(0.5);

    const before = stage.particle;
    const fading = stepStage(stage, 'tree', 0.12);
    expect(fading.photos).toBeLessThan(stage.photos);
    expect(fading.particle).toBeCloseTo(before, 5);

    let back = fading;
    for (let i = 0; i < 40; i += 1) back = stepStage(back, 'tree', 0.12);
    expect(back.photos).toBeLessThan(0.05);
    expect(back.particle).toBeLessThan(0.05);

    expect(stepStage({ particle: 0, photos: 0 }, 'photos', 0.01, true)).toEqual({ particle: 1, photos: 1 });
    expect(stepStage({ particle: 1, photos: 1 }, 'burst', 0.01, true)).toEqual({ particle: 1, photos: 0 });
    expect(stepStage({ particle: 1, photos: 1 }, 'tree', 0.01, true)).toEqual({ particle: 0, photos: 0 });
  });

  it('fans photo frames across the front of the cloud', () => {
    const poses = [0, 1, 2, 3].map((index) => framePose(index, 4, 0.4));
    const xs = poses.map((pose) => pose.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(2);
    poses.forEach((pose) => {
      expect(pose.z).toBeGreaterThan(0);
      expect(pose.z).toBeLessThan(1);
      expect(pose.y).toBeGreaterThan(1.5);
    });
  });

  it('pops later frames after earlier ones and dissolves the star before the baubles', () => {
    expect(framePresence(0.15, 0, 4)).toBeGreaterThan(0);
    expect(framePresence(0.15, 3, 4)).toBe(0);
    expect(framePresence(1, 3, 4)).toBe(1);
    expect(popScale(0)).toBe(0);
    expect(popScale(1)).toBeCloseTo(0.92, 5);
    expect(starPresence(0)).toBe(1);
    expect(starPresence(1)).toBe(0);
    expect(ornamentPresence(0.62)).toBe(1);
    expect(ornamentPresence(1)).toBe(0);
    expect(starPresence(0.5)).toBeLessThan(ornamentPresence(0.5));
  });

  it('caps pixel ratio and particle count for phones and reduced motion', () => {
    expect(cappedPixelRatio(3, 1280, false)).toBe(1.5);
    expect(cappedPixelRatio(3, 390, false)).toBe(1.25);
    expect(cappedPixelRatio(3, 1280, true)).toBe(1);
    expect(cappedPixelRatio(0.5, 1280, false)).toBe(1);
    expect(particleBudget(1280, false)).toBe(11000);
    expect(particleBudget(390, false)).toBe(7000);
    expect(particleBudget(1280, true)).toBe(3200);
  });
});

describe('christmas cloud and local photos', () => {
  it('builds a tapering tree and a bounded spark cloud', () => {
    const random = mulberry32(7);
    const samples = Array.from({ length: 800 }, () => treePoint(random));
    const average = (points: { x: number; y: number; z: number }[]) => (
      points.reduce((sum, point) => sum + horizontalRadius(point), 0) / points.length
    );
    const top = samples.filter((point) => point.y > TREE_HEIGHT * 0.8);
    const bottom = samples.filter((point) => point.y < TREE_HEIGHT * 0.2);
    expect(top.length).toBeGreaterThan(20);
    expect(bottom.length).toBeGreaterThan(20);
    expect(average(top)).toBeLessThan(average(bottom) * 0.45);
    expect(Math.max(...samples.map((point) => point.y))).toBeLessThanOrEqual(TREE_HEIGHT);
    expect(Math.min(...samples.map((point) => point.y))).toBeGreaterThanOrEqual(0);

    const cloud = createCloud(500, mulberry32(3));
    expect(cloud.needles.tree.length + cloud.sparks.tree.length).toBe(500 * 3);
    expect(cloud.sparks.size.length).toBeGreaterThan(20);
    for (let i = 0; i < 200; i += 1) {
      const point = burstPoint(mulberry32(20 + i));
      expect(Math.hypot(point.x, point.z)).toBeLessThan(3.1);
      expect(point.y).toBeGreaterThan(-1.4);
      expect(point.y).toBeLessThan(4.3);
    }
    let warm = 0;
    for (let i = 0; i < cloud.needles.color.length; i += 3) {
      const red = cloud.needles.color[i] ?? 0;
      const green = cloud.needles.color[i + 1] ?? 0;
      if (red > 0.8 && green > 0.5) warm += 1;
    }
    expect(warm).toBe(cloud.needles.size.length);
  });

  it('keeps uploads local, cropped, and capped', () => {
    const files = [
      { type: 'image/jpeg', name: 'a.jpg' },
      { type: 'text/plain', name: 'note.txt' },
      { type: 'image/png', name: 'b.png' },
      { type: 'image/webp', name: 'c.webp' },
      { type: 'image/gif', name: 'd.gif' },
      { type: 'image/png', name: 'e.png' },
      { type: 'image/png', name: 'f.png' },
      { type: 'image/png', name: 'g.png' },
    ];
    expect(selectLocalImages(files).map((file) => file.name)).toEqual(['a.jpg', 'b.png', 'c.webp', 'd.gif', 'e.png', 'f.png']);
    expect(selectLocalImages(files, 2)).toHaveLength(2);
    expect(MAX_LOCAL_PHOTOS).toBe(6);
    const wide = frameCover(1600, 900);
    expect(wide.repeatX).toBeLessThan(1);
    expect(wide.repeatY).toBe(1);
    expect(wide.offsetX).toBeGreaterThan(0);
    const tall = frameCover(600, 1200);
    expect(tall.repeatX).toBe(1);
    expect(tall.repeatY).toBeLessThan(1);
    expect(tall.offsetY).toBeGreaterThan(0);
  });

  it('opts into the camera, keeps photos on-device, and does not borrow cutout portraits', () => {
    const html = readFileSync('christmas/index.html', 'utf8');
    const main = readFileSync('src/scenes/christmas/main.ts', 'utf8');
    const samples = readFileSync('src/scenes/christmas/samples.ts', 'utf8');
    expect(html).toContain('MERRY CHRISTMAS');
    expect(html).toContain('data-mode="tree"');
    expect(html).toContain('data-mode="burst"');
    expect(html).toContain('data-mode="photos"');
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="image/*"');
    expect(html).toContain('multiple');
    expect(html).toContain('id="cam-button"');
    expect(html).not.toContain('getUserMedia');
    expect(html).not.toMatch(/<video[^>]*autoplay/i);
    expect(html).not.toMatch(/cdn\.|googleapis|jsdelivr|unpkg|esm\.sh/i);
    const source = `${main}\n${samples}`;
    expect(source).toContain('URL.createObjectURL');
    expect(source).toContain('URL.revokeObjectURL');
    expect(source).toContain('示例');
    expect(source).not.toMatch(/fetch\(|XMLHttpRequest|FormData|sendBeacon|unsplash|randomuser|picsum|thispersondoesnotexist/i);
    expect(source).not.toMatch(/person\.webp|\/me\/|\/bunny\//);
    const calls = [...main.matchAll(/\.getUserMedia\s*\(/g)];
    expect(calls).toHaveLength(1);
    const callAt = calls[0]?.index ?? 0;
    expect(main.slice(0, callAt)).toContain('async function startCamera');
    expect(main).toContain('if (stream) stopCamera()');
    expect(main).toContain("addEventListener('click'");
    expect(main).toContain('MILK_FROG_WASM_DIR');
    expect(main).toContain('MILK_FROG_MODEL');
  });
});
