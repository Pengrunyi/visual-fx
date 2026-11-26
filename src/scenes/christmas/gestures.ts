export interface Point {
  x: number;
  y: number;
}

/** Fist finishes the tree, an open palm brings snow, OK hangs photos, and a pinch pins a star. */
export type HandPose = 'fist' | 'open' | 'ok' | 'pinch' | 'none';
export type SceneMode = 'tree' | 'snow' | 'photos';

export const MODE_BY_KEY: Record<string, SceneMode> = {
  '1': 'tree',
  '2': 'snow',
  '3': 'photos',
};

export const FINGERTIP_INDEXES = [4, 8, 12, 16, 20] as const;

export function isSceneMode(value: string | undefined): value is SceneMode {
  return value === 'tree' || value === 'snow' || value === 'photos';
}

export function modeForPose(pose: HandPose): SceneMode | null {
  if (pose === 'fist') return 'tree';
  if (pose === 'open') return 'snow';
  if (pose === 'ok') return 'photos';
  return null;
}

export function poseForMode(mode: SceneMode): Exclude<HandPose, 'none' | 'pinch'> {
  if (mode === 'tree') return 'fist';
  if (mode === 'snow') return 'open';
  return 'ok';
}

export function poseLabel(pose: HandPose): string {
  if (pose === 'fist') return '握拳 · 成树';
  if (pose === 'open') return '张开手掌 · 细雪';
  if (pose === 'ok') return 'OK · 照片';
  if (pose === 'pinch') return '捏合 · 钉星';
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
 * OK is decided before pinch, fist, or open palm. A thumb-index circle with the
 * other fingers up stays OK. A tight pinch with those fingers down places a star.
 */
export function classifyHandPose(landmarks: Point[]): HandPose {
  if (landmarks.length < 21) return 'none';
  const thumb = landmarks[4];
  const indexTip = landmarks[8];
  const middleTip = landmarks[12];
  if (!thumb || !indexTip) return 'none';
  const pinch = distance(thumb, indexTip);
  const palm = palmSize(landmarks);
  const middle = fingerExtended(landmarks, 12, 10);
  const ring = fingerExtended(landmarks, 16, 14);
  const pinky = fingerExtended(landmarks, 20, 18);
  const index = fingerExtended(landmarks, 8, 6);
  const others = [middle, ring, pinky].filter(Boolean).length;
  const tight = pinch < palm * 0.42;
  if (tight && others >= 2) return 'ok';
  if (tight && others === 0 && middleTip && pinch < distance(thumb, middleTip) * 0.72) return 'pinch';
  const extended = [index, middle, ring, pinky].filter(Boolean).length;
  if (extended === 0) return 'fist';
  if (extended >= 4) return 'open';
  return 'none';
}

export function fingertipPoints(landmarks: readonly Point[]): Point[] {
  return FINGERTIP_INDEXES.flatMap((index) => {
    const point = landmarks[index];
    return point ? [point] : [];
  });
}

export function handMotion(previous: Point | null, next: Point | null): number {
  if (!previous || !next) return 0;
  return Math.hypot(next.x - previous.x, next.y - previous.y);
}

/** Fist pulls the finger-stars home. An open palm keeps a soft tether. Motion draws the rest. */
export function tetherGoal(handVisible: boolean, pose: HandPose): number {
  if (!handVisible || pose === 'fist') return 0;
  if (pose === 'open') return 0.42;
  return 1;
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
  const counts: Record<HandPose, number> = { fist: 0, open: 0, ok: 0, pinch: 0, none: 0 };
  for (const pose of history) counts[pose] += 1;
  return counts;
}

/** OK wins as soon as it has enough votes, even when pinch, fist, or open appears more often. */
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
  for (const pose of ['fist', 'open', 'pinch'] as const) {
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
  pinned: boolean;
}

export function pushPose(
  state: DebounceState,
  pose: HandPose,
  now: number,
  options: DebounceOptions = DEFAULT_DEBOUNCE,
): PoseStep {
  const history = state.history.concat(pose).slice(-options.window);
  const next = decidePose(history, state.stable, options);
  if (next === state.stable) {
    return { state: { history, stable: state.stable, committedAt: state.committedAt }, mode: null, pinned: false };
  }
  const mode = modeForPose(next);
  const pinning = next === 'pinch';
  if (!mode && !pinning) {
    return { state: { history, stable: state.stable, committedAt: state.committedAt }, mode: null, pinned: false };
  }
  const held = now - state.committedAt;
  const needed = next === 'ok' || next === 'pinch' ? options.okHoldMs : options.minHoldMs;
  if (state.stable !== 'none' && held < needed) {
    return { state: { history, stable: state.stable, committedAt: state.committedAt }, mode: null, pinned: false };
  }
  return {
    state: { history, stable: next, committedAt: now },
    mode,
    pinned: pinning,
  };
}
