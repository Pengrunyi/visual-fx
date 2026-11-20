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
import { bandEnergy, resumeAudio, startSynthBeat, type BeatHandle } from '../../lib/audio';
import { mountHud, type HudControl } from '../../lib/hud';
import { toast } from '../../lib/loop';
import { mountIntro, prefersCoarsePointer, startLoop } from '../../lib/loop';
import { attachPointers } from '../../lib/pointers';
import { GRID_FRAG, MANDALA_FRAG, PLASMA_FRAG, TUNNEL_FRAG } from './shaders';
import { QUAD_VERT } from '../../lib/quad';

const MODES = [
  { id: 'plasma', zh: '等离子球体', en: 'Plasma sphere', source: PLASMA_FRAG },
  { id: 'tunnel', zh: '霓虹隧道', en: 'Neon tunnel', source: TUNNEL_FRAG },
  { id: 'grid', zh: '全息地平线', en: 'Horizon grid', source: GRID_FRAG },
  { id: 'mandala', zh: '万花频谱', en: 'Mandala', source: MANDALA_FRAG },
] as const;

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('missing canvas');

const renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = NoToneMapping;
renderer.setClearColor(0x000000, 1);
const scene = new Scene();
const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
const resolution = new Vector2();
const angle = new Vector2(0.4, 0.15);
const mesh = new Mesh(new PlaneGeometry(2, 2));
scene.add(mesh);

const materials = MODES.map((mode) => new ShaderMaterial({
  vertexShader: QUAD_VERT,
  fragmentShader: mode.source,
  depthTest: false,
  depthWrite: false,
  toneMapped: false,
  uniforms: {
    uResolution: { value: resolution },
    uTime: { value: 0 },
    uBass: { value: 0.2 },
    uMid: { value: 0.15 },
    uTreble: { value: 0.1 },
    uAngle: { value: angle },
  },
}));
let modeIndex = 0;
mesh.material = materials[0]!;

const meter = document.createElement('div');
meter.className = 'hud-note';
meter.style.position = 'fixed';
meter.style.left = 'max(14px, env(safe-area-inset-left))';
meter.style.top = 'max(14px, env(safe-area-inset-top))';
meter.style.zIndex = '12';
meter.style.pointerEvents = 'none';
document.body.append(meter);

let playback: { stop: () => void } | null = null;
let analyser: AnalyserNode | null = null;
let bins = new Uint8Array(0);
let stream: MediaStream | null = null;
const levels = { bass: 0.2, mid: 0.15, treble: 0.1 };
let audioLabel = 'idle';

function stopPlayback() {
  playback?.stop();
  playback = null;
  analyser = null;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
}

async function useSynth() {
  const ctx = await resumeAudio();
  stopPlayback();
  const beat: BeatHandle = startSynthBeat(ctx);
  playback = beat;
  analyser = beat.analyser;
  bins = new Uint8Array(analyser.frequencyBinCount);
  audioLabel = 'synth';
}

async function useFile(file: File) {
  const ctx = await resumeAudio();
  const raw = await file.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(raw.slice(0));
  stopPlayback();
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.loop = true;
  const node = ctx.createAnalyser();
  node.fftSize = 2048;
  node.smoothingTimeConstant = 0.75;
  source.connect(node);
  node.connect(ctx.destination);
  source.start();
  playback = { stop: () => { source.stop(); node.disconnect(); } };
  analyser = node;
  bins = new Uint8Array(node.frequencyBinCount);
  audioLabel = file.name;
}

async function useMic() {
  const ctx = await resumeAudio();
  const media = await navigator.mediaDevices.getUserMedia({ audio: true });
  stopPlayback();
  stream = media;
  const source = ctx.createMediaStreamSource(media);
  const node = ctx.createAnalyser();
  node.fftSize = 2048;
  node.smoothingTimeConstant = 0.7;
  source.connect(node);
  playback = {
    stop: () => {
      media.getTracks().forEach((track) => track.stop());
      node.disconnect();
    },
  };
  analyser = node;
  bins = new Uint8Array(node.frequencyBinCount);
  audioLabel = 'mic';
}

const fileInput = document.createElement('input');
fileInput.type = 'file';
fileInput.accept = 'audio/*';
fileInput.hidden = true;
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  void useFile(file).catch(() => toast('无法解码音频'));
});
document.body.append(fileInput);

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, prefersCoarsePointer() ? 1.15 : 1.5);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  resolution.set(canvas!.width, canvas!.height);
}
resize();
window.addEventListener('resize', resize);

attachPointers(canvas, {
  drag(dx, dy) {
    angle.x -= dx * 0.005;
    angle.y = Math.max(-1.1, Math.min(1.1, angle.y + dy * 0.004));
  },
});

mountIntro('音画频谱星环', '先点「合成节拍」，或导入音频 / 麦克风');

mountHud({
  title: (lang) => (lang === 'zh' ? '音画频谱星环' : 'Audio Shader Lab'),
  controls: (lang): HudControl[] => {
    const zh = lang === 'zh';
    return [
      {
        kind: 'select',
        label: zh ? '视觉' : 'Shader',
        value: String(modeIndex),
        options: MODES.map((mode, index) => ({ value: String(index), label: zh ? mode.zh : mode.en })),
        onChange: (value) => {
          modeIndex = Number(value);
          mesh.material = materials[modeIndex] ?? materials[0]!;
        },
      },
      {
        kind: 'button',
        label: zh ? '合成节拍' : 'Synth beat',
        primary: true,
        onClick: () => {
          void useSynth().catch(() => toast(zh ? '音频启动失败' : 'Audio failed'));
        },
      },
      {
        kind: 'button',
        label: zh ? '本地音频' : 'Audio file',
        onClick: () => fileInput.click(),
      },
      {
        kind: 'button',
        label: zh ? '麦克风' : 'Microphone',
        onClick: () => {
          void useMic().catch(() => toast(zh ? '麦克风不可用' : 'Microphone unavailable'));
        },
      },
      {
        kind: 'button',
        label: zh ? '停止' : 'Stop',
        onClick: () => {
          stopPlayback();
          audioLabel = 'idle';
        },
      },
      {
        kind: 'note',
        text: zh
          ? '内置合成鼓点不需要任何外部 MP3。拖拽可转动视角。'
          : 'The built-in beat needs no external file. Drag to orbit.',
      },
    ];
  },
});

startLoop((dt, time) => {
  let target = {
    bass: 0.18 + Math.sin(time * 2.1) * 0.08,
    mid: 0.12 + Math.sin(time * 1.3) * 0.05,
    treble: 0.08,
  };
  if (analyser && bins.length > 0) {
    const ctx = analyser.context;
    target = bandEnergy(analyser, bins, ctx.sampleRate);
  }
  levels.bass += (target.bass - levels.bass) * Math.min(1, dt * 8);
  levels.mid += (target.mid - levels.mid) * Math.min(1, dt * 8);
  levels.treble += (target.treble - levels.treble) * Math.min(1, dt * 8);
  materials.forEach((material) => {
    material.uniforms.uTime!.value = time;
    material.uniforms.uBass!.value = levels.bass;
    material.uniforms.uMid!.value = levels.mid;
    material.uniforms.uTreble!.value = levels.treble;
  });
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  meter.textContent = `${audioLabel}  ·  LOW ${pct(levels.bass)}  MID ${pct(levels.mid)}  HIGH ${pct(levels.treble)}`;
  renderer.render(scene, camera);
});
