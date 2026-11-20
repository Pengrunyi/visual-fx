import '../../styles/scene.css';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { JINGLE_BELLS, playChime, resumeAudio, startMusicBox, type Stoppable } from '../../lib/audio';
import { buildGreetingUrl, hasGreeting, parseGreeting, type Greeting } from '../../lib/greeting';
import { mountHud, type HudControl } from '../../lib/hud';
import { getLang } from '../../lib/i18n';
import { mountIntro, startLoop } from '../../lib/loop';
import { createOrbit } from '../../lib/orbit';
import { attachPointers } from '../../lib/pointers';
import { copyText } from '../../lib/url';
import { toast } from '../../lib/loop';

const COUNT = 10000;
const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('missing canvas');

const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setClearColor(0x07101c, 1);
renderer.outputColorSpace = SRGBColorSpace;
const scene = new Scene();
const camera = new PerspectiveCamera(50, 1, 0.1, 80);
const orbit = createOrbit(camera, { radius: 8.2, phi: 1.02, theta: 0.35, minRadius: 4.5, maxRadius: 16, target: new Vector3(0, 1.5, 0) });

let greeting = parseGreeting(window.location.search);
let morph = 0;
let morphTarget = 0;
let music: Stoppable | null = null;
let showSanta = true;
const burst = { life: 0, origin: new Vector3(0, 2.2, 0) };

function makeStarTexture(): CanvasTexture {
  const board = document.createElement('canvas');
  board.width = 128;
  board.height = 128;
  const ctx = board.getContext('2d');
  if (!ctx) throw new Error('2d');
  ctx.translate(64, 64);
  ctx.fillStyle = '#fff4c2';
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const radius = i % 2 === 0 ? 58 : 24;
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

function makeSantaTexture(): CanvasTexture {
  const board = document.createElement('canvas');
  board.width = 360;
  board.height = 200;
  const ctx = board.getContext('2d');
  if (!ctx) throw new Error('2d');
  ctx.clearRect(0, 0, 360, 200);
  ctx.strokeStyle = '#f0ddb0';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(36, 150);
  ctx.quadraticCurveTo(140, 190, 250, 146);
  ctx.stroke();
  ctx.fillStyle = '#8d1d24';
  ctx.beginPath();
  ctx.moveTo(48, 132);
  ctx.quadraticCurveTo(120, 168, 230, 124);
  ctx.lineTo(214, 108);
  ctx.quadraticCurveTo(120, 146, 60, 112);
  ctx.fill();
  ctx.fillStyle = '#d32f2f';
  ctx.beginPath();
  ctx.ellipse(168, 108, 36, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f3c7a4';
  ctx.beginPath();
  ctx.arc(168, 78, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f7f7f7';
  ctx.fillRect(150, 70, 36, 8);
  ctx.beginPath();
  ctx.arc(168, 90, 12, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = '#b71c1c';
  ctx.beginPath();
  ctx.moveTo(150, 74);
  ctx.lineTo(188, 74);
  ctx.lineTo(196, 40);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(196, 40, 7, 0, Math.PI * 2);
  ctx.fill();
  const texture = new CanvasTexture(board);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function sampleText(message: string, count: number): Float32Array {
  const board = document.createElement('canvas');
  board.width = 768;
  board.height = 256;
  const ctx = board.getContext('2d');
  const out = new Float32Array(count * 3);
  if (!ctx) return out;
  ctx.clearRect(0, 0, board.width, board.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = message.split('\n').slice(0, 3);
  const size = lines.length > 1 ? 68 : 78;
  ctx.font = `700 ${size}px sans-serif`;
  lines.forEach((line, index) => {
    ctx.fillText(line, board.width / 2, board.height / 2 + (index - (lines.length - 1) / 2) * (size + 8));
  });
  const pixels = ctx.getImageData(0, 0, board.width, board.height).data;
  const hits: number[] = [];
  for (let y = 0; y < board.height; y += 2) {
    for (let x = 0; x < board.width; x += 2) {
      const alpha = pixels[(y * board.width + x) * 4 + 3] ?? 0;
      if (alpha > 140) hits.push(x, y);
    }
  }
  if (hits.length === 0) return out;
  const pairs = hits.length / 2;
  for (let i = 0; i < count; i += 1) {
    const pair = (i % pairs) * 2;
    const x = hits[pair] ?? 0;
    const y = hits[pair + 1] ?? 0;
    out[i * 3] = (x / board.width - 0.5) * 6.4;
    out[i * 3 + 1] = (1 - y / board.height) * 2.6 + 0.7;
    out[i * 3 + 2] = (Math.random() - 0.5) * 0.25;
  }
  return out;
}

function greetingLines(): string {
  if (greeting.msg) {
    const parts = [greeting.msg];
    if (greeting.to) parts.unshift(greeting.to);
    if (greeting.from) parts.push(greeting.from);
    return parts.join('\n');
  }
  return 'MERRY\nCHRISTMAS';
}

const positions = new Float32Array(COUNT * 3);
const colors = new Float32Array(COUNT * 3);
const sizes = new Float32Array(COUNT);
const seeds = new Float32Array(COUNT);
const textPositions = sampleText(greetingLines(), COUNT);
const palette = [new Color('#1f9a58'), new Color('#d8ffe8'), new Color('#ff5a6a'), new Color('#ffd56a'), new Color('#9ad7ff')];
for (let i = 0; i < COUNT; i += 1) {
  const height = Math.random();
  const y = height * 3.35;
  const radius = (1 - height) * 1.38 * Math.sqrt(Math.random());
  const angle = Math.random() * Math.PI * 2 + height * 9.0;
  positions[i * 3] = Math.cos(angle) * radius;
  positions[i * 3 + 1] = y;
  positions[i * 3 + 2] = Math.sin(angle) * radius;
  const ornament = Math.random() > 0.93;
  const color = palette[ornament ? 2 + Math.floor(Math.random() * 3) : Math.random() > 0.82 ? 1 : 0]!;
  colors[i * 3] = color.r;
  colors[i * 3 + 1] = color.g;
  colors[i * 3 + 2] = color.b;
  sizes[i] = ornament ? 2.4 + Math.random() : 0.7 + Math.random() * 1.1;
  seeds[i] = Math.random();
}

const treeGeometry = new BufferGeometry();
treeGeometry.setAttribute('position', new BufferAttribute(positions, 3));
treeGeometry.setAttribute('aText', new BufferAttribute(textPositions, 3));
treeGeometry.setAttribute('aColor', new BufferAttribute(colors, 3));
treeGeometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
treeGeometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
const treeMaterial = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  toneMapped: false,
  uniforms: {
    uTime: { value: 0 },
    uMorph: { value: 0 },
    uPixelRatio: { value: 1 },
  },
  vertexShader: `
    attribute vec3 aText;
    attribute vec3 aColor;
    attribute float aSize;
    attribute float aSeed;
    uniform float uTime;
    uniform float uMorph;
    uniform float uPixelRatio;
    varying vec3 vColor;
    varying float vSeed;
    void main() {
      float m = smoothstep(0.0, 1.0, uMorph);
      vec3 pos = mix(position, aText, m);
      pos.y += sin(uTime * 1.4 + aSeed * 12.0) * 0.02;
      pos.x += sin(uTime * 0.7 + position.y) * 0.015 * (1.0 - m);
      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = clamp(aSize * uPixelRatio * (62.0 / max(1.0, -mv.z)), 1.0, 6.5);
      gl_Position = projectionMatrix * mv;
      vColor = mix(aColor, vec3(1.0, 0.93, 0.72), m);
      vSeed = aSeed;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;
    varying float vSeed;
    uniform float uTime;
    uniform float uMorph;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5) discard;
      float core = smoothstep(0.5, 0.05, d);
      float tw = 0.7 + 0.3 * sin(uTime * (2.0 + vSeed * 5.0) + vSeed * 20.0);
      float spark = mix(0.85 + 0.15 * tw, tw, uMorph);
      gl_FragColor = vec4(vColor * core * spark, core);
    }
  `,
});
const tree = new Points(treeGeometry, treeMaterial);
tree.frustumCulled = false;
scene.add(tree);

const snowCount = 1800;
const snowGeometry = new BufferGeometry();
const snowPositions = new Float32Array(snowCount * 3);
const snowSeeds = new Float32Array(snowCount);
for (let i = 0; i < snowCount; i += 1) {
  snowPositions[i * 3] = (Math.random() - 0.5) * 10;
  snowPositions[i * 3 + 1] = Math.random() * 7 - 1.5;
  snowPositions[i * 3 + 2] = (Math.random() - 0.5) * 10;
  snowSeeds[i] = Math.random();
}
snowGeometry.setAttribute('position', new BufferAttribute(snowPositions, 3));
snowGeometry.setAttribute('aSeed', new BufferAttribute(snowSeeds, 1));
const snowMaterial = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  toneMapped: false,
  uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
  vertexShader: `
    attribute float aSeed;
    uniform float uTime;
    uniform float uPixelRatio;
    void main() {
      vec3 pos = position;
      pos.y = mod(position.y - uTime * (0.45 + aSeed * 0.7) + 2.0, 7.0) - 1.6;
      pos.x += sin(uTime * 0.35 + aSeed * 8.0) * 0.28;
      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = clamp((0.55 + aSeed * 0.7) * uPixelRatio * (28.0 / max(1.0, -mv.z)), 1.0, 3.2);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: `
    void main() {
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5) discard;
      float a = smoothstep(0.5, 0.1, d);
      gl_FragColor = vec4(vec3(0.9, 0.95, 1.0) * a, a);
    }
  `,
});
const snow = new Points(snowGeometry, snowMaterial);
snow.frustumCulled = false;
scene.add(snow);

const burstCount = 220;
const burstGeometry = new BufferGeometry();
const burstPositions = new Float32Array(burstCount * 3);
const burstSeeds = new Float32Array(burstCount);
for (let i = 0; i < burstCount; i += 1) burstSeeds[i] = Math.random();
burstGeometry.setAttribute('position', new BufferAttribute(burstPositions, 3));
burstGeometry.setAttribute('aSeed', new BufferAttribute(burstSeeds, 1));
const burstMaterial = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  toneMapped: false,
  uniforms: { uPixelRatio: { value: 1 }, uLife: { value: 0 } },
  vertexShader: `
    attribute float aSeed;
    uniform float uPixelRatio;
    uniform float uLife;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = (2.0 + aSeed * 2.0) * uPixelRatio * uLife * (160.0 / max(1.0, -mv.z));
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: `
    uniform float uLife;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5) discard;
      gl_FragColor = vec4(vec3(1.0, 0.86, 0.45), smoothstep(0.5, 0.0, d) * uLife);
    }
  `,
});
const burstPoints = new Points(burstGeometry, burstMaterial);
burstPoints.frustumCulled = false;
scene.add(burstPoints);

const ground = new Mesh(
  new CircleGeometry(5.2, 48),
  new MeshBasicMaterial({ color: 0x102033 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
scene.add(ground);

const star = new Sprite(new SpriteMaterial({
  map: makeStarTexture(),
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  toneMapped: false,
}));
star.position.set(0, 3.55, 0);
star.scale.set(0.72, 0.72, 1);
scene.add(star);

const santa = new Sprite(new SpriteMaterial({
  map: makeSantaTexture(),
  transparent: true,
  depthWrite: false,
}));
santa.scale.set(2.6, 1.45, 1);
santa.position.set(-6, 3.2, -1.2);
scene.add(santa);

const card = document.createElement('div');
card.className = 'greet-card hidden';
const cardTo = document.createElement('div');
cardTo.className = 'to';
const cardMsg = document.createElement('div');
cardMsg.className = 'msg';
const cardFrom = document.createElement('div');
cardFrom.className = 'from';
card.append(cardTo, cardMsg, cardFrom);
document.body.append(card);

function refreshCard() {
  const visible = hasGreeting(greeting);
  card.classList.toggle('hidden', !visible);
  cardTo.textContent = greeting.to ? `致 ${greeting.to}` : '';
  cardMsg.textContent = greeting.msg || (greeting.to || greeting.from ? '圣诞快乐' : '');
  cardFrom.textContent = greeting.from ? `—— ${greeting.from}` : '';
}
function refreshText() {
  const next = sampleText(greetingLines(), COUNT);
  const attr = treeGeometry.getAttribute('aText') as BufferAttribute;
  (attr.array as Float32Array).set(next);
  attr.needsUpdate = true;
}
refreshCard();

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera.updateProjectionMatrix();
  const ratio = renderer.getPixelRatio();
  treeMaterial.uniforms.uPixelRatio!.value = ratio;
  snowMaterial.uniforms.uPixelRatio!.value = ratio;
  burstMaterial.uniforms.uPixelRatio!.value = ratio;
}
resize();
window.addEventListener('resize', resize);

function ignite() {
  burst.life = 1;
  burst.origin.set((Math.random() - 0.5) * 0.4, 1.6 + Math.random() * 1.6, (Math.random() - 0.5) * 0.4);
  const attr = burstGeometry.getAttribute('position') as BufferAttribute;
  const array = attr.array as Float32Array;
  for (let i = 0; i < burstCount; i += 1) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const radius = 0.15 + Math.random() * 1.3;
    array[i * 3] = burst.origin.x + Math.sin(phi) * Math.cos(theta) * radius;
    array[i * 3 + 1] = burst.origin.y + Math.cos(phi) * radius;
    array[i * 3 + 2] = burst.origin.z + Math.sin(phi) * Math.sin(theta) * radius;
  }
  attr.needsUpdate = true;
  void resumeAudio().then((ctx) => playChime(ctx, ctx.destination));
}

attachPointers(canvas, {
  drag(dx, dy) {
    orbit.drag(dx, dy);
  },
  pinch(factor) {
    orbit.pinch(factor);
  },
  tap() {
    ignite();
  },
});

function openCardModal() {
  const lang = getLang();
  const zh = lang === 'zh';
  const back = document.createElement('div');
  back.className = 'modal-back';
  const modal = document.createElement('form');
  modal.className = 'modal';
  const title = document.createElement('h2');
  title.textContent = zh ? '定制贺卡链接' : 'Personal greeting link';
  const fields: { key: keyof Greeting; label: string; value: string; area?: boolean }[] = [
    { key: 'to', label: zh ? '收礼人' : 'To', value: greeting.to },
    { key: 'msg', label: zh ? '祝福' : 'Message', value: greeting.msg, area: true },
    { key: 'from', label: zh ? '署名' : 'From', value: greeting.from },
  ];
  const inputs = new Map<keyof Greeting, HTMLInputElement | HTMLTextAreaElement>();
  fields.forEach((field) => {
    const label = document.createElement('label');
    label.textContent = field.label;
    const input = field.area ? document.createElement('textarea') : document.createElement('input');
    input.value = field.value;
    if (input instanceof HTMLInputElement) input.type = 'text';
    label.append(input);
    modal.append(label);
    inputs.set(field.key, input);
  });
  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = zh ? '关闭' : 'Close';
  const copy = document.createElement('button');
  copy.type = 'submit';
  copy.className = 'primary';
  copy.textContent = zh ? '复制贺卡链接' : 'Copy greeting link';
  actions.append(cancel, copy);
  modal.prepend(title);
  modal.append(actions);
  back.append(modal);
  document.body.append(back);
  cancel.addEventListener('click', () => back.remove());
  back.addEventListener('click', (event) => {
    if (event.target === back) back.remove();
  });
  modal.addEventListener('submit', (event) => {
    event.preventDefault();
    greeting = {
      to: inputs.get('to')?.value ?? '',
      msg: inputs.get('msg')?.value ?? '',
      from: inputs.get('from')?.value ?? '',
    };
    const url = buildGreetingUrl(window.location.origin + window.location.pathname, greeting);
    history.replaceState(null, '', url);
    refreshCard();
    refreshText();
    void copyText(url).then((ok) => toast(ok ? (zh ? '贺卡链接已复制' : 'Greeting link copied') : (zh ? '复制失败' : 'Copy failed')));
    back.remove();
  });
}

if (!hasGreeting(greeting)) mountIntro('星光粒子圣诞树', '轻点树冠 · 听一声铃');

const hud = mountHud({
  title: (lang) => (lang === 'zh' ? '星光粒子圣诞树' : 'Starlight Christmas'),
  shareUrl: () => buildGreetingUrl(window.location.origin + window.location.pathname, greeting),
  controls: (lang): HudControl[] => {
    const zh = lang === 'zh';
    return [
      {
        kind: 'button',
        label: morphTarget > 0.5 ? (zh ? '还原圣诞树' : 'Show tree') : (zh ? '变成祝福文字' : 'Morph to greeting'),
        primary: true,
        onClick: () => {
          morphTarget = morphTarget > 0.5 ? 0 : 1;
          hud.refresh();
        },
      },
      {
        kind: 'button',
        label: zh ? '定制贺卡链接' : 'Personalize link',
        onClick: openCardModal,
      },
      {
        kind: 'toggle',
        label: zh ? '音乐盒' : 'Music box',
        value: music !== null,
        onChange: (value) => {
          void (async () => {
            if (!value) {
              music?.stop();
              music = null;
              return;
            }
            const ctx = await resumeAudio();
            music?.stop();
            music = startMusicBox(ctx, ctx.destination, JINGLE_BELLS, 104);
          })();
        },
      },
      {
        kind: 'toggle',
        label: zh ? '圣诞老人' : 'Santa',
        value: showSanta,
        onChange: (value) => {
          showSanta = value;
        },
      },
      {
        kind: 'note',
        text: zh
          ? '链接可带 ?to=朋友&msg=圣诞快乐&from=署名，方便发到微信。'
          : 'Share ?to=&msg=&from= so a WeChat tap opens this card.',
      },
    ];
  },
});

startLoop((dt, time) => {
  morph += (morphTarget - morph) * Math.min(1, dt * 2.2);
  burst.life = Math.max(0, burst.life - dt * 0.55);
  treeMaterial.uniforms.uTime!.value = time;
  treeMaterial.uniforms.uMorph!.value = morph;
  snowMaterial.uniforms.uTime!.value = time;
  burstMaterial.uniforms.uLife!.value = burst.life;
  star.scale.setScalar(0.62 + Math.sin(time * 3) * 0.06 + burst.life * 0.2);
  santa.visible = showSanta;
  santa.position.x = Math.sin(time * 0.22) * 6.2;
  santa.position.y = 3.15 + Math.sin(time * 0.9) * 0.18;
  orbit.spin(dt, 0.05);
  renderer.render(scene, camera);
});
