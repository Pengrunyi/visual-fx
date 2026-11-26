import '../../styles/scene.css';
import './christmas.css';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { mountHud } from '../../lib/hud';
import { startLoop, toast } from '../../lib/loop';
import { MILK_FROG_MODEL, MILK_FROG_WASM_DIR } from '../../lib/mediapipePublic';
import { sceneBySlug } from '../../lib/scenes';
import { pageUrl } from '../../lib/url';
import { cameraErrorMessage } from '../milk-frog/gestures';
import {
  createConstellation,
  createSnow,
  createStarfield,
  edgeVisibility,
  loosenedPosition,
  mulberry32,
  nearestNode,
  nextPin,
  ornamentAnchor,
  projectTree,
  stepSnow,
  type SnowFlake,
} from './constellation';
import {
  MODE_BY_KEY,
  classifyHandPose,
  createDebounce,
  fingertipPoints,
  handMotion,
  isSceneMode,
  lockPose,
  poseForMode,
  poseLabel,
  pushPose,
  tetherGoal,
  type DebounceState,
  type Point,
  type SceneMode,
} from './gestures';
import { MAX_LOCAL_PHOTOS, selectLocalImages } from './photos';
import { createSampleCards } from './samples';
import {
  cappedPixelRatio,
  damp,
  framePresence,
  popScale,
  snowBudget,
  starBudget,
  stepStage,
  type StageState,
} from './stage';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
const video = document.querySelector<HTMLVideoElement>('#cam-video');
const camCanvas = document.querySelector<HTMLCanvasElement>('#cam-canvas');
const camButton = document.querySelector<HTMLButtonElement>('#cam-button');
const camLabel = document.querySelector<HTMLElement>('#cam-label');
const alertEl = document.querySelector<HTMLElement>('#alert');
const modelStatus = document.querySelector<HTMLElement>('#model-status');
const uploadButton = document.querySelector<HTMLButtonElement>('#upload-button');
const resetButton = document.querySelector<HTMLButtonElement>('#reset-photos');
const pinButton = document.querySelector<HTMLButtonElement>('#pin-button');
const photoInput = document.querySelector<HTMLInputElement>('#photo-input');
const ornamentHost = document.querySelector<HTMLElement>('#ornaments');
const fallbackNote = document.querySelector<HTMLElement>('#fallback-note');
const chipButtons = [...document.querySelectorAll<HTMLButtonElement>('.chips button')];
if (!canvas || !video || !camCanvas || !camButton || !camLabel || !alertEl || !modelStatus || !uploadButton || !resetButton || !pinButton || !photoInput || !ornamentHost) {
  throw new Error('missing christmas nodes');
}

const stageCanvas: HTMLCanvasElement = canvas;
const sceneInfo = sceneBySlug('christmas');
const draw = camCanvas.getContext('2d');
const stageCtx = stageCanvas.getContext('2d');
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionQuery.matches;
let targetMode: SceneMode = 'tree';
let stage: StageState = { loosen: 0, snow: 0, photos: 0 };
let debounced: DebounceState = createDebounce(0);
let tether = 0;
let fingertips: Point[] = [];
let previousWrist: Point | null = null;
const userUrls: string[] = [];
const pins: { x: number; y: number }[] = [];
const tree = createConstellation();
const random = mulberry32(11);
const sky = createStarfield(starBudget(window.innerWidth, reduced), random);
const flakes: SnowFlake[] = createSnow(snowBudget(window.innerWidth, reduced), mulberry32(29));

function showError(message: string): void {
  alertEl!.hidden = false;
  alertEl!.textContent = message;
}

function clearError(): void {
  alertEl!.hidden = true;
  alertEl!.textContent = '';
}

function paintChips(): void {
  chipButtons.forEach((button) => {
    const on = button.dataset.mode === targetMode;
    button.classList.toggle('active', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  if (document.body.classList.contains('no-canvas') && fallbackNote) {
    const label = targetMode === 'tree' ? '星座圣诞树' : targetMode === 'snow' ? '细雪' : '橙色相框';
    fallbackNote.textContent = `已切换到${label}。当前浏览器无法显示星图，按钮和按键仍可切换。`;
  }
}

function applyMode(mode: SceneMode): void {
  targetMode = mode;
  paintChips();
}

function useManual(mode: SceneMode): void {
  debounced = lockPose(poseForMode(mode), performance.now());
  applyMode(mode);
}

function placePin(): void {
  if (pins.length >= 8) return;
  const slot = nextPin(pins.length);
  pins.push({ x: slot.x, y: slot.y });
}

paintChips();

mountHud({
  title: (lang) => (lang === 'zh' ? sceneInfo?.titleZh ?? '星座织树' : sceneInfo?.titleEn ?? 'Constellation Tree'),
  shareUrl: () => pageUrl('/christmas/'),
  controls: (lang) => [{
    kind: 'note',
    text: lang === 'zh'
      ? '握拳把星线收紧成圣诞树，张开手掌落下细雪，OK 把橙色相框挂上枝头。捏合或点画面可钉一颗星。指尖会变成活的星。照片和摄像头画面只留在这台设备上。'
      : 'A fist tightens the constellation, an open palm brings fine snow, and OK hangs orange frames on the branches. A pinch pins a star. Photos and camera frames stay on this device.',
  }],
});

chipButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (isSceneMode(button.dataset.mode)) useManual(button.dataset.mode);
  });
});
pinButton.addEventListener('click', () => placePin());
stageCanvas.addEventListener('pointerdown', (event) => {
  if (event.target !== stageCanvas) return;
  placePin();
});

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const target = event.target;
  if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
  const mode = MODE_BY_KEY[event.key];
  if (!mode) return;
  event.preventDefault();
  useManual(mode);
});

interface OrnamentView {
  frame: HTMLDivElement;
  url?: string;
}

const ornamentViews: OrnamentView[] = [];

function clearOrnaments(): void {
  ornamentViews.forEach((view) => view.frame.remove());
  ornamentViews.length = 0;
}

function mountOrnaments(items: { src: string; label: string; url?: string }[]): void {
  clearOrnaments();
  items.forEach((item) => {
    const frame = document.createElement('div');
    frame.className = 'ornament';
    const image = document.createElement('img');
    image.alt = item.label;
    image.src = item.src;
    frame.append(image);
    ornamentHost!.append(frame);
    ornamentViews.push({ frame, url: item.url });
  });
}

const sampleSources = createSampleCards().map((card) => ({
  src: card.canvas.toDataURL('image/png'),
  label: card.label,
}));
mountOrnaments(sampleSources);

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image'));
    image.src = url;
  });
}

function revokeUserUrls(): void {
  userUrls.forEach((url) => URL.revokeObjectURL(url));
  userUrls.length = 0;
}

async function adoptFiles(files: File[], extra: number): Promise<void> {
  const next: { src: string; label: string; url: string }[] = [];
  for (const file of files) {
    const url = URL.createObjectURL(file);
    try {
      await loadImage(url);
      next.push({ src: url, label: '本地照片', url });
    } catch {
      URL.revokeObjectURL(url);
    }
  }
  if (next.length === 0) {
    showError('这些图片没有读出来，仍显示示例卡片。');
    return;
  }
  revokeUserUrls();
  userUrls.push(...next.map((item) => item.url));
  mountOrnaments(next);
  resetButton!.hidden = false;
  clearError();
  useManual('photos');
  toast(extra > 0 ? `最多显示 ${MAX_LOCAL_PHOTOS} 张，其余未加入` : `已在本地放上 ${next.length} 张照片`);
}

uploadButton.addEventListener('click', () => photoInput.click());
photoInput.addEventListener('change', () => {
  const all = [...(photoInput.files ?? [])];
  photoInput.value = '';
  const images = all.filter((file) => file.type.startsWith('image/'));
  const files = selectLocalImages(all);
  if (files.length === 0) {
    showError('请选择图片文件。人像和宠物照片都可以。');
    return;
  }
  void adoptFiles(files, images.length - files.length);
});
resetButton.addEventListener('click', () => {
  revokeUserUrls();
  mountOrnaments(sampleSources);
  resetButton!.hidden = true;
  clearError();
  toast('已恢复示例卡片');
});

function resize(): void {
  const width = window.innerWidth;
  const height = Math.max(1, window.innerHeight);
  const ratio = cappedPixelRatio(window.devicePixelRatio || 1, width, reduced);
  stageCanvas.width = Math.floor(width * ratio);
  stageCanvas.height = Math.floor(height * ratio);
  stageCanvas.style.width = `${width}px`;
  stageCanvas.style.height = `${height}px`;
  stageCtx?.setTransform(ratio, 0, 0, ratio, 0, 0);
}
resize();
window.addEventListener('resize', resize);
motionQuery.addEventListener?.('change', () => {
  reduced = motionQuery.matches;
  resize();
});

if (!stageCtx) {
  document.body.classList.add('no-canvas');
  showError('当前浏览器无法显示星图。按钮和按键仍然可以切换状态。');
  paintChips();
}

function drawSky(ctx: CanvasRenderingContext2D, width: number, height: number, time: number): void {
  const skyFill = ctx.createLinearGradient(0, 0, 0, height);
  skyFill.addColorStop(0, '#07091a');
  skyFill.addColorStop(0.55, '#121833');
  skyFill.addColorStop(1, '#070814');
  ctx.fillStyle = skyFill;
  ctx.fillRect(0, 0, width, height);
  const moon = ctx.createRadialGradient(width * 0.5, height * 0.4, 8, width * 0.5, height * 0.42, width * 0.32);
  moon.addColorStop(0, 'rgba(150, 176, 220, 0.09)');
  moon.addColorStop(1, 'rgba(150, 176, 220, 0)');
  ctx.fillStyle = moon;
  ctx.fillRect(0, 0, width, height);
  sky.forEach((star) => {
    const twinkle = reduced ? 0.8 : 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * 0.8 + star.phase));
    ctx.fillStyle = star.warm ? `rgba(236, 220, 184, ${twinkle})` : `rgba(234, 240, 252, ${twinkle})`;
    ctx.beginPath();
    ctx.arc(star.x * width, star.y * height, star.radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawTree(ctx: CanvasRenderingContext2D, width: number, height: number, time: number): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const loosen = stage.loosen;
  const points = tree.nodes.map((star, index) => projectTree(
    loosenedPosition(star, loosen, time * 0.7 + index),
    width,
    height,
  ));
  tree.edges.forEach((edge, order) => {
    const start = points[edge.a];
    const end = points[edge.b];
    if (!start || !end) return;
    const visible = edgeVisibility(loosen, order, tree.edges.length);
    if (visible <= 0.02) return;
    const silver = edge.tone === 'silver';
    ctx.strokeStyle = silver
      ? `rgba(214, 224, 238, ${0.22 * visible})`
      : `rgba(226, 206, 164, ${0.2 * visible})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.strokeStyle = silver
      ? `rgba(232, 238, 248, ${0.72 * visible})`
      : `rgba(236, 214, 164, ${0.78 * visible})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  points.forEach((point, index) => {
    const star = tree.nodes[index];
    if (!star || star.kind === 'apex') return;
    const breathe = reduced ? 1 : 1 + Math.sin(time * 1.3 + index) * 0.08 * loosen;
    const radius = (star.kind === 'outline' ? 2.15 : 1.55) * breathe;
    ctx.fillStyle = 'rgba(244, 247, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
  pins.forEach((pin, index) => {
    const point = projectTree(pin, width, height);
    const pulse = reduced ? 1 : 1 + Math.sin(time * 1.6 + index) * 0.06;
    drawSpark(ctx, point.x, point.y, 5.5 * pulse, '#f3e2b6');
  });
  const apex = points[0];
  if (apex) {
    const glow = ctx.createRadialGradient(apex.x, apex.y, 0, apex.x, apex.y, 28);
    glow.addColorStop(0, 'rgba(255, 250, 236, 0.95)');
    glow.addColorStop(0.35, 'rgba(232, 214, 170, 0.28)');
    glow.addColorStop(1, 'rgba(232, 214, 170, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(apex.x, apex.y, 28, 0, Math.PI * 2);
    ctx.fill();
    drawSpark(ctx, apex.x, apex.y, reduced ? 9 : 8.4 + Math.sin(time * 1.8) * 0.5, '#fffaf0');
  }
}

function drawSpark(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const arm = i % 2 === 0 ? radius : radius * 0.38;
    const px = Math.cos(angle) * arm;
    const py = Math.sin(angle) * arm;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSnow(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  if (stage.snow <= 0.02) return;
  ctx.fillStyle = `rgba(244, 248, 255, ${0.75 * stage.snow})`;
  flakes.forEach((flake) => {
    ctx.beginPath();
    ctx.arc(flake.x * width, flake.y * height, flake.size, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawHand(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  if (tether <= 0.02 || fingertips.length === 0) return;
  const projected = tree.nodes.map((star) => projectTree(star, width, height));
  const tips = fingertips.map((tip) => ({ x: (1 - tip.x) * width, y: tip.y * height }));
  ctx.lineWidth = 1;
  ctx.strokeStyle = `rgba(226, 234, 248, ${0.45 * tether})`;
  ctx.beginPath();
  tips.forEach((tip, index) => {
    if (index === 0) ctx.moveTo(tip.x, tip.y);
    else ctx.lineTo(tip.x, tip.y);
    const anchor = projected[nearestNode(tip, projected)];
    if (!anchor) return;
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(anchor.x, anchor.y);
  });
  ctx.stroke();
  tips.forEach((tip) => drawSpark(ctx, tip.x, tip.y, 4.2, '#f7fbff'));
}

function layoutOrnaments(width: number, height: number): void {
  ornamentViews.forEach((view, index) => {
    const anchor = projectTree(ornamentAnchor(index, ornamentViews.length), width, height);
    const presence = framePresence(stage.photos, index, ornamentViews.length);
    view.frame.style.left = `${anchor.x}px`;
    view.frame.style.top = `${anchor.y}px`;
    view.frame.style.setProperty('--scale', popScale(presence).toFixed(3));
    view.frame.style.setProperty('--fade', presence.toFixed(3));
  });
}

function renderScene(dt: number, time: number): void {
  if (!stageCtx) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  stage = stepStage(stage, targetMode, dt, reduced);
  stepSnow(flakes, dt, stage.snow, reduced);
  const tetherTarget = tetherGoal(fingertips.length > 0, debounced.stable);
  tether = reduced ? tetherTarget : damp(tether, tetherTarget, 2.6, dt);
  stageCtx.clearRect(0, 0, width, height);
  drawSky(stageCtx, width, height, time);
  drawTree(stageCtx, width, height, time);
  drawSnow(stageCtx, width, height);
  drawHand(stageCtx, width, height);
  layoutOrnaments(width, height);
}

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
    modelStatus.textContent = '模型已就绪 · 点「开启摄像头」，或按 1-3';
  } catch {
    modelFailed = true;
    document.documentElement.dataset.mediapipe = 'error';
    modelStatus.textContent = '手势模型加载失败，仍可用按键或按钮。';
    showError('本地手势模型没有加载成功。按键 1-3 和下面的按钮仍然可以切换画面。');
  }
})();

let stream: MediaStream | null = null;
let videoRunning = false;
let lastStamp = -1;

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
  camButton!.closest('.cam-card')?.classList.remove('live');
  camButton!.textContent = '开启摄像头';
  camLabel!.textContent = '摄像头未开启';
  fingertips = [];
  previousWrist = null;
  draw?.clearRect(0, 0, camCanvas!.width, camCanvas!.height);
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
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    });
    stream = media;
    video!.srcObject = media;
    video!.muted = true;
    video!.playsInline = true;
    video!.setAttribute('playsinline', '');
    video!.setAttribute('webkit-playsinline', '');
    await video!.play();
    videoRunning = true;
    camButton!.closest('.cam-card')?.classList.add('live');
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

window.addEventListener('pagehide', () => {
  stopCamera();
  revokeUserUrls();
});

function drawHands(hands: Point[][]): void {
  if (!draw) return;
  draw.clearRect(0, 0, camCanvas!.width, camCanvas!.height);
  const width = camCanvas!.width;
  const height = camCanvas!.height;
  for (const hand of hands) {
    draw.beginPath();
    draw.strokeStyle = 'rgba(214, 224, 238, 0.9)';
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
      draw.fillStyle = '#f4f7ff';
      draw.arc(point.x * width, point.y * height, Math.max(2.2, width / 140), 0, Math.PI * 2);
      draw.fill();
    }
  }
}

function nextStamp(now: number): number {
  const stamp = now <= lastStamp ? lastStamp + 1 : now;
  lastStamp = stamp;
  return stamp;
}

function observeHand(hand: Point[], now: number): void {
  const wrist = hand[0] ?? null;
  const motion = handMotion(previousWrist, wrist);
  previousWrist = wrist;
  fingertips = fingertipPoints(hand);
  const step = pushPose(debounced, classifyHandPose(hand), now);
  debounced = step.state;
  if (step.mode) applyMode(step.mode);
  if (step.pinned) placePin();
  if (motion > 0.02 && debounced.stable !== 'open' && debounced.stable !== 'fist') {
    stage = { ...stage, loosen: Math.max(0, stage.loosen - motion * 0.8) };
  }
  camLabel!.textContent = debounced.stable === 'none' ? '把一只手伸进画面' : poseLabel(debounced.stable);
}

function detect(now: number): void {
  if (!videoRunning || video!.readyState < 2 || video!.videoWidth === 0) return;
  if (camCanvas!.width !== video!.videoWidth || camCanvas!.height !== video!.videoHeight) {
    camCanvas!.width = video!.videoWidth;
    camCanvas!.height = video!.videoHeight;
  }
  if (!landmarker) {
    camLabel!.textContent = modelFailed ? '模型不可用' : '模型加载中，请稍候';
    return;
  }
  try {
    const result = landmarker.detectForVideo(video!, nextStamp(now));
    drawHands(result.landmarks);
    const hand = result.landmarks[0];
    if (hand) observeHand(hand, now);
    else {
      const step = pushPose(debounced, 'none', now);
      debounced = step.state;
      fingertips = [];
      previousWrist = null;
      camLabel!.textContent = '把一只手伸进画面';
    }
  } catch {
    camLabel!.textContent = '这一帧没有识别成功';
  }
}

startLoop((dt, time) => {
  detect(time * 1000);
  renderScene(dt, time);
});
