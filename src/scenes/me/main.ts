import '../../styles/scene.css';
import './me.css';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { mountHud } from '../../lib/hud';
import { MILK_FROG_MODEL, MILK_FROG_WASM_DIR } from '../../lib/mediapipePublic';
import { sceneBySlug } from '../../lib/scenes';
import { startLoop } from '../../lib/loop';
import { pageUrl } from '../../lib/url';
import { createPersonView } from './personView';
import {
  cameraErrorMessage,
  classifyPose,
  gestureLabel,
  isReaction,
  motionSpan,
  reactionForPose,
  REACTION_BY_KEY,
  type MotionSample,
  type Pose,
  type Reaction,
} from '../milk-frog/gestures';

if (new URLSearchParams(location.search).get('pose') === 'still') {
  document.documentElement.dataset.pose = 'still';
}

const person = document.querySelector<HTMLElement>('#person');
const video = document.querySelector<HTMLVideoElement>('#cam-video');
const canvas = document.querySelector<HTMLCanvasElement>('#cam-canvas');
const camButton = document.querySelector<HTMLButtonElement>('#cam-button');
const camLabel = document.querySelector<HTMLElement>('#cam-label');
const alertEl = document.querySelector<HTMLElement>('#alert');
const modelStatus = document.querySelector<HTMLElement>('#model-status');
const chipButtons = [...document.querySelectorAll<HTMLButtonElement>('.chips button')];
if (!person || !video || !canvas || !camButton || !camLabel || !alertEl || !modelStatus) {
  throw new Error('missing me nodes');
}

const view = createPersonView(person, (message) => showError(message));
const scene = sceneBySlug('me');
const draw = canvas.getContext('2d');

mountHud({
  title: (lang) => (lang === 'zh' ? scene?.titleZh ?? '手势互动' : scene?.titleEn ?? 'Real Gesture'),
  shareUrl: () => pageUrl('/me/'),
  controls: (lang) => [{
    kind: 'note',
    text: lang === 'zh'
      ? '挥手：单臂挥动。剪刀手：开心跳跃。握拳：惊讶。按住张开的手掌：双手一起挥。按键 1-4 或点下面的按钮也行。'
      : 'Wave: he waves back. Peace: a happy jump. Fist: surprise. Hold an open palm: both hands. Keys 1-4 and the chips do the same.',
  }],
});

function showError(message: string): void {
  alertEl!.hidden = false;
  alertEl!.textContent = message;
}

function clearError(): void {
  alertEl!.hidden = true;
  alertEl!.textContent = '';
}

function paintChips(current: Reaction | 'idle'): void {
  chipButtons.forEach((button) => {
    const on = button.dataset.reaction === current;
    button.classList.toggle('active', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function play(reaction: Reaction, holdMs?: number): void {
  view.trigger(reaction, holdMs);
}

chipButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (isReaction(button.dataset.reaction)) play(button.dataset.reaction, 1800);
  });
});

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const target = event.target;
  if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const reaction = REACTION_BY_KEY[event.key];
  if (!reaction) return;
  event.preventDefault();
  play(reaction, 1800);
});

const wasmBase = `${import.meta.env.BASE_URL}${MILK_FROG_WASM_DIR}`;
const modelAssetPath = `${import.meta.env.BASE_URL}${MILK_FROG_MODEL}`;

let landmarker: HandLandmarker | null = null;
let modelFailed = false;
document.documentElement.dataset.mediapipe = 'loading';
modelStatus.textContent = '正在加载本地手势模型…';

function preferGpu(): boolean {
  return !navigator.webdriver && !/Headless/i.test(navigator.userAgent);
}

async function createLandmarker(fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>): Promise<HandLandmarker> {
  const options = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath, delegate },
    runningMode: 'VIDEO' as const,
    numHands: 1,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  const first: 'GPU' | 'CPU' = preferGpu() ? 'GPU' : 'CPU';
  try {
    const created = await HandLandmarker.createFromOptions(fileset, options(first));
    document.documentElement.dataset.delegate = first;
    return created;
  } catch (error) {
    if (first === 'CPU') throw error;
    const created = await HandLandmarker.createFromOptions(fileset, options('CPU'));
    document.documentElement.dataset.delegate = 'CPU';
    return created;
  }
}

void (async () => {
  try {
    const fileset = await FilesetResolver.forVisionTasks(wasmBase);
    landmarker = await createLandmarker(fileset);
    modelFailed = false;
    document.documentElement.dataset.mediapipe = 'ready';
    modelStatus.textContent = '模型已就绪 · 点「开启摄像头」，或按 1-4';
  } catch {
    modelFailed = true;
    document.documentElement.dataset.mediapipe = 'error';
    modelStatus.textContent = '手势模型加载失败，仍可用按键或按钮互动。';
    showError('本地手势模型没有加载成功。请刷新页面；按键 1-4 仍然可以让他动起来。');
  }
})();

let stream: MediaStream | null = null;
let videoRunning = false;
let lastStamp = -1;
const samples: MotionSample[] = [];
let stablePose: Pose = 'none';
let pendingPose: Pose = 'none';
let pendingCount = 0;
let poseSince = 0;

function cameraContext(): { secure: boolean; supported: boolean } {
  return {
    secure: window.isSecureContext,
    supported: !!navigator.mediaDevices?.getUserMedia,
  };
}

function stopCamera(): void {
  videoRunning = false;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video!.srcObject = null;
  camButton!.textContent = '开启摄像头';
  camLabel!.textContent = '摄像头未开启';
  draw?.clearRect(0, 0, canvas!.width, canvas!.height);
  samples.length = 0;
  stablePose = 'none';
  pendingPose = 'none';
  pendingCount = 0;
}

async function startCamera(): Promise<void> {
  const context = cameraContext();
  if (!context.secure || !context.supported) {
    showError(cameraErrorMessage(new Error('camera-unavailable'), context));
    return;
  }
  try {
    const media = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    });
    stream = media;
    video!.srcObject = media;
    video!.muted = true;
    video!.playsInline = true;
    video!.setAttribute('playsinline', '');
    video!.setAttribute('webkit-playsinline', '');
    await video!.play();
    videoRunning = true;
    poseSince = performance.now();
    camButton!.textContent = '关闭摄像头';
    camLabel!.textContent = landmarker ? '把一只手伸进画面' : '模型加载中，请稍候';
    clearError();
  } catch (error) {
    stopCamera();
    showError(cameraErrorMessage(error, cameraContext()));
  }
}

camButton.addEventListener('click', () => {
  if (stream) stopCamera();
  else void startCamera();
});

window.addEventListener('pagehide', () => stopCamera());

function drawHands(hands: { x: number; y: number }[][]): void {
  if (!draw || !canvas) return;
  draw.clearRect(0, 0, canvas.width, canvas.height);
  const width = canvas.width;
  const height = canvas.height;
  for (const hand of hands) {
    draw.beginPath();
    draw.strokeStyle = 'rgba(232, 238, 252, 0.95)';
    draw.lineWidth = Math.max(2, width / 150);
    draw.lineJoin = 'round';
    draw.lineCap = 'round';
    for (const link of HandLandmarker.HAND_CONNECTIONS) {
      const start = hand[link.start];
      const end = hand[link.end];
      if (!start || !end) continue;
      draw.moveTo(start.x * width, start.y * height);
      draw.lineTo(end.x * width, end.y * height);
    }
    draw.stroke();
    for (const point of hand) {
      draw.beginPath();
      draw.fillStyle = '#fff6df';
      draw.arc(point.x * width, point.y * height, Math.max(2.4, width / 130), 0, Math.PI * 2);
      draw.fill();
    }
  }
}

function nextStamp(now: number): number {
  const stamp = now <= lastStamp ? lastStamp + 1 : now;
  lastStamp = stamp;
  return stamp;
}

function observeHand(hand: { x: number; y: number }[], now: number): void {
  const pose = classifyPose(hand);
  if (pose === pendingPose) pendingCount += 1;
  else {
    pendingPose = pose;
    pendingCount = 1;
  }
  if (pendingCount >= 3 && pose !== stablePose) {
    stablePose = pose;
    poseSince = now;
  }
  const wrist = hand[0];
  if (wrist) samples.push({ t: now, x: wrist.x });
  const cutoff = now - 900;
  while (samples.length > 0 && samples[0]!.t < cutoff) samples.shift();
  const motion = motionSpan(samples, now);
  const next = reactionForPose(stablePose, now - poseSince, motion.span, motion.reversals);
  if (next) play(next, 900);
  camLabel!.textContent = gestureLabel(stablePose, next);
}

function detect(now: number): void {
  if (!videoRunning || !video || video.readyState < 2 || video.videoWidth === 0) return;
  if (canvas && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  if (!landmarker) {
    camLabel!.textContent = modelFailed ? '模型不可用' : '模型加载中，请稍候';
    return;
  }
  try {
    const result = landmarker.detectForVideo(video, nextStamp(now));
    drawHands(result.landmarks);
    const hand = result.landmarks[0];
    if (hand) observeHand(hand, now);
    else {
      stablePose = 'none';
      pendingPose = 'none';
      pendingCount = 0;
      camLabel!.textContent = '把一只手伸进画面';
    }
  } catch {
    camLabel!.textContent = '这一帧没有识别成功';
  }
}

startLoop((_dt, time) => {
  const now = time * 1000;
  paintChips(view.frame(now));
  detect(now);
});
