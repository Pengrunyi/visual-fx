import '../../styles/scene.css';
import {
  Mesh,
  NoToneMapping,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
} from 'three';
import { HASH_GLSL, QUAD_VERT } from '../../lib/quad';
import { mountHud, type HudControl } from '../../lib/hud';
import { clamp, mountIntro, prefersCoarsePointer, startLoop } from '../../lib/loop';
import { attachPointers } from '../../lib/pointers';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('missing canvas');

const mobile = prefersCoarsePointer();
const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = NoToneMapping;
renderer.setClearColor(0x000000, 1);
const scene = new Scene();
const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
const resolution = new Vector2();
const pointer = new Vector2(0, 0.2);

let sweep = 0;
let boost = 0.35;
let burst = 0;
let speed = 1;
let snow = 1;
let palette = 0;

const material = new ShaderMaterial({
  vertexShader: QUAD_VERT,
  fragmentShader: `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uPointer;
uniform float uSweep;
uniform float uBoost;
uniform float uBurst;
uniform float uSnow;
uniform float uPalette;
varying vec2 vUv;
${HASH_GLSL}

vec3 paletteColor(float t) {
  vec3 a = vec3(0.05, 0.85, 0.45);
  vec3 b = vec3(0.25, 0.95, 0.85);
  vec3 c = vec3(0.75, 0.35, 1.0);
  if (uPalette > 1.5) {
    a = vec3(0.35, 0.7, 1.0);
    b = vec3(0.75, 0.95, 1.0);
    c = vec3(0.55, 0.75, 1.0);
  } else if (uPalette > 0.5) {
    a = vec3(0.85, 0.15, 0.55);
    b = vec3(0.95, 0.45, 0.95);
    c = vec3(0.35, 0.15, 0.85);
  }
  return mix(mix(a, b, t), c, smoothstep(0.55, 1.0, t));
}

float ridge(float x, float scale, float height, float shift) {
  float n = fbm(vec2(x * scale, shift));
  n += 0.45 * fbm(vec2(x * scale * 2.1 + 4.0, shift + 2.0));
  return n * height;
}

float snowLayer(vec2 uv, float scale, float time, float drift) {
  vec2 p = uv * scale;
  p.y += time;
  p.x += sin(p.y * 1.3 + drift) * 0.18 + drift;
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;
  float n = hash12(id);
  vec2 o = vec2(hash12(id + 3.1), hash12(id + 7.7)) - 0.5;
  float d = length(f - o * 0.6);
  float flake = smoothstep(0.04 + n * 0.02, 0.0, d);
  flake *= step(0.72, n);
  return flake;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float night = smoothstep(-0.2, 0.85, uv.y);
  vec3 sky = mix(vec3(0.008, 0.012, 0.03), vec3(0.02, 0.07, 0.12), night);
  sky += vec3(0.05, 0.08, 0.16) * exp(-pow(uv.x * 0.7, 2.0)) * smoothstep(-0.1, 0.5, uv.y);

  float starU = uv.x * 90.0;
  float starV = uv.y * 70.0;
  vec2 cell = floor(vec2(starU, starV));
  float h = hash12(cell);
  float tw = 0.45 + 0.55 * sin(uTime * (1.2 + h * 4.0) + h * 20.0);
  float star = smoothstep(0.985, 0.999, h) * tw * smoothstep(0.02, 0.2, uv.y);
  sky += vec3(0.8, 0.88, 1.0) * star;

  float curtain = 0.0;
  vec3 aurora = vec3(0.0);
  float shift = uPointer.x * 0.55 + uSweep;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float x = uv.x + shift * (0.25 + fi * 0.08);
    float y = 0.18 + 0.16 * sin(x * (1.3 + fi * 0.35) + uTime * 0.35 + fi);
    y += fbm(vec2(x * 1.4 + uTime * 0.12, fi * 2.0)) * 0.28;
    y += uPointer.y * 0.08;
    float band = exp(-abs(uv.y - y) * (7.5 - fi));
    float streaks = 0.55 + 0.45 * sin(x * (28.0 + fi * 6.0) + fbm(vec2(x * 3.0, uv.y)) * 6.0);
    float sheet = band * streaks * (0.55 + 0.45 * fbm(vec2(x * 2.0, uv.y * 1.4 + uTime * 0.2)));
    curtain += sheet;
    aurora += paletteColor(fi / 3.0) * sheet * (1.15 - fi * 0.12);
  }
  float energy = uBoost * (1.0 + uBurst * 1.8);
  sky += aurora * energy * smoothstep(-0.05, 0.15, uv.y);

  float m1 = ridge(uv.x, 1.6, 0.42, 1.0);
  float m2 = ridge(uv.x + 2.0, 2.4, 0.3, 4.0);
  float m3 = ridge(uv.x + 6.0, 3.2, 0.2, 8.0);
  float horizon = -0.38;
  float s1 = smoothstep(0.012, -0.012, uv.y - (horizon + m1));
  float s2 = smoothstep(0.01, -0.01, uv.y - (horizon - 0.05 + m2));
  float s3 = smoothstep(0.008, -0.008, uv.y - (horizon - 0.1 + m3));
  sky = mix(sky, vec3(0.015, 0.02, 0.035), s3);
  sky = mix(sky, vec3(0.01, 0.012, 0.02), s2);
  sky = mix(sky, vec3(0.004, 0.005, 0.01), s1);

  float windows = 0.0;
  vec2 wuv = vec2(uv.x * 18.0, (uv.y - horizon) * 30.0);
  float wh = hash12(floor(wuv));
  windows = step(0.82, wh) * s2 * (1.0 - s1) * smoothstep(0.0, 0.08, uv.y - horizon + 0.12);
  sky += vec3(1.0, 0.72, 0.35) * windows * 0.8;

  float flakes = 0.0;
  flakes += snowLayer(uv, 9.0, uTime * 0.18, 0.4);
  flakes += snowLayer(uv + 3.0, 16.0, uTime * 0.28, 1.3) * 0.8;
  flakes += snowLayer(uv + 7.0, 26.0, uTime * 0.42, 2.1) * 0.55;
  sky += vec3(0.85, 0.92, 1.0) * flakes * uSnow;

  float ground = smoothstep(0.02, -0.05, uv.y - horizon + 0.02);
  sky = mix(sky, vec3(0.75, 0.82, 0.9), ground * 0.18);

  vec2 q = gl_FragCoord.xy / uResolution - 0.5;
  sky *= 1.0 - dot(q, q) * 0.45;
  gl_FragColor = vec4(sky, 1.0);
}
`,
  uniforms: {
    uResolution: { value: resolution },
    uTime: { value: 0 },
    uPointer: { value: pointer },
    uSweep: { value: 0 },
    uBoost: { value: boost },
    uBurst: { value: 0 },
    uSnow: { value: snow },
    uPalette: { value: palette },
  },
  depthTest: false,
  depthWrite: false,
  toneMapped: false,
});
scene.add(new Mesh(new PlaneGeometry(2, 2), material));

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.7);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  resolution.set(canvas!.width, canvas!.height);
}
resize();
window.addEventListener('resize', resize);

let lastX = 0;
attachPointers(canvas, {
  down(sample) {
    lastX = sample.nx;
    pointer.set(sample.nx, sample.ny);
  },
  drag(dx, dy, sample) {
    sweep += dx * 0.012 + (sample.nx - lastX) * 0.4;
    lastX = sample.nx;
    boost = clamp(boost + (Math.abs(dx) + Math.abs(dy)) * 0.008, 0.2, 2.4);
    pointer.set(sample.nx, sample.ny);
  },
  doubleTap() {
    burst = 1;
    boost = 2.2;
  },
});

mountIntro('极光雪夜', '滑动照亮光带 · 双击地磁爆发');

mountHud({
  title: (lang) => (lang === 'zh' ? '极光雪夜' : 'GLSL Aurora'),
  controls: (lang): HudControl[] => {
    const zh = lang === 'zh';
    return [
      {
        kind: 'range',
        label: zh ? '速度' : 'Speed',
        min: 0.2,
        max: 2.2,
        step: 0.01,
        value: speed,
        onInput: (value) => {
          speed = value;
        },
      },
      {
        kind: 'range',
        label: zh ? '降雪' : 'Snow',
        min: 0,
        max: 1.8,
        step: 0.01,
        value: snow,
        onInput: (value) => {
          snow = value;
          material.uniforms.uSnow!.value = value;
        },
      },
      {
        kind: 'range',
        label: zh ? '亮度' : 'Brightness',
        min: 0.2,
        max: 2.2,
        step: 0.01,
        value: boost,
        onInput: (value) => {
          boost = value;
        },
      },
      {
        kind: 'select',
        label: zh ? '色板' : 'Palette',
        value: String(palette),
        options: [
          { value: '0', label: zh ? '北极绿' : 'Arctic' },
          { value: '1', label: zh ? '磁暴紫' : 'Solar' },
          { value: '2', label: zh ? '冰晶蓝' : 'Ice' },
        ],
        onChange: (value) => {
          palette = Number(value);
          material.uniforms.uPalette!.value = palette;
        },
      },
      {
        kind: 'button',
        label: zh ? '地磁爆发' : 'Geomagnetic burst',
        primary: true,
        onClick: () => {
          burst = 1;
          boost = 2.1;
        },
      },
    ];
  },
});

startLoop((dt, time) => {
  burst *= Math.exp(-dt * 0.85);
  boost += (0.7 - boost) * Math.min(1, dt * 0.35);
  material.uniforms.uTime!.value = time * speed;
  material.uniforms.uSweep!.value = sweep;
  material.uniforms.uBoost!.value = boost;
  material.uniforms.uBurst!.value = burst;
  renderer.render(scene, camera);
});
