import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createConstellation,
  createStarfield,
  edgeVisibility,
  graphIsConnected,
  horizontalReach,
  loosenedPosition,
  maxEdgeLength,
  mulberry32,
  nextPin,
  ornamentAnchor,
  stepSnow,
} from '../src/scenes/christmas/constellation';
import {
  classifyHandPose,
  createDebounce,
  decidePose,
  DEFAULT_DEBOUNCE,
  fingertipPoints,
  handMotion,
  lockPose,
  MODE_BY_KEY,
  poseForMode,
  pushPose,
  tetherGoal,
  type HandPose,
  type Point,
} from '../src/scenes/christmas/gestures';
import { frameCover, MAX_LOCAL_PHOTOS, selectLocalImages } from '../src/scenes/christmas/photos';
import {
  cappedPixelRatio,
  framePresence,
  popScale,
  starBudget,
  stepStage,
} from '../src/scenes/christmas/stage';

function placeFinger(landmarks: Point[], mcp: number, x: number, extended: boolean): void {
  for (let joint = 0; joint < 4; joint += 1) {
    landmarks[mcp + joint] = extended
      ? { x, y: 0.62 - joint * 0.12 }
      : { x, y: 0.7 + joint * 0.02 };
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
  landmarks[4] = { x: indexTip.x + 0.012, y: indexTip.y + 0.008 };
}

describe('christmas hand poses', () => {
  it('classifies a fist, an open palm, and ignores a short landmark list', () => {
    expect(classifyHandPose(makeHand({ index: false, middle: false, ring: false, pinky: false }))).toBe('fist');
    expect(classifyHandPose(makeHand({ index: true, middle: true, ring: true, pinky: true }))).toBe('open');
    expect(classifyHandPose(makeHand({ index: true, middle: true, ring: false, pinky: false }))).toBe('none');
    expect(classifyHandPose([])).toBe('none');
  });

  it('prefers OK over a pinch, and a tight pinch with curled fingers places a star', () => {
    const ok = makeHand({ index: false, middle: true, ring: true, pinky: true });
    pinch(ok);
    expect(classifyHandPose(ok)).toBe('ok');

    const pinchedOpen = makeHand({ index: true, middle: true, ring: true, pinky: true });
    pinch(pinchedOpen);
    expect(classifyHandPose(pinchedOpen)).toBe('ok');

    const placing = makeHand({ index: false, middle: false, ring: false, pinky: false });
    pinch(placing);
    expect(classifyHandPose(placing)).toBe('pinch');
    expect(fingertipPoints(placing)).toHaveLength(5);
  });

  it('lets three OK votes beat a larger run of pinches or open palms', () => {
    const history: HandPose[] = ['open', 'open', 'open', 'open', 'open', 'ok', 'ok', 'ok'];
    expect(decidePose(history, 'open')).toBe('ok');
    expect(decidePose(['pinch', 'pinch', 'pinch', 'pinch', 'pinch', 'ok', 'ok', 'ok'], 'pinch')).toBe('ok');
    expect(decidePose(['pinch', 'pinch', 'pinch', 'pinch', 'pinch'], 'none')).toBe('pinch');
    expect(decidePose(['open', 'open', 'open', 'open'], 'none')).toBe('none');
    expect(decidePose(['fist', 'fist', 'fist', 'fist', 'fist'], 'none')).toBe('fist');
  });

  it('debounces the three scenes, and a pinch pins without changing the scene', () => {
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
    expect(fifth.pinned).toBe(false);

    let held = lockPose('fist', 0);
    let switched: string | null = null;
    for (let i = 0; i < 6; i += 1) {
      const step = pushPose(held, 'open', 80 + i * 40);
      held = step.state;
      switched = step.mode ?? switched;
    }
    expect(switched).toBeNull();
    const later = pushPose(held, 'open', 520);
    expect(later.mode).toBe('snow');

    let posing = lockPose('open', 0);
    for (let i = 0; i < 2; i += 1) posing = pushPose(posing, 'ok', 70 + i * 70).state;
    const early = pushPose(posing, 'ok', 180);
    expect(early.mode).toBeNull();
    const ready = pushPose(early.state, 'ok', 260);
    expect(ready.mode).toBe('photos');

    let pinning = lockPose('fist', 0);
    for (let i = 0; i < 4; i += 1) pinning = pushPose(pinning, 'pinch', 40 + i * 30).state;
    const placed = pushPose(pinning, 'pinch', 280);
    expect(placed.mode).toBeNull();
    expect(placed.pinned).toBe(true);
    expect(poseForMode('snow')).toBe('open');
    expect(MODE_BY_KEY['1']).toBe('tree');
    expect(MODE_BY_KEY['2']).toBe('snow');
    expect(MODE_BY_KEY['3']).toBe('photos');
    expect(DEFAULT_DEBOUNCE.okVotes).toBeLessThan(DEFAULT_DEBOUNCE.poseVotes);
    expect(tetherGoal(true, 'fist')).toBe(0);
    expect(tetherGoal(true, 'open')).toBeGreaterThan(0);
    expect(tetherGoal(false, 'open')).toBe(0);
    expect(handMotion({ x: 0, y: 0 }, { x: 0.3, y: 0.4 })).toBeCloseTo(0.5, 5);
  });
});

describe('constellation tree', () => {
  it('reads as a connected triangular tree, with the outline kept when lines soften', () => {
    const { nodes, edges } = createConstellation();
    expect(nodes[0]?.kind).toBe('apex');
    expect(nodes[0]?.y).toBe(Math.max(...nodes.map((item) => item.y)));
    expect(graphIsConnected(nodes.length, edges)).toBe(true);
    expect(maxEdgeLength(nodes, edges)).toBeLessThan(0.75);
    expect(edges.every((edge) => edge.a >= 0 && edge.b >= 0 && edge.a < nodes.length && edge.b < nodes.length)).toBe(true);
    const crown = horizontalReach(nodes, 0.85, 1.05);
    const skirt = horizontalReach(nodes, 0.1, 0.25);
    expect(crown).toBeLessThan(skirt * 0.45);
    expect(edgeVisibility(0, edges.length - 1, edges.length)).toBe(1);
    expect(edgeVisibility(1, 0, edges.length)).toBeGreaterThan(0.8);
    expect(edgeVisibility(1, edges.length - 1, edges.length)).toBe(0);
    const drifted = loosenedPosition(nodes[6]!, 1, 0);
    expect(Math.abs(drifted.x)).toBeGreaterThan(Math.abs(nodes[6]!.x));
  });

  it('hangs photo ornaments on the branches and keeps the sky sparse', () => {
    const upper = ornamentAnchor(0, 4);
    const lower = ornamentAnchor(2, 4);
    expect(Math.abs(lower.x)).toBeGreaterThan(Math.abs(upper.x));
    expect(upper.y).toBeGreaterThan(lower.y);
    expect(nextPin(0)).not.toEqual(nextPin(1));
    expect(nextPin(8)).toEqual(nextPin(0));
    const stars = createStarfield(starBudget(1280, false), mulberry32(3));
    expect(stars.length).toBeLessThan(200);
    expect(starBudget(400, true)).toBeLessThan(starBudget(400, false));
    expect(cappedPixelRatio(3, 1280, false)).toBe(1.5);
    expect(cappedPixelRatio(3, 1280, true)).toBe(1);
  });

  it('lets fine snow drift downward and snaps the three states when motion is reduced', () => {
    const flakes = [{ x: 0.4, y: 0.6, speed: 0.05, drift: 0.2, size: 1 }];
    stepSnow(flakes, 0.5, 1);
    expect(flakes[0]?.y).toBeLessThan(0.6);
    const held = flakes.map((flake) => ({ ...flake }));
    stepSnow(held, 0.5, 1, true);
    expect(held[0]?.y).toBe(flakes[0]?.y);

    let stage = stepStage({ loosen: 0, snow: 0, photos: 0 }, 'snow', 0.35);
    expect(stage.loosen).toBeGreaterThan(0.3);
    expect(stage.snow).toBeGreaterThan(0.2);
    expect(stage.photos).toBe(0);
    stage = stepStage(stage, 'photos', 0.01, true);
    expect(stage).toEqual({ loosen: 0, snow: 0, photos: 1 });
    expect(stepStage(stage, 'tree', 0.01, true)).toEqual({ loosen: 0, snow: 0, photos: 0 });
    expect(framePresence(0.1, 0, 4)).toBeGreaterThan(framePresence(0.1, 3, 4));
    expect(popScale(0)).toBe(0);
    expect(popScale(1)).toBeCloseTo(0.92, 5);
  });

  it('keeps uploads local and does not request the camera on load', () => {
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
    expect(MAX_LOCAL_PHOTOS).toBe(6);
    const wide = frameCover(1600, 900);
    expect(wide.repeatX).toBeLessThan(1);
    expect(wide.offsetX).toBeGreaterThan(0);

    const html = readFileSync('christmas/index.html', 'utf8');
    const main = readFileSync('src/scenes/christmas/main.ts', 'utf8');
    const samples = readFileSync('src/scenes/christmas/samples.ts', 'utf8');
    expect(html).toContain('MERRY CHRISTMAS');
    expect(html).toContain('data-mode="tree"');
    expect(html).toContain('data-mode="snow"');
    expect(html).toContain('data-mode="photos"');
    expect(html).toContain('id="pin-button"');
    expect(html).toContain('type="file"');
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
    expect(main).toContain('MILK_FROG_WASM_DIR');
    expect(main).toContain('MILK_FROG_MODEL');
  });
});
