export interface Point {
  x: number;
  y: number;
}

export type Pose = 'fist' | 'peace' | 'open' | 'none';
export type Reaction = 'wave' | 'jump' | 'surprised' | 'both';

export const REACTION_BY_KEY: Record<string, Reaction> = {
  '1': 'wave',
  '2': 'jump',
  '3': 'surprised',
  '4': 'both',
};

export function isReaction(value: string | undefined): value is Reaction {
  return value === 'wave' || value === 'jump' || value === 'surprised' || value === 'both';
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** A finger counts as extended when its tip is clearly farther from the wrist than its PIP joint. */
function fingerExtended(landmarks: Point[], tip: number, pip: number): boolean {
  const wrist = landmarks[0];
  if (!wrist || !landmarks[tip] || !landmarks[pip]) return false;
  return distance(landmarks[tip], wrist) > distance(landmarks[pip], wrist) * 1.18;
}

export function classifyPose(landmarks: Point[]): Pose {
  if (landmarks.length < 21) return 'none';
  const index = fingerExtended(landmarks, 8, 6);
  const middle = fingerExtended(landmarks, 12, 10);
  const ring = fingerExtended(landmarks, 16, 14);
  const pinky = fingerExtended(landmarks, 20, 18);
  const extended = [index, middle, ring, pinky].filter(Boolean).length;
  if (extended === 0) return 'fist';
  if (index && middle && !ring && !pinky) {
    const tips = landmarks[8] && landmarks[12] ? distance(landmarks[8], landmarks[12]) : 0;
    const roots = landmarks[5] && landmarks[9] ? distance(landmarks[5], landmarks[9]) : 0;
    if (tips > roots * 0.45) return 'peace';
  }
  if (extended >= 4) return 'open';
  return 'none';
}

export interface MotionSample {
  t: number;
  x: number;
}

export function motionSpan(samples: readonly MotionSample[], now: number, windowMs = 700): { span: number; reversals: number } {
  const recent = samples.filter((sample) => now - sample.t <= windowMs);
  if (recent.length < 3) return { span: 0, reversals: 0 };
  let min = Infinity;
  let max = -Infinity;
  for (const sample of recent) {
    if (sample.x < min) min = sample.x;
    if (sample.x > max) max = sample.x;
  }
  let reversals = 0;
  for (let i = 2; i < recent.length; i += 1) {
    const previous = recent[i - 1]!;
    const before = recent[i - 2]!;
    const current = recent[i]!;
    const left = previous.x - before.x;
    const right = current.x - previous.x;
    if (left * right < 0 && Math.abs(left) > 0.008 && Math.abs(right) > 0.008) reversals += 1;
  }
  return { span: max - min, reversals };
}

/**
 * Wave is a moving open hand. A still open palm that has been held becomes the
 * two-arm reaction, so a resting palm does not look like a wave.
 */
export function reactionForPose(pose: Pose, heldMs: number, span: number, reversals: number): Reaction | null {
  if (pose === 'fist' && heldMs >= 160) return 'surprised';
  if (pose === 'peace' && heldMs >= 160) return 'jump';
  if (pose === 'open') {
    if (span >= 0.08 && reversals >= 1) return 'wave';
    if (heldMs >= 480 && span < 0.04) return 'both';
  }
  return null;
}

export function gestureLabel(pose: Pose, reaction: Reaction | null): string {
  if (reaction === 'wave') return '挥手';
  if (pose === 'peace' || reaction === 'jump') return '剪刀手';
  if (pose === 'fist' || reaction === 'surprised') return '握拳';
  if (pose === 'open' || reaction === 'both') return '张开手掌';
  return '未识别';
}

export interface CameraContext {
  secure: boolean;
  supported: boolean;
}

function errorName(error: unknown): string {
  if (typeof error === 'object' && error && 'name' in error && typeof error.name === 'string') return error.name;
  return '';
}

export function cameraErrorMessage(error: unknown, context: CameraContext): string {
  const name = errorName(error);
  if (!context.secure || name === 'SecurityError') {
    return '摄像头需要 HTTPS 才能使用。请通过 https 链接打开本页。';
  }
  if (!context.supported) {
    return '当前浏览器不能打开摄像头。如果是在微信里打开，请点右上角 … ，选择在系统浏览器中打开。';
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return '摄像头权限被拒绝。如果是在微信里打开，请点右上角 … ，选择在系统浏览器中打开。';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
    return '没有找到可用的前置摄像头。';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return '摄像头暂时无法打开，可能正被其他应用占用。请关闭后重试。';
  }
  return '无法开启摄像头。如果是在微信里打开，请点右上角 … ，选择在系统浏览器中打开。';
}
