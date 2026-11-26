import '../../styles/scene.css';
import './christmas.css';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import {
  AdditiveBlending,
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Path,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { mountHud } from '../../lib/hud';
import { startLoop, toast } from '../../lib/loop';
import { MILK_FROG_MODEL, MILK_FROG_WASM_DIR } from '../../lib/mediapipePublic';
import { sceneBySlug } from '../../lib/scenes';
import { pageUrl } from '../../lib/url';
import { cameraErrorMessage } from '../milk-frog/gestures';
import { TREE_HEIGHT, TREE_RADIUS, createCloud, ornamentAnchors, type ParticleSet } from './cloud';
import {
  MODE_BY_KEY,
  classifyHandPose,
  createDebounce,
  isSceneMode,
  lockPose,
  poseForMode,
  poseLabel,
  pushPose,
  type DebounceState,
  type Point,
  type SceneMode,
} from './gestures';
import { frameCover, MAX_LOCAL_PHOTOS, selectLocalImages } from './photos';
import { createSampleCards } from './samples';
import {
  cappedPixelRatio,
  framePose,
  framePresence,
  ornamentBudget,
  ornamentPresence,
  particleBudget,
  popScale,
  starPresence,
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
const photoInput = document.querySelector<HTMLInputElement>('#photo-input');
const fallbackNote = document.querySelector<HTMLElement>('#fallback-note');
const chipButtons = [...document.querySelectorAll<HTMLButtonElement>('.chips button')];
if (!canvas || !video || !camCanvas || !camButton || !camLabel || !alertEl || !modelStatus || !uploadButton || !resetButton || !photoInput) {
  throw new Error('missing christmas nodes');
}

const sceneInfo = sceneBySlug('christmas');
const draw = camCanvas.getContext('2d');
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionQuery.matches;
let targetMode: SceneMode = 'tree';
let stage: StageState = { particle: 0, photos: 0 };
let debounced: DebounceState = createDebounce(0);
const userUrls: string[] = [];

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
  if (document.body.classList.contains('no-webgl') && fallbackNote) {
    const label = targetMode === 'tree' ? '圣诞树' : targetMode === 'burst' ? '闪烁光点' : '橙色相框';
    fallbackNote.textContent = `已切换到${label}。当前浏览器无法显示粒子，按钮和按键仍可切换。`;
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

paintChips();

mountHud({
  title: (lang) => (lang === 'zh' ? sceneInfo?.titleZh ?? '圣诞手势粒子' : sceneInfo?.titleEn ?? 'Christmas Gestures'),
  shareUrl: () => pageUrl('/christmas/'),
  controls: (lang) => [{
    kind: 'note',
    text: lang === 'zh'
      ? '握拳聚合成金色圣诞树，张开手掌炸成光点，OK 手势在光点中弹出橙色相框。按键 1-3 或点按钮也行。照片和摄像头画面只留在这台设备上，不会上传。'
      : 'A fist gathers the gold tree, an open palm bursts it into sparks, and OK raises orange frames. Keys 1-3 do the same. Photos and camera frames stay on this device.',
  }],
});

chipButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (isSceneMode(button.dataset.mode)) useManual(button.dataset.mode);
  });
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

function makeGlowTexture(): CanvasTexture {
  const board = document.createElement('canvas');
  board.width = 128;
  board.height = 128;
  const ctx = board.getContext('2d');
  if (!ctx) throw new Error('2d');
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, 'rgba(255, 236, 196, 0.95)');
  glow.addColorStop(0.35, 'rgba(255, 176, 72, 0.28)');
  glow.addColorStop(1, 'rgba(255, 140, 40, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new CanvasTexture(board);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function makeStarTexture(): CanvasTexture {
  const board = document.createElement('canvas');
  board.width = 256;
  board.height = 256;
  const ctx = board.getContext('2d');
  if (!ctx) throw new Error('2d');
  ctx.translate(128, 128);
  const fill = ctx.createRadialGradient(0, 0, 4, 0, 0, 90);
  fill.addColorStop(0, '#fff8e4');
  fill.addColorStop(0.45, '#ffd56a');
  fill.addColorStop(1, '#e39b3a');
  ctx.fillStyle = fill;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? 112 : 46;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  const texture = new CanvasTexture(board);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function makeGroundTexture(): CanvasTexture {
  const board = document.createElement('canvas');
  board.width = 256;
  board.height = 256;
  const ctx = board.getContext('2d');
  if (!ctx) throw new Error('2d');
  const glow = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  glow.addColorStop(0, 'rgba(146, 88, 32, 0.55)');
  glow.addColorStop(0.5, 'rgba(70, 36, 14, 0.2)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new CanvasTexture(board);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const pointVertex = `
  attribute vec3 aBurst;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aSeed;
  uniform float uTime;
  uniform float uMorph;
  uniform float uPixelRatio;
  uniform float uTwinkle;
  varying vec3 vColor;
  varying float vSeed;
  void main() {
    vec3 pos = mix(position, aBurst, uMorph);
    float flow = uTime * (0.55 + aSeed * 0.45);
    float drift = uTwinkle * (0.012 + uMorph * 0.06);
    pos.x += sin(flow + position.y * 3.0) * drift;
    pos.y += cos(flow * 1.25 + aSeed * 8.0) * drift;
    pos.z += sin(flow * 0.8 + position.x * 2.0) * drift * uMorph;
    float len = length(aBurst);
    if (len > 0.001) pos += (aBurst / len) * sin(uTime * 0.9 + aSeed * 12.0) * 0.12 * uMorph * uTwinkle;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = clamp(aSize * uPixelRatio * (78.0 / max(1.2, -mv.z)), 1.0, 8.0);
    gl_Position = projectionMatrix * mv;
    vColor = aColor;
    vSeed = aSeed;
  }
`;

const pointFragment = `
  varying vec3 vColor;
  varying float vSeed;
  uniform float uTime;
  uniform float uTwinkle;
  uniform float uGain;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float core = smoothstep(0.5, 0.02, d);
    float hot = smoothstep(0.18, 0.0, d);
    float tw = uTwinkle > 0.5 ? 0.7 + 0.3 * sin(uTime * (2.0 + vSeed * 5.0) + vSeed * 20.0) : 1.0;
    vec3 color = vColor * (0.42 + hot) * tw * uGain;
    gl_FragColor = vec4(color, core);
  }
`;

function makePoints(set: ParticleSet, gain: number): { points: Points; material: ShaderMaterial } {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(set.tree, 3));
  geometry.setAttribute('aBurst', new BufferAttribute(set.burst, 3));
  geometry.setAttribute('aColor', new BufferAttribute(set.color, 3));
  geometry.setAttribute('aSize', new BufferAttribute(set.size, 1));
  geometry.setAttribute('aSeed', new BufferAttribute(set.seed, 1));
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uTime: { value: 0 },
      uMorph: { value: 0 },
      uPixelRatio: { value: 1 },
      uTwinkle: { value: 1 },
      uGain: { value: gain },
    },
    vertexShader: pointVertex,
    fragmentShader: pointFragment,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 4;
  return { points, material };
}

const glowTexture = makeGlowTexture();
const view = new Scene();
const world = new Group();
view.add(world);
view.add(new AmbientLight(0xfff1d2, 0.72));
const keyLight = new DirectionalLight(0xfff6e4, 1.7);
keyLight.position.set(2.2, 5.4, 3.4);
view.add(keyLight);
const rimLight = new DirectionalLight(0xff8a3c, 0.55);
rimLight.position.set(-2.8, 1.6, -1.4);
view.add(rimLight);

const count = particleBudget(window.innerWidth, reduced);
const cloud = createCloud(count, Math.random);
const needles = makePoints(cloud.needles, 0.62);
const sparks = makePoints(cloud.sparks, 1.2);
world.add(needles.points, sparks.points);
const shaderMaterials = [needles.material, sparks.material];

const coneMaterial = new MeshBasicMaterial({
  color: 0x6b4718,
  transparent: true,
  opacity: 0.4,
  side: DoubleSide,
  depthWrite: false,
});
const cone = new Mesh(new ConeGeometry(TREE_RADIUS * 0.86, TREE_HEIGHT, 48, 1, true), coneMaterial);
cone.position.y = TREE_HEIGHT / 2;
cone.renderOrder = 0;
const innerMaterial = new MeshBasicMaterial({
  color: 0x2c1c0e,
  transparent: true,
  opacity: 0.34,
  side: DoubleSide,
  depthWrite: false,
});
const inner = new Mesh(new ConeGeometry(TREE_RADIUS * 0.42, TREE_HEIGHT * 0.92, 32, 1, true), innerMaterial);
inner.position.y = TREE_HEIGHT * 0.48;
inner.renderOrder = 0;
const trunkMaterial = new MeshBasicMaterial({ color: 0x3b2618, transparent: true, opacity: 1 });
const trunk = new Mesh(new CylinderGeometry(0.08, 0.14, 0.42, 16), trunkMaterial);
trunk.position.y = -0.16;
world.add(cone, inner, trunk);

const sphere = new SphereGeometry(1, 28, 18);
const ornaments: { mesh: Mesh; tree: Vector3; burst: Vector3; base: number }[] = [];
ornamentAnchors(ornamentBudget(window.innerWidth, reduced)).forEach((anchor, index) => {
  const material = new MeshStandardMaterial({
    color: anchor.color,
    emissive: new Color(anchor.color),
    emissiveIntensity: 0.28,
    metalness: 0.58,
    roughness: 0.24,
  });
  const mesh = new Mesh(sphere, material);
  const base = 0.09 + (index % 3) * 0.02;
  mesh.scale.setScalar(base);
  mesh.position.set(anchor.tree.x, anchor.tree.y, anchor.tree.z);
  mesh.renderOrder = 2;
  world.add(mesh);
  ornaments.push({
    mesh,
    tree: new Vector3(anchor.tree.x, anchor.tree.y, anchor.tree.z),
    burst: new Vector3(anchor.burst.x, anchor.burst.y, anchor.burst.z),
    base,
  });
});

const star = new Sprite(new SpriteMaterial({
  map: makeStarTexture(),
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  toneMapped: false,
}));
star.position.set(0, TREE_HEIGHT + 0.18, 0);
star.scale.setScalar(0.78);
star.renderOrder = 5;
const starGlow = new Sprite(new SpriteMaterial({
  map: glowTexture,
  color: 0xffd27a,
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  toneMapped: false,
  opacity: 0.7,
}));
starGlow.position.copy(star.position);
starGlow.scale.setScalar(1.7);
starGlow.renderOrder = 5;
world.add(starGlow, star);

const groundMaterial = new MeshBasicMaterial({
  map: makeGroundTexture(),
  transparent: true,
  depthWrite: false,
  opacity: 0.9,
});
const ground = new Mesh(new PlaneGeometry(7.2, 7.2), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.04;
ground.renderOrder = 0;
world.add(ground);

const dustCount = reduced ? 140 : 520;
const dustGeometry = new BufferGeometry();
const dustPositions = new Float32Array(dustCount * 3);
const dustSeeds = new Float32Array(dustCount);
for (let i = 0; i < dustCount; i += 1) {
  dustPositions[i * 3] = (Math.random() - 0.5) * 8;
  dustPositions[i * 3 + 1] = Math.random() * 4.4;
  dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 6;
  dustSeeds[i] = Math.random();
}
dustGeometry.setAttribute('position', new BufferAttribute(dustPositions, 3));
dustGeometry.setAttribute('aSeed', new BufferAttribute(dustSeeds, 1));
const dustMaterial = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  toneMapped: false,
  uniforms: {
    uTime: { value: 0 },
    uPixelRatio: { value: 1 },
    uTwinkle: { value: 1 },
  },
  vertexShader: `
    attribute float aSeed;
    uniform float uTime;
    uniform float uPixelRatio;
    uniform float uTwinkle;
    void main() {
      vec3 pos = position;
      pos.y = mod(position.y + uTime * uTwinkle * (0.08 + aSeed * 0.14), 4.8) - 0.3;
      pos.x += sin(uTime * 0.22 * uTwinkle + aSeed * 6.0) * 0.2;
      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = clamp((0.65 + aSeed) * uPixelRatio * (34.0 / max(1.0, -mv.z)), 1.0, 3.4);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: `
    void main() {
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5) discard;
      float a = smoothstep(0.5, 0.0, d) * 0.5;
      gl_FragColor = vec4(vec3(1.0, 0.84, 0.5), a);
    }
  `,
});
const dust = new Points(dustGeometry, dustMaterial);
dust.frustumCulled = false;
dust.renderOrder = 1;
view.add(dust);

const bokeh: Sprite[] = [];
for (let i = 0; i < 6; i += 1) {
  const sprite = new Sprite(new SpriteMaterial({
    map: glowTexture,
    color: i % 2 === 0 ? 0xffc56a : 0xffe6b0,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
    opacity: 0.09,
  }));
  const angle = (i / 6) * Math.PI * 2;
  sprite.position.set(Math.cos(angle) * 2.6, 0.8 + (i % 3) * 0.85, -2.4);
  sprite.scale.setScalar(1.5 + (i % 3) * 0.45);
  sprite.renderOrder = 0;
  view.add(sprite);
  bokeh.push(sprite);
}

const frameRoot = new Group();
view.add(frameRoot);
function makeBorderGeometry(): ShapeGeometry {
  const outerW = 1.18;
  const outerH = 1.46;
  const innerW = 1.02;
  const innerH = 1.26;
  const shape = new Shape();
  shape.moveTo(-outerW / 2, -outerH / 2);
  shape.lineTo(outerW / 2, -outerH / 2);
  shape.lineTo(outerW / 2, outerH / 2);
  shape.lineTo(-outerW / 2, outerH / 2);
  const hole = new Path();
  hole.moveTo(-innerW / 2, -innerH / 2);
  hole.lineTo(-innerW / 2, innerH / 2);
  hole.lineTo(innerW / 2, innerH / 2);
  hole.lineTo(innerW / 2, -innerH / 2);
  shape.holes.push(hole);
  return new ShapeGeometry(shape);
}
const borderGeometry = makeBorderGeometry();
const photoGeometry = new PlaneGeometry(1.0, 1.24);
interface FrameEntry {
  group: Group;
  map: Texture;
  owned: boolean;
}
const frameEntries: FrameEntry[] = [];

function disposeMaterial(node: Object3D): void {
  if (!('material' in node)) return;
  const material = (node as Mesh).material;
  if (Array.isArray(material)) material.forEach((item) => item.dispose());
  else material?.dispose();
}

function clearFrames(): void {
  for (const entry of frameEntries) {
    frameRoot.remove(entry.group);
    entry.group.traverse(disposeMaterial);
    if (entry.owned) entry.map.dispose();
  }
  frameEntries.length = 0;
}

function buildFrame(map: Texture): Group {
  const group = new Group();
  const border = new Mesh(borderGeometry, new MeshBasicMaterial({
    color: 0xff7a18,
    side: DoubleSide,
    depthWrite: true,
  }));
  const photo = new Mesh(photoGeometry, new MeshBasicMaterial({
    map,
    side: DoubleSide,
    depthWrite: true,
  }));
  photo.position.z = 0.03;
  const glow = new Sprite(new SpriteMaterial({
    map: glowTexture,
    color: 0xff7a18,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    opacity: 0.42,
  }));
  glow.position.z = -0.06;
  glow.scale.set(2.15, 2.45, 1);
  border.renderOrder = 3;
  photo.renderOrder = 3;
  glow.renderOrder = 2;
  group.add(glow, border, photo);
  return group;
}

function mountFrames(items: { map: Texture; owned: boolean }[]): void {
  clearFrames();
  items.forEach((item) => {
    const group = buildFrame(item.map);
    frameRoot.add(group);
    frameEntries.push({ group, map: item.map, owned: item.owned });
  });
}

const sampleTextures = createSampleCards().map((card) => {
  const texture = new CanvasTexture(card.canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
});
mountFrames(sampleTextures.map((map) => ({ map, owned: false })));

function textureFromImage(image: HTMLImageElement): Texture {
  const texture = new Texture(image);
  texture.colorSpace = SRGBColorSpace;
  const crop = frameCover(image.naturalWidth || image.width, image.naturalHeight || image.height);
  texture.repeat.set(crop.repeatX, crop.repeatY);
  texture.offset.set(crop.offsetX, crop.offsetY);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

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
  const next: { map: Texture; url: string }[] = [];
  for (const file of files) {
    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      next.push({ map: textureFromImage(image), url });
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
  mountFrames(next.map((item) => ({ map: item.map, owned: true })));
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
  mountFrames(sampleTextures.map((map) => ({ map, owned: false })));
  resetButton!.hidden = true;
  clearError();
  toast('已恢复示例卡片');
});

const camera = new PerspectiveCamera(42, 1, 0.1, 40);
let renderer: WebGLRenderer | null = null;
try {
  renderer = new WebGLRenderer({
    canvas,
    antialias: window.innerWidth >= 760 && !reduced,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x100804, 1);
  renderer.outputColorSpace = SRGBColorSpace;
} catch {
  renderer = null;
  document.body.classList.add('no-webgl');
  showError('当前浏览器无法显示粒子画面。按钮和按键仍然可以切换状态。');
  paintChips();
}

function resize(): void {
  const width = window.innerWidth;
  const height = Math.max(1, window.innerHeight);
  const ratio = cappedPixelRatio(window.devicePixelRatio || 1, width, reduced);
  const aspect = width / height;
  camera.aspect = aspect;
  camera.fov = aspect < 0.82 ? 52 : 42;
  const distance = aspect < 0.85 ? 8.8 : 7.35;
  camera.position.set(0, 1.48, distance);
  camera.lookAt(0, 1.42, 0);
  camera.updateProjectionMatrix();
  renderer?.setPixelRatio(ratio);
  renderer?.setSize(width, height, false);
  shaderMaterials.forEach((material) => {
    material.uniforms.uPixelRatio!.value = ratio;
  });
  dustMaterial.uniforms.uPixelRatio!.value = ratio;
}
resize();
window.addEventListener('resize', resize);
motionQuery.addEventListener?.('change', () => {
  reduced = motionQuery.matches;
  resize();
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
    draw.strokeStyle = 'rgba(240, 195, 106, 0.95)';
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
      draw.fillStyle = '#fff1d4';
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
  const step = pushPose(debounced, classifyHandPose(hand), now);
  debounced = step.state;
  if (step.mode) applyMode(step.mode);
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
      camLabel!.textContent = '把一只手伸进画面';
    }
  } catch {
    camLabel!.textContent = '这一帧没有识别成功';
  }
}

function renderScene(dt: number, time: number): void {
  stage = stepStage(stage, targetMode, dt, reduced);
  const twinkle = reduced ? 0 : 1;
  shaderMaterials.forEach((material) => {
    material.uniforms.uTime!.value = time;
    material.uniforms.uMorph!.value = stage.particle;
    material.uniforms.uTwinkle!.value = twinkle;
  });
  dustMaterial.uniforms.uTime!.value = time;
  dustMaterial.uniforms.uTwinkle!.value = twinkle;
  const body = starPresence(stage.particle);
  coneMaterial.opacity = 0.42 * body;
  innerMaterial.opacity = 0.32 * body;
  trunkMaterial.opacity = body;
  cone.visible = body > 0.04;
  inner.visible = body > 0.04;
  trunk.visible = body > 0.04;
  groundMaterial.opacity = 0.9 * body;
  const pulse = reduced ? 1 : 1 + Math.sin(time * 2.6) * 0.07;
  star.visible = body > 0.04;
  star.scale.setScalar(0.78 * Math.max(body, 0.001) * pulse);
  starGlow.visible = body > 0.04;
  starGlow.scale.setScalar(1.75 * Math.max(body, 0.001) * pulse);
  const baubleMix = ornamentPresence(stage.particle);
  ornaments.forEach((ornament) => {
    ornament.mesh.position.lerpVectors(ornament.tree, ornament.burst, stage.particle);
    ornament.mesh.scale.setScalar(Math.max(ornament.base * baubleMix, 0.0001));
    ornament.mesh.visible = baubleMix > 0.04;
  });
  frameEntries.forEach((entry, index) => {
    const presence = framePresence(stage.photos, index, frameEntries.length);
    const pose = framePose(index, frameEntries.length, time);
    entry.group.position.set(pose.x, pose.y, pose.z);
    entry.group.lookAt(camera.position);
    entry.group.scale.setScalar(Math.max(popScale(presence), 0.0001));
    entry.group.visible = presence > 0.025;
  });
  world.rotation.y = reduced ? 0.38 : time * 0.11;
  bokeh.forEach((sprite, index) => {
    sprite.position.y = 0.8 + (index % 3) * 0.85 + Math.sin(time * 0.35 + index) * (reduced ? 0 : 0.08);
  });
  renderer?.render(view, camera);
}

startLoop((dt, time) => {
  detect(time * 1000);
  if (renderer) renderScene(dt, time);
});
