export interface Point {
  x: number;
  y: number;
}

/** Fist rebuilds the tree, an open palm bursts it, and OK raises the photos. */
export type HandPose = 'fist' | 'open' | 'ok' | 'none';
export type SceneMode = 'tree' | 'burst' | 'photos';

export const MODE_BY_KEY: Record<string, SceneMode> = {
  '1': 'tree',
  '2': 'burst',
  '3': 'photos',
};

export function isSceneMode(value: string | undefined): value is SceneMode {
  return value === 'tree' || value === 'burst' || value === 'photos';
}

export function modeForPose(pose: HandPose): SceneMode | null {
  if (pose === 'fist') return 'tree';
  if (pose === 'open') return 'burst';
  if (pose === 'ok') return 'photos';
  return null;
}

export function poseForMode(mode: SceneMode): Exclude<HandPose, 'none'> {
  if (mode === 'tree') return 'fist';
  if (mode === 'burst') return 'open';
  return 'ok';
}

export function poseLabel(pose: HandPose): string {
  if (pose === 'fist') return '握拳 · 圣诞树';
  if (pose === 'open') return '张开手掌 · 光点';
  if (pose === 'ok') return 'OK · 照片';
  return '未识别';
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** A finger counts as extended when its tip is clearly farther from the wrist than its PIP joint. */
function fingerExtended(landmarks: Point[], tip: number, pip: number): boolean {
  const wrist = landmarks[0];
  const tipPoint = landmarks[tip];
  const pipPoint = landmarks[pip];
  if (!wrist || !tipPoint || !pipPoint) return false;
  return distance(tipPoint, wrist) > distance(pipPoint, wrist) * 1.18;
}

function palmSize(landmarks: Point[]): number {
  const wrist = landmarks[0];
  const middle = landmarks[9];
  const index = landmarks[5];
  const pinky = landmarks[17];
  if (!wrist) return 1e-4;
  const along = middle ? distance(wrist, middle) : 0;
  const across = index && pinky ? distance(index, pinky) : 0;
  return Math.max(along, across, 1e-4);
}

/**
 * OK is decided before fist or open palm. A thumb-index pinch with the other
 * fingers up stays OK even when the index still looks extended, so the circle
 * is not swallowed by an open-palm reading.
 */
export function classifyHandPose(landmarks: Point[]): HandPose {
  if (landmarks.length < 21) return 'none';
  const thumb = landmarks[4];
  const indexTip = landmarks[8];
  if (!thumb || !indexTip) return 'none';
  const pinch = distance(thumb, indexTip);
  const middle = fingerExtended(landmarks, 12, 10);
  const ring = fingerExtended(landmarks, 16, 14);
  const pinky = fingerExtended(landmarks, 20, 18);
  const others = [middle, ring, pinky].filter(Boolean).length;
  if (pinch < palmSize(landmarks) * 0.48 && others >= 2) return 'ok';

  const index = fingerExtended(landmarks, 8, 6);
  const extended = [index, middle, ring, pinky].filter(Boolean).length;
  if (extended === 0) return 'fist';
  if (extended >= 4) return 'open';
  return 'none';
}

export interface DebounceOptions {
  window: number;
  okVotes: number;
  poseVotes: number;
  minHoldMs: number;
  okHoldMs: number;
}

export const DEFAULT_DEBOUNCE: DebounceOptions = {
  window: 8,
  okVotes: 3,
  poseVotes: 5,
  minHoldMs: 480,
  okHoldMs: 220,
};

export interface DebounceState {
  history: HandPose[];
  stable: HandPose;
  committedAt: number;
}

export function createDebounce(now = 0): DebounceState {
  return { history: [], stable: 'none', committedAt: now };
}

export function lockPose(pose: Exclude<HandPose, 'none'>, now: number, options: DebounceOptions = DEFAULT_DEBOUNCE): DebounceState {
  return {
    history: Array.from({ length: options.window }, () => pose),
    stable: pose,
    committedAt: now,
  };
}

export function tally(history: readonly HandPose[]): Record<HandPose, number> {
  const counts: Record<HandPose, number> = { fist: 0, open: 0, ok: 0, none: 0 };
  for (const pose of history) counts[pose] += 1;
  return counts;
}

/** OK wins as soon as it has enough votes, even when fist or open appears more often. */
export function decidePose(
  history: readonly HandPose[],
  previous: HandPose,
  options: DebounceOptions = DEFAULT_DEBOUNCE,
): HandPose {
  const recent = history.slice(-options.window);
  const counts = tally(recent);
  if (counts.ok >= options.okVotes) return 'ok';
  let best = previous;
  let bestCount = options.poseVotes - 1;
  for (const pose of ['fist', 'open'] as const) {
    const count = counts[pose];
    if (count > bestCount) {
      best = pose;
      bestCount = count;
    }
  }
  return best;
}

export interface PoseStep {
  state: DebounceState;
  mode: SceneMode | null;
}

export function pushPose(
  state: DebounceState,
  pose: HandPose,
  now: number,
  options: DebounceOptions = DEFAULT_DEBOUNCE,
): PoseStep {
  const history = state.history.concat(pose).slice(-options.window);
  const next = decidePose(history, state.stable, options);
  const mode = modeForPose(next);
  if (next === state.stable || !mode) {
    return { state: { history, stable: state.stable, committedAt: state.committedAt }, mode: null };
  }
  const held = now - state.committedAt;
  const needed = next === 'ok' ? options.okHoldMs : options.minHoldMs;
  if (state.stable !== 'none' && held < needed) {
    return { state: { history, stable: state.stable, committedAt: state.committedAt }, mode: null };
  }
  return { state: { history, stable: next, committedAt: now }, mode };
}
