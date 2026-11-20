import '../../styles/scene.css';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { mountHud, type HudControl } from '../../lib/hud';
import { mountIntro, prefersCoarsePointer, startLoop } from '../../lib/loop';
import { createOrbit, hitGround } from '../../lib/orbit';
import { attachPointers } from '../../lib/pointers';

const THEMES = {
  argon: ['#b7ecff', '#6d4bff', '#ff4fd8'],
  ice: ['#ffffff', '#79b6ff', '#b9fff0'],
  ember: ['#fff3cf', '#ff4b2e', '#ffb703'],
  gold: ['#fff8df', '#e0a106', '#ff7a18'],
} as const;

type ThemeName = keyof typeof THEMES;

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('missing canvas');

const mobile = prefersCoarsePointer();
const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setClearColor(0x02030a, 1);
const scene = new Scene();
const camera = new PerspectiveCamera(55, 1, 0.1, 120);
const orbit = createOrbit(camera, { radius: 11, phi: 1.05, theta: 0.4, minRadius: 4, maxRadius: 24 });

const pointer = new Vector2(100, 100);
const hit = new Vector3();
let repel = 0;
let holding = false;
let shock = 0;
let shockAmp = 0;
let spin = 0.22;
let count = 50000;
let arms = 5;
let twist = 0.62;
let theme: ThemeName = 'argon';
let autoSpin = true;
let galaxy: Points<BufferGeometry, ShaderMaterial> | null = null;

const starMaterial = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  toneMapped: false,
  uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
  vertexShader: `
    uniform float uPixelRatio;
    attribute float aSize;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * uPixelRatio * (90.0 / max(1.0, -mv.z));
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5) discard;
      float glow = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(vec3(0.75, 0.82, 1.0) * glow, glow);
    }
  `,
});

function makeStars() {
  const geometry = new BufferGeometry();
  const total = 1800;
  const positions = new Float32Array(total * 3);
  const sizes = new Float32Array(total);
  for (let i = 0; i < total; i += 1) {
    const radius = 46;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);
    sizes[i] = Math.random() * 1.4 + 0.3;
  }
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
  const points = new Points(geometry, starMaterial);
  points.frustumCulled = false;
  scene.add(points);
}

const galaxyMaterial = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  toneMapped: false,
  uniforms: {
    uTime: { value: 0 },
    uSpin: { value: spin },
    uPointer: { value: pointer },
    uRepel: { value: 0 },
    uShock: { value: 0 },
    uShockAmp: { value: 0 },
    uPixelRatio: { value: 1 },
  },
  vertexShader: `
    attribute float aSize;
    attribute vec3 aColor;
    attribute float aSeed;
    uniform float uTime;
    uniform float uSpin;
    uniform vec2 uPointer;
    uniform float uRepel;
    uniform float uShock;
    uniform float uShockAmp;
    uniform float uPixelRatio;
    varying vec3 vColor;
    varying float vSeed;
    vec2 rot(vec2 p, float a) {
      float c = cos(a);
      float s = sin(a);
      return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    }
    void main() {
      vec3 pos = position;
      pos.xz = rot(pos.xz, uTime * uSpin);
      float radius = length(pos.xz) + 0.0001;
      float ring = exp(-abs(radius - uShock) * 3.2) * uShockAmp;
      pos.xz += pos.xz / radius * ring;
      pos.y += ring * 0.28 * sin(uTime * 10.0 + aSeed * 8.0);
      vec2 delta = pos.xz - uPointer;
      float dist = length(delta) + 0.0001;
      float push = uRepel * exp(-dist * dist * 0.16);
      pos.xz += delta / dist * push;
      pos.y += push * 0.18;
      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = clamp(aSize * uPixelRatio * (78.0 / max(1.0, -mv.z)), 1.0, 5.5);
      gl_Position = projectionMatrix * mv;
      vColor = aColor;
      vSeed = aSeed;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;
    varying float vSeed;
    uniform float uTime;
    void main() {
      vec2 p = gl_PointCoord - 0.5;
      float d = length(p);
      if (d > 0.5) discard;
      float core = smoothstep(0.5, 0.0, d);
      float tw = 0.75 + 0.25 * sin(uTime * 4.0 + vSeed * 30.0);
      vec3 color = vColor * core * tw;
      gl_FragColor = vec4(color, core);
    }
  `,
});

function rebuild() {
  if (galaxy) {
    scene.remove(galaxy);
    galaxy.geometry.dispose();
  }
  const geometry = new BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const [inner, outer, dust] = THEMES[theme];
  const colorA = new Color(inner);
  const colorB = new Color(outer);
  const colorC = new Color(dust);
  const mixed = new Color();
  const bulge = Math.floor(count * 0.18);
  for (let i = 0; i < count; i += 1) {
    const bulgeStar = i < bulge;
    const radius = bulgeStar ? Math.pow(Math.random(), 2.2) * 1.35 : Math.pow(Math.random(), 1.25) * 7.6;
    const arm = i % arms;
    const angle = (arm / arms) * Math.PI * 2 + radius * twist;
    const spread = (bulgeStar ? 0.7 : 0.28 + radius * 0.07) * (Math.random() - 0.5);
    const x = Math.cos(angle) * radius + Math.cos(angle + 1.7) * spread;
    const z = Math.sin(angle) * radius + Math.sin(angle + 1.7) * spread;
    const y = (Math.random() - 0.5) * (bulgeStar ? 0.55 : 0.08 + radius * 0.015);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    const t = Math.min(1, radius / 7.6);
    mixed.copy(colorA).lerp(colorB, Math.pow(t, 0.75));
    if (!bulgeStar && Math.random() > 0.92) mixed.lerp(colorC, 0.65);
    if (Math.random() > 0.985) mixed.setRGB(1, 1, 1);
    colors[i * 3] = mixed.r;
    colors[i * 3 + 1] = mixed.g;
    colors[i * 3 + 2] = mixed.b;
    sizes[i] = (bulgeStar ? 1.8 : 1) * (0.45 + Math.random() * 1.5);
    seeds[i] = Math.random();
  }
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new BufferAttribute(sizes, 1));
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
  galaxy = new Points(geometry, galaxyMaterial);
  galaxy.frustumCulled = false;
  scene.add(galaxy);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  const ratio = renderer.getPixelRatio();
  galaxyMaterial.uniforms.uPixelRatio!.value = ratio;
  starMaterial.uniforms.uPixelRatio!.value = ratio;
}
resize();
window.addEventListener('resize', resize);
makeStars();
rebuild();

let rebuildTimer = 0;
function scheduleRebuild() {
  window.clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(rebuild, 90);
}

attachPointers(canvas, {
  drag(dx, dy) {
    orbit.drag(dx, dy);
  },
  pinch(factor) {
    orbit.pinch(factor);
  },
  down(sample) {
    holding = true;
    if (hitGround(camera, sample.nx, sample.ny, hit)) pointer.set(hit.x, hit.z);
  },
  move(sample) {
    if (hitGround(camera, sample.nx, sample.ny, hit)) pointer.set(hit.x, hit.z);
  },
  up() {
    holding = false;
  },
  tap() {
    shock = 0.2;
    shockAmp = 1.8;
  },
});

mountIntro('深空粒子星系', '拖拽环绕 · 按住驱散 · 轻点超新星');

mountHud({
  title: (lang) => (lang === 'zh' ? '深空粒子星系' : 'Argon Galaxy'),
  controls: (lang): HudControl[] => {
    const zh = lang === 'zh';
    return [
      {
        kind: 'range',
        label: zh ? '粒子数' : 'Particles',
        min: 20000,
        max: 100000,
        step: 5000,
        value: count,
        format: (value) => `${Math.round(value / 1000)}k`,
        onInput: (value) => {
          count = value;
          scheduleRebuild();
        },
      },
      {
        kind: 'range',
        label: zh ? '旋臂' : 'Arms',
        min: 2,
        max: 7,
        step: 1,
        value: arms,
        onInput: (value) => {
          arms = value;
          scheduleRebuild();
        },
      },
      {
        kind: 'range',
        label: zh ? '缠绕' : 'Twist',
        min: 0.15,
        max: 1.4,
        step: 0.01,
        value: twist,
        onInput: (value) => {
          twist = value;
          scheduleRebuild();
        },
      },
      {
        kind: 'range',
        label: zh ? '转速' : 'Spin',
        min: 0,
        max: 0.8,
        step: 0.01,
        value: spin,
        onInput: (value) => {
          spin = value;
        },
      },
      {
        kind: 'select',
        label: zh ? '配色' : 'Theme',
        value: theme,
        options: [
          { value: 'argon', label: zh ? '氩紫' : 'Argon' },
          { value: 'ice', label: zh ? '寒冰' : 'Ice' },
          { value: 'ember', label: zh ? '余烬' : 'Ember' },
          { value: 'gold', label: zh ? '流金' : 'Gold' },
        ],
        onChange: (value) => {
          theme = value as ThemeName;
          rebuild();
        },
      },
      {
        kind: 'toggle',
        label: zh ? '自动公转' : 'Auto orbit',
        value: autoSpin,
        onChange: (value) => {
          autoSpin = value;
        },
      },
    ];
  },
});

startLoop((dt, time) => {
  if (holding) repel = Math.min(3.4, repel + dt * 2.4);
  else repel *= Math.exp(-dt * 1.8);
  shock = Math.min(9, shock + dt * 3.4);
  shockAmp *= Math.exp(-dt * 1.4);
  galaxyMaterial.uniforms.uTime!.value = time;
  galaxyMaterial.uniforms.uSpin!.value = spin;
  galaxyMaterial.uniforms.uRepel!.value = holding ? repel * (0.75 + 0.25 * Math.sin(time * 14)) : repel;
  galaxyMaterial.uniforms.uShock!.value = shock;
  galaxyMaterial.uniforms.uShockAmp!.value = shockAmp;
  starMaterial.uniforms.uTime!.value = time;
  orbit.spin(dt, autoSpin ? 0.08 : 0);
  renderer.render(scene, camera);
});
