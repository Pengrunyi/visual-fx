import '../../styles/scene.css';
import {
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  NoToneMapping,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  type Texture,
} from 'three';
import { QUAD_VERT } from '../../lib/quad';
import { mountHud, type HudControl } from '../../lib/hud';
import { mountIntro, prefersCoarsePointer, startLoop } from '../../lib/loop';
import { attachPointers } from '../../lib/pointers';
import {
  ADVECT_FRAG,
  BLOOM_FRAG,
  BLUR_FRAG,
  CURL_FRAG,
  DISPLAY_FRAG,
  DIVERGENCE_FRAG,
  GRADIENT_FRAG,
  JACOBI_FRAG,
  SPLAT_FRAG,
  VORTICITY_FRAG,
} from './shaders';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('missing canvas');
const stage = canvas;

const mobile = prefersCoarsePointer() || window.innerWidth < 800;
const simSize = mobile ? 144 : 256;
const bloomSize = mobile ? 96 : 160;
const jacobiIterations = mobile ? 18 : 26;

const renderer = new WebGLRenderer({
  canvas,
  antialias: false,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
});
renderer.toneMapping = NoToneMapping;
renderer.outputColorSpace = LinearSRGBColorSpace;
renderer.autoClear = false;

const scene = new Scene();
const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
const mesh = new Mesh(new PlaneGeometry(2, 2));
scene.add(mesh);

function target(size: number): WebGLRenderTarget {
  return new WebGLRenderTarget(size, size, {
    type: HalfFloatType,
    format: RGBAFormat,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    colorSpace: LinearSRGBColorSpace,
  });
}

const velocity = [target(simSize), target(simSize)];
const dye = [target(simSize), target(simSize)];
const pressure = [target(simSize), target(simSize)];
const divergence = target(simSize);
const curl = target(simSize);
const bloom = [target(bloomSize), target(bloomSize)];
let velIndex = 0;
let dyeIndex = 0;
let pressureIndex = 0;

const texel = new Vector2(1 / simSize, 1 / simSize);
const bloomTexel = new Vector2(1 / bloomSize, 1 / bloomSize);
let vorticity = 18;
let dissipation = 0.55;
let bloomStrength = 1.35;
let palette = 0;

function program(fragment: string, uniforms: ShaderMaterial['uniforms']): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: fragment,
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

const splatMat = program(SPLAT_FRAG, {
  uTarget: { value: null },
  uPoint: { value: new Vector2() },
  uColor: { value: new Vector3() },
  uRadius: { value: 0.0004 },
});
const advectMat = program(ADVECT_FRAG, {
  uVelocity: { value: null },
  uSource: { value: null },
  uDt: { value: 0.016 },
  uDissipation: { value: 0.2 },
});
const curlMat = program(CURL_FRAG, { uVelocity: { value: null }, uTexel: { value: texel } });
const vorticityMat = program(VORTICITY_FRAG, {
  uVelocity: { value: null },
  uCurl: { value: null },
  uTexel: { value: texel },
  uDt: { value: 0.016 },
  uVorticity: { value: vorticity },
});
const divergenceMat = program(DIVERGENCE_FRAG, { uVelocity: { value: null }, uTexel: { value: texel } });
const jacobiMat = program(JACOBI_FRAG, {
  uPressure: { value: null },
  uDivergence: { value: null },
  uTexel: { value: texel },
});
const gradientMat = program(GRADIENT_FRAG, {
  uPressure: { value: null },
  uVelocity: { value: null },
  uTexel: { value: texel },
});
const bloomMat = program(BLOOM_FRAG, { uDye: { value: null } });
const blurMat = program(BLUR_FRAG, { uTex: { value: null }, uDirection: { value: new Vector2() } });
const displayMat = program(DISPLAY_FRAG, {
  uDye: { value: null },
  uBloom: { value: null },
  uBloomStrength: { value: bloomStrength },
});

function pass(material: ShaderMaterial, to: WebGLRenderTarget | null) {
  mesh.material = material;
  renderer.setRenderTarget(to);
  renderer.render(scene, camera);
}

function readVel(): Texture { return velocity[velIndex]!.texture; }
function writeVel(): WebGLRenderTarget {
  const next = velocity[velIndex ^ 1]!;
  velIndex ^= 1;
  return next;
}
function readDye(): Texture { return dye[dyeIndex]!.texture; }
function writeDye(): WebGLRenderTarget {
  const next = dye[dyeIndex ^ 1]!;
  dyeIndex ^= 1;
  return next;
}

function splat(pointX: number, pointY: number, color: Vector3, radius: number, into: 'vel' | 'dye') {
  const source = into === 'vel' ? readVel() : readDye();
  const dest = into === 'vel' ? writeVel() : writeDye();
  splatMat.uniforms.uTarget!.value = source;
  (splatMat.uniforms.uPoint!.value as Vector2).set(pointX, pointY);
  splatMat.uniforms.uColor!.value = color;
  splatMat.uniforms.uRadius!.value = radius;
  pass(splatMat, dest);
}

function hsl(h: number, s: number, l: number): Vector3 {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return new Vector3(f(0), f(8), f(4));
}

function paletteColor(salt: number): Vector3 {
  const t = performance.now() * 0.001;
  if (palette === 1) return hsl((0.78 + 0.12 * Math.sin(t + salt)) % 1, 0.9, 0.58);
  if (palette === 2) return hsl((0.02 + salt * 0.08) % 1, 0.95, 0.55);
  if (palette === 3) return hsl((0.42 + 0.12 * Math.sin(t * 0.7 + salt)) % 1, 0.75, 0.55);
  return hsl((t * 0.05 + salt) % 1, 0.85, 0.56);
}

function burst(count = 18) {
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.2;
    const radius = 0.08 + Math.random() * 0.28;
    const x = 0.5 + Math.cos(angle) * radius;
    const y = 0.5 + Math.sin(angle) * radius;
    const speed = 0.35 + Math.random() * 0.45;
    splat(x, y, new Vector3(Math.cos(angle) * speed * 3.2, Math.sin(angle) * speed * 3.2, 0), 0.0014, 'vel');
    const color = paletteColor(i * 0.17).multiplyScalar(0.9);
    splat(x, y, color, 0.0018, 'dye');
  }
}

function clearFields() {
  renderer.setClearColor(0x000000, 1);
  [velocity, dye, pressure].flat().concat(divergence, curl).forEach((item) => {
    renderer.setRenderTarget(item);
    renderer.clear();
  });
  renderer.setRenderTarget(null);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.25 : 1.6);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}
resize();
window.addEventListener('resize', resize);
clearFields();
burst(14);

const strokes = new Map<number, { x: number; y: number }>();

function uvOf(sample: { x: number; y: number }) {
  const rect = stage.getBoundingClientRect();
  return {
    x: (sample.x - rect.left) / rect.width,
    y: 1 - (sample.y - rect.top) / rect.height,
  };
}

attachPointers(stage, {
  down(sample, _count, id) {
    strokes.set(id, uvOf(sample));
  },
  move(sample, count, id) {
    if (count < 1) return;
    const uv = uvOf(sample);
    const prev = strokes.get(id) ?? uv;
    const dx = uv.x - prev.x;
    const dy = uv.y - prev.y;
    const segments = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.008));
    const color = paletteColor(id * 0.17);
    for (let i = 1; i <= segments; i += 1) {
      const t = i / segments;
      const x = prev.x + dx * t;
      const y = prev.y + dy * t;
      splat(x, y, new Vector3(dx * 42, dy * 42, 0), 0.0007, 'vel');
      splat(x, y, color, 0.0011, 'dye');
    }
    strokes.set(id, uv);
  },
  up(sample, count, id) {
    strokes.delete(id);
    if (count === 0) {
      const uv = uvOf(sample);
      splat(uv.x, uv.y, paletteColor(id * 0.13).multiplyScalar(0.45), 0.0008, 'dye');
    }
  },
  tap(sample) {
    const uv = uvOf(sample);
    const angle = Math.random() * Math.PI * 2;
    splat(uv.x, uv.y, new Vector3(Math.cos(angle) * 0.8, Math.sin(angle) * 0.8, 0), 0.0014, 'vel');
    splat(uv.x, uv.y, paletteColor(Math.random()).multiplyScalar(1.3), 0.0024, 'dye');
  },
});

function downloadSnapshot() {
  mesh.material = displayMat;
  renderer.setRenderTarget(null);
  renderer.render(scene, camera);
  const link = document.createElement('a');
  link.href = stage.toDataURL('image/png');
  link.download = 'neon-fluid.png';
  link.click();
}

mountIntro('霓虹流体', '多指拖拽搅拌 · 可随机爆裂');

mountHud({
  title: (lang) => (lang === 'zh' ? '霓虹流体动力学' : 'Neon Fluid'),
  controls: (lang): HudControl[] => {
    const zh = lang === 'zh';
    return [
      {
        kind: 'button',
        label: zh ? '随机爆裂' : 'Random burst',
        primary: true,
        onClick: () => burst(22),
      },
      {
        kind: 'range',
        label: zh ? '涡量' : 'Vorticity',
        min: 0,
        max: 40,
        step: 0.5,
        value: vorticity,
        onInput: (value) => {
          vorticity = value;
        },
      },
      {
        kind: 'range',
        label: zh ? '耗散' : 'Dissipation',
        min: 0.05,
        max: 2.4,
        step: 0.01,
        value: dissipation,
        onInput: (value) => {
          dissipation = value;
        },
      },
      {
        kind: 'range',
        label: zh ? '辉光' : 'Bloom',
        min: 0,
        max: 3,
        step: 0.01,
        value: bloomStrength,
        onInput: (value) => {
          bloomStrength = value;
          displayMat.uniforms.uBloomStrength!.value = value;
        },
      },
      {
        kind: 'select',
        label: zh ? '色板' : 'Palette',
        value: String(palette),
        options: [
          { value: '0', label: zh ? '光谱' : 'Spectrum' },
          { value: '1', label: zh ? '品红青' : 'Magenta' },
          { value: '2', label: zh ? '焰色' : 'Flame' },
          { value: '3', label: zh ? '极光' : 'Aurora' },
        ],
        onChange: (value) => {
          palette = Number(value);
        },
      },
      { kind: 'button', label: zh ? '清空' : 'Clear', onClick: clearFields },
      { kind: 'button', label: zh ? '下载 PNG' : 'Download PNG', onClick: downloadSnapshot },
    ];
  },
});

startLoop((dt) => {
  const step = Math.min(dt, 0.033);
  advectMat.uniforms.uDt!.value = step;
  advectMat.uniforms.uVelocity!.value = readVel();
  advectMat.uniforms.uSource!.value = readVel();
  advectMat.uniforms.uDissipation!.value = dissipation * 0.35;
  pass(advectMat, writeVel());

  curlMat.uniforms.uVelocity!.value = readVel();
  pass(curlMat, curl);

  vorticityMat.uniforms.uVelocity!.value = readVel();
  vorticityMat.uniforms.uCurl!.value = curl.texture;
  vorticityMat.uniforms.uDt!.value = step;
  vorticityMat.uniforms.uVorticity!.value = vorticity;
  pass(vorticityMat, writeVel());

  divergenceMat.uniforms.uVelocity!.value = readVel();
  pass(divergenceMat, divergence);

  for (let i = 0; i < jacobiIterations; i += 1) {
    jacobiMat.uniforms.uPressure!.value = pressure[pressureIndex]!.texture;
    jacobiMat.uniforms.uDivergence!.value = divergence.texture;
    pass(jacobiMat, pressure[pressureIndex ^ 1]!);
    pressureIndex ^= 1;
  }

  gradientMat.uniforms.uPressure!.value = pressure[pressureIndex]!.texture;
  gradientMat.uniforms.uVelocity!.value = readVel();
  pass(gradientMat, writeVel());

  advectMat.uniforms.uVelocity!.value = readVel();
  advectMat.uniforms.uSource!.value = readDye();
  advectMat.uniforms.uDissipation!.value = dissipation;
  pass(advectMat, writeDye());

  bloomMat.uniforms.uDye!.value = readDye();
  pass(bloomMat, bloom[0]!);
  blurMat.uniforms.uTex!.value = bloom[0]!.texture;
  (blurMat.uniforms.uDirection!.value as Vector2).set(bloomTexel.x * 1.6, 0);
  pass(blurMat, bloom[1]!);
  blurMat.uniforms.uTex!.value = bloom[1]!.texture;
  (blurMat.uniforms.uDirection!.value as Vector2).set(0, bloomTexel.y * 1.6);
  pass(blurMat, bloom[0]!);

  displayMat.uniforms.uDye!.value = readDye();
  displayMat.uniforms.uBloom!.value = bloom[0]!.texture;
  pass(displayMat, null);
});
