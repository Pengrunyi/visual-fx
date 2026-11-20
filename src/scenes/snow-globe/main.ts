import '../../styles/scene.css';
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  FogExp2,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  BoxGeometry,
  WebGLRenderer,
  AdditiveBlending,
  SRGBColorSpace,
} from 'three';
import { resumeAudio, SILENT_NIGHT, startMusicBox, type Stoppable } from '../../lib/audio';
import { mountHud, type HudControl } from '../../lib/hud';
import { clamp, mountIntro, prefersCoarsePointer, startLoop } from '../../lib/loop';
import { attachPointers } from '../../lib/pointers';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('missing canvas');

const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x070b16, 1);
renderer.outputColorSpace = SRGBColorSpace;
const scene = new Scene();
scene.fog = new FogExp2(0x070b16, 0.035);
const camera = new PerspectiveCamera(42, 1, 0.1, 40);
camera.position.set(0, 0.55, 4.8);

const root = new Group();
scene.add(root);
const ambient = new AmbientLight(0xc5d7ff, 0.18);
const moon = new DirectionalLight(0xc5d4ff, 0.45);
moon.position.set(-3, 5, 2);
scene.add(ambient, moon);

const wood = new MeshStandardMaterial({ color: 0x4a2c18, roughness: 0.78, metalness: 0.04 });
const base = new Mesh(new CylinderGeometry(1.22, 1.42, 0.5, 40), wood);
base.position.y = -1.58;
root.add(base);
const brass = new Mesh(
  new TorusGeometry(1.18, 0.055, 12, 48),
  new MeshStandardMaterial({ color: 0xd4b483, roughness: 0.35, metalness: 0.72 }),
);
brass.rotation.x = Math.PI / 2;
brass.position.y = -1.34;
root.add(brass);

const glassMaterial = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  toneMapped: false,
  uniforms: { uDay: { value: 0 } },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vWorld;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      vNormal = normalize(mat3(modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz) * normal);
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    varying vec3 vWorld;
    uniform float uDay;
    void main() {
      vec3 viewDir = normalize(cameraPosition - vWorld);
      vec3 normal = normalize(vNormal);
      float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.15);
      vec3 reflectDir = reflect(-viewDir, normal);
      vec3 nightSky = mix(vec3(0.02, 0.03, 0.07), vec3(0.25, 0.4, 0.62), clamp(reflectDir.y * 0.5 + 0.5, 0.0, 1.0));
      vec3 daySky = mix(vec3(0.55, 0.72, 0.9), vec3(0.9, 0.95, 1.0), clamp(reflectDir.y, 0.0, 1.0));
      vec3 sky = mix(nightSky, daySky, uDay);
      float spec = pow(max(dot(reflectDir, normalize(vec3(-0.35, 0.85, 0.25))), 0.0), 48.0);
      vec3 color = sky * fresnel + vec3(1.0, 0.97, 0.9) * spec;
      float alpha = clamp(fresnel * 0.78 + 0.05, 0.0, 0.82);
      gl_FragColor = vec4(color, alpha);
    }
  `,
});
const glass = new Mesh(new SphereGeometry(1.5, 64, 48), glassMaterial);
glass.position.y = 0.12;
glass.renderOrder = 3;
root.add(glass);

const inner = new Group();
inner.position.y = 0.12;
root.add(inner);
const snowMat = new MeshStandardMaterial({ color: 0xe7eef8, roughness: 1 });
const ground = new Mesh(new CircleGeometry(1.28, 40), snowMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.95;
inner.add(ground);

const cabinWood = new MeshStandardMaterial({ color: 0x6b3a22, roughness: 0.86 });
const cabin = new Mesh(new BoxGeometry(0.62, 0.42, 0.46), cabinWood);
cabin.position.set(0.05, -0.72, 0.05);
inner.add(cabin);
const roof = new Mesh(
  new ConeGeometry(0.5, 0.32, 4),
  new MeshStandardMaterial({ color: 0x2c1812, roughness: 0.9 }),
);
roof.position.set(0.05, -0.38, 0.05);
roof.rotation.y = Math.PI / 4;
inner.add(roof);
const windows: Mesh[] = [];
const windowMat = () => new MeshStandardMaterial({
  color: 0xffc98a,
  emissive: 0xff9a3c,
  emissiveIntensity: 2.4,
  roughness: 0.35,
});
[[-0.16, -0.7, 0.28], [0.18, -0.7, 0.28]].forEach(([x, y, z]) => {
  const win = new Mesh(new BoxGeometry(0.12, 0.1, 0.03), windowMat());
  win.position.set(x!, y!, z!);
  windows.push(win);
  inner.add(win);
});
const door = new Mesh(
  new BoxGeometry(0.12, 0.2, 0.03),
  new MeshStandardMaterial({ color: 0x1a0d08, roughness: 0.8 }),
);
door.position.set(0.02, -0.8, 0.28);
inner.add(door);

function pine(x: number, z: number, scale: number) {
  const group = new Group();
  const leaf = new MeshStandardMaterial({ color: 0x16382a, roughness: 0.82 });
  const trunkMat = new MeshStandardMaterial({ color: 0x3a2416, roughness: 0.9 });
  const trunk = new Mesh(new CylinderGeometry(0.03 * scale, 0.045 * scale, 0.16 * scale, 6), trunkMat);
  trunk.position.y = 0.08 * scale;
  const lower = new Mesh(new ConeGeometry(0.2 * scale, 0.32 * scale, 8), leaf);
  lower.position.y = 0.26 * scale;
  const upper = new Mesh(new ConeGeometry(0.14 * scale, 0.26 * scale, 8), leaf);
  upper.position.y = 0.46 * scale;
  group.add(trunk, lower, upper);
  group.position.set(x, -0.95, z);
  return group;
}
inner.add(pine(-0.55, 0.15, 1.15), pine(0.62, -0.05, 0.9), pine(-0.2, -0.45, 0.75), pine(0.35, 0.48, 0.7));

const lanternPole = new Mesh(
  new CylinderGeometry(0.015, 0.02, 0.42, 8),
  new MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.4 }),
);
lanternPole.position.set(-0.78, -0.74, 0.35);
inner.add(lanternPole);
const bulbMat = new MeshStandardMaterial({
  color: 0xffe1a8,
  emissive: 0xffb15a,
  emissiveIntensity: 3.5,
  roughness: 0.4,
});
const bulb = new Mesh(new SphereGeometry(0.055, 16, 16), bulbMat);
bulb.position.set(-0.78, -0.5, 0.35);
inner.add(bulb);
const lantern = new PointLight(0xffb15a, 6, 3.4, 2);
lantern.position.copy(bulb.position);
inner.add(lantern);

const flakes = 2800;
const flakeGeometry = new BufferGeometry();
const flakePositions = new Float32Array(flakes * 3);
const flakeSeeds = new Float32Array(flakes);
for (let i = 0; i < flakes; i += 1) {
  const radius = Math.cbrt(Math.random()) * 1.22;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  flakePositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
  flakePositions[i * 3 + 1] = radius * Math.cos(phi);
  flakePositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  flakeSeeds[i] = Math.random();
}
flakeGeometry.setAttribute('position', new BufferAttribute(flakePositions, 3));
flakeGeometry.setAttribute('aSeed', new BufferAttribute(flakeSeeds, 1));
const flakeMaterial = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: AdditiveBlending,
  toneMapped: false,
  uniforms: { uTime: { value: 0 }, uStir: { value: 0 }, uPixelRatio: { value: 1 } },
  vertexShader: `
    attribute float aSeed;
    uniform float uTime;
    uniform float uStir;
    uniform float uPixelRatio;
    varying float vAlpha;
    void main() {
      vec3 pos = position;
      float ang = uTime * (0.25 + aSeed * 0.35) + uStir * (2.5 + aSeed * 4.0);
      float c = cos(ang);
      float s = sin(ang);
      pos.xz = vec2(c * pos.x - s * pos.z, s * pos.x + c * pos.z);
      float speed = (0.08 + aSeed * 0.12) * (1.0 + uStir * 2.4);
      pos.y = mod(position.y - uTime * speed + 1.3, 2.6) - 1.3;
      float radius = length(pos);
      vAlpha = smoothstep(1.32, 1.05, radius);
      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = clamp((0.7 + aSeed) * uPixelRatio * (14.0 / max(1.0, -mv.z)), 1.0, 2.8);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: `
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      if (d > 0.5) discard;
      float a = smoothstep(0.5, 0.05, d) * vAlpha;
      gl_FragColor = vec4(vec3(0.93, 0.96, 1.0), a);
    }
  `,
});
const flakePoints = new Points(flakeGeometry, flakeMaterial);
flakePoints.position.y = 0.12;
flakePoints.renderOrder = 1;
flakePoints.frustumCulled = false;
root.add(flakePoints);

let day = false;
let stir = 0.15;
let tiltX = 0;
let tiltZ = 0;
let camZ = 4.8;
let music: Stoppable | null = null;
let listening = false;
let lastShake = 0;

function applyLighting() {
  const amount = day ? 1 : 0;
  ambient.intensity = day ? 0.85 : 0.12;
  moon.intensity = day ? 0.55 : 0.28;
  lantern.intensity = day ? 0.35 : 6.5;
  bulbMat.emissiveIntensity = day ? 0.4 : 3.6;
  windows.forEach((win) => {
    const mat = win.material as MeshStandardMaterial;
    mat.emissiveIntensity = day ? 0.25 : 2.5;
  });
  const sky = day ? new Color(0x9ec9ea) : new Color(0x070b16);
  renderer.setClearColor(sky, 1);
  scene.fog = new FogExp2(sky, day ? 0.02 : 0.045);
  glassMaterial.uniforms.uDay!.value = amount;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, prefersCoarsePointer() ? 1.35 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
  camera.updateProjectionMatrix();
  flakeMaterial.uniforms.uPixelRatio!.value = renderer.getPixelRatio();
}
resize();
window.addEventListener('resize', resize);
applyLighting();

attachPointers(canvas, {
  drag(dx, dy) {
    tiltZ = clamp(tiltZ + dx * 0.003, -0.45, 0.45);
    tiltX = clamp(tiltX + dy * 0.003, -0.38, 0.38);
    stir = clamp(stir + (Math.abs(dx) + Math.abs(dy)) * 0.004, 0, 1);
  },
  pinch(factor) {
    camZ = clamp(camZ / factor, 3.1, 8.2);
  },
});

function onMotion(event: DeviceMotionEvent) {
  const accel = event.accelerationIncludingGravity;
  if (!accel || accel.x === null || accel.y === null) return;
  const mag = Math.hypot(accel.x, accel.y, accel.z ?? 0);
  if (lastShake === 0) {
    lastShake = mag;
    return;
  }
  if (Math.abs(mag - lastShake) > 3.2) stir = Math.min(1, stir + 0.45);
  lastShake = mag;
  tiltZ = clamp(accel.x * 0.045, -0.45, 0.45);
  tiltX = clamp(accel.y * 0.035, -0.38, 0.38);
}

async function enableShake() {
  const ctor = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
  if (typeof ctor.requestPermission === 'function') {
    const result = await ctor.requestPermission();
    if (result !== 'granted') return;
  }
  if (listening) return;
  window.addEventListener('devicemotion', onMotion);
  listening = true;
}

mountIntro('水晶球音乐盒', '拖拽倾斜 · 摇晃扬雪');

mountHud({
  title: (lang) => (lang === 'zh' ? '3D 水晶球音乐盒' : 'Winter Snow Globe'),
  controls: (lang): HudControl[] => {
    const zh = lang === 'zh';
    return [
      {
        kind: 'toggle',
        label: zh ? '白昼' : 'Daylight',
        value: day,
        onChange: (value) => {
          day = value;
          applyLighting();
        },
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
            music = startMusicBox(ctx, ctx.destination, SILENT_NIGHT, 72);
          })();
        },
      },
      {
        kind: 'button',
        label: zh ? '搅动风雪' : 'Stir snow',
        primary: true,
        onClick: () => {
          stir = 1;
        },
      },
      {
        kind: 'button',
        label: zh ? '启用摇一摇' : 'Enable shake',
        onClick: () => {
          void enableShake();
        },
      },
      {
        kind: 'note',
        text: zh ? '拖动倾斜水晶球，松手后它会慢慢回正。' : 'Drag to tilt the globe. It settles back when you let go.',
      },
    ];
  },
});

startLoop((dt, time) => {
  stir *= Math.exp(-dt * 0.65);
  tiltX += (0 - tiltX) * Math.min(1, dt * 1.6);
  tiltZ += (0 - tiltZ) * Math.min(1, dt * 1.6);
  root.rotation.x = tiltX;
  root.rotation.z = tiltZ;
  camera.position.z = camZ;
  camera.lookAt(0, 0.15, 0);
  flakeMaterial.uniforms.uTime!.value = time;
  flakeMaterial.uniforms.uStir!.value = stir;
  lantern.intensity = (day ? 0.35 : 6.5) + Math.sin(time * 7) * (day ? 0.05 : 0.35);
  renderer.render(scene, camera);
});
