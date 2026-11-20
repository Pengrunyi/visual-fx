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
import { QUAD_VERT } from '../../lib/quad';
import { mountHud, type HudControl } from '../../lib/hud';
import { mountIntro, prefersCoarsePointer, startLoop } from '../../lib/loop';
import { attachPointers } from '../../lib/pointers';
import { resumeAudio, startOrganDrone, type Stoppable } from '../../lib/audio';
import { blackHoleFragment } from './shader';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('missing canvas');

const mobile = prefersCoarsePointer() || Math.min(window.innerWidth, window.innerHeight) < 760;
const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = NoToneMapping;
renderer.setClearColor(0x000000, 1);
const scene = new Scene();
const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
const resolution = new Vector2();
const angles = new Vector2(0.62, 0.26);
const flares = {
  ang: [0, 1, 2, 3],
  rad: [3, 3, 3, 3],
  age: [20, 20, 20, 20],
};
let zoom = 0.38;
let doppler = 1;
let nextFlare = 0;
let organ: Stoppable | null = null;

const material = new ShaderMaterial({
  vertexShader: QUAD_VERT,
  fragmentShader: blackHoleFragment(mobile ? 76 : 118),
  uniforms: {
    uResolution: { value: resolution },
    uTime: { value: 0 },
    uAngle: { value: angles },
    uZoom: { value: zoom },
    uDoppler: { value: doppler },
    uFlareAng: { value: flares.ang },
    uFlareRad: { value: flares.rad },
    uFlareAge: { value: flares.age },
  },
  depthTest: false,
  depthWrite: false,
  toneMapped: false,
});
scene.add(new Mesh(new PlaneGeometry(2, 2), material));

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.3);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  resolution.set(canvas!.width, canvas!.height);
}
resize();
window.addEventListener('resize', resize);

function ignite(nx: number, ny: number) {
  const index = nextFlare % 4;
  nextFlare += 1;
  const pointerAngle = Math.atan2(ny, nx);
  flares.ang[index] = pointerAngle + angles.x;
  flares.rad[index] = 2.1 + Math.min(1, Math.hypot(nx, ny)) * 2.4;
  flares.age[index] = 0;
}

attachPointers(canvas, {
  drag(dx, dy) {
    angles.x -= dx * 0.0055;
    angles.y = Math.max(-0.9, Math.min(0.9, angles.y + dy * 0.004));
  },
  pinch(factor) {
    zoom = Math.max(0, Math.min(1, zoom + (factor - 1) * 0.85));
    material.uniforms.uZoom!.value = zoom;
  },
  tap(sample) {
    ignite(sample.nx, sample.ny);
  },
});

mountIntro('卡冈图雅黑洞', '拖拽环绕 · 双指缩放 · 轻点点燃耀斑');

mountHud({
  title: (lang) => (lang === 'zh' ? '卡冈图雅黑洞' : 'Gargantua'),
  controls: (lang): HudControl[] => {
    const zh = lang === 'zh';
    return [
      {
        kind: 'range',
        label: zh ? '缩放' : 'Zoom',
        min: 0,
        max: 1,
        step: 0.01,
        value: zoom,
        onInput: (value) => {
          zoom = value;
          material.uniforms.uZoom!.value = value;
        },
      },
      {
        kind: 'toggle',
        label: zh ? '多普勒聚束' : 'Doppler beaming',
        value: doppler > 0.5,
        onChange: (value) => {
          doppler = value ? 1 : 0;
          material.uniforms.uDoppler!.value = doppler;
        },
      },
      {
        kind: 'toggle',
        label: zh ? '管风琴低鸣' : 'Organ drone',
        value: organ !== null,
        onChange: (value) => {
          void (async () => {
            if (!value) {
              organ?.stop();
              organ = null;
              return;
            }
            const ctx = await resumeAudio();
            organ?.stop();
            organ = startOrganDrone(ctx, ctx.destination);
          })();
        },
      },
      {
        kind: 'note',
        text: zh
          ? '光线沿施瓦西测地线步进。吸积盘可被弯曲到黑洞上方，形成第二次成像。'
          : 'Rays follow Schwarzschild geodesics. The disk can lens over the shadow as a second image.',
      },
    ];
  },
});

startLoop((dt, time) => {
  for (let i = 0; i < 4; i += 1) flares.age[i] += dt;
  material.uniforms.uTime!.value = time;
  renderer.render(scene, camera);
});
