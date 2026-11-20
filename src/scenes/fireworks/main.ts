import '../../styles/scene.css';
import { playBoom, playLaunchWhistle, resumeAudio } from '../../lib/audio';
import { mountHud, type HudControl } from '../../lib/hud';
import { mountIntro, startLoop } from '../../lib/loop';
import { attachPointers } from '../../lib/pointers';

type Kind = 'chrys' | 'willow' | 'ring' | 'double' | 'heart' | 'spiral';

interface Rocket {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetY: number;
  kind: Kind;
  hue: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  hue: number;
  size: number;
  drag: number;
  gravity: number;
  trail: number[];
  glitter: boolean;
}

interface Delayed {
  x: number;
  y: number;
  at: number;
  kind: Kind;
  hue: number;
}

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('missing canvas');
const ctx = canvas.getContext('2d');
if (!ctx) throw new Error('2d context unavailable');

const KINDS: Kind[] = ['chrys', 'willow', 'ring', 'double', 'heart', 'spiral'];
const rockets: Rocket[] = [];
const sparks: Spark[] = [];
const delayed: Delayed[] = [];
const stars = Array.from({ length: 80 }, () => ({
  x: Math.random(),
  y: Math.random() * 0.72,
  s: Math.random() * 1.4 + 0.4,
  p: Math.random() * Math.PI * 2,
}));

let width = 1;
let height = 1;
let gravity = 320;
let density = 1;
let trail = 8;
let auto = true;
let sound = false;
let autoTimer = 0.4;
let kindCursor = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas!.width = Math.floor(width * dpr);
  canvas!.height = Math.floor(height * dpr);
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx!.fillStyle = '#00000a';
  ctx!.fillRect(0, 0, width, height);
}
resize();
window.addEventListener('resize', resize);

function hsl(hue: number, sat: number, light: number, alpha: number): string {
  return `hsla(${hue} ${sat}% ${light}% / ${alpha})`;
}

function pushSpark(spark: Spark) {
  if (sparks.length > 3800) sparks.splice(0, 400);
  sparks.push(spark);
}

function explode(x: number, y: number, kind: Kind, hue: number) {
  const count = Math.floor((kind === 'willow' ? 90 : 70) * density);
  for (let i = 0; i < count; i += 1) {
    let angle = Math.random() * Math.PI * 2;
    let speed = 70 + Math.random() * 190;
    let sparkHue = hue + (Math.random() - 0.5) * 18;
    let drag = 0.55;
    let grav = 1;
    let life = 1.1 + Math.random() * 0.7;
    let glitter = false;
    if (kind === 'ring') {
      angle = (i / count) * Math.PI * 2;
      speed = 150 + Math.random() * 20;
    } else if (kind === 'heart') {
      const t = (i / count) * Math.PI * 2;
      const hx = 16 * Math.sin(t) ** 3;
      const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      const len = Math.hypot(hx, hy) || 1;
      angle = Math.atan2(-hy, hx);
      speed = 18 * (len / 16) + Math.random() * 16;
      sparkHue = 345 + Math.random() * 16;
    } else if (kind === 'spiral') {
      angle = (i / count) * Math.PI * 10;
      speed = 40 + (i / count) * 220;
    } else if (kind === 'willow') {
      speed = 40 + Math.random() * 90;
      grav = 1.35;
      life = 1.8 + Math.random() * 0.8;
      drag = 0.25;
      glitter = true;
    } else if (kind === 'double') {
      speed = 80 + Math.random() * 150;
    }
    pushSpark({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      max: life,
      hue: sparkHue,
      size: kind === 'willow' ? 1.4 : 1.8,
      drag,
      gravity: grav,
      trail: [],
      glitter,
    });
  }
  if (kind === 'double') {
    delayed.push({ x, y: y - 10, at: performance.now() / 1000 + 0.32, kind: 'chrys', hue: (hue + 40) % 360 });
  }
  if (sound) {
    void resumeAudio().then((audio) => playBoom(audio, audio.destination));
  }
}

function launch(targetX: number, targetY: number, kind = KINDS[kindCursor++ % KINDS.length] ?? 'chrys') {
  const x = targetX + (Math.random() - 0.5) * 30;
  const y = height + 4;
  const dx = targetX - x;
  const dy = targetY - y;
  const duration = 0.75 + Math.random() * 0.25;
  rockets.push({
    x,
    y,
    vx: dx / duration,
    vy: dy / duration,
    targetY,
    kind,
    hue: Math.random() * 360,
  });
  if (sound) {
    void resumeAudio().then((audio) => playLaunchWhistle(audio, audio.destination));
  }
}

attachPointers(canvas, {
  tap(sample) {
    launch(sample.x, Math.max(90, Math.min(height * 0.62, sample.y - 30)));
  },
});

mountIntro('夜空物理烟花', '点击任意位置发射');

mountHud({
  title: (lang) => (lang === 'zh' ? '夜空物理烟花' : 'Firework Show'),
  controls: (lang): HudControl[] => {
    const zh = lang === 'zh';
    return [
      {
        kind: 'toggle',
        label: zh ? '自动表演' : 'Auto show',
        value: auto,
        onChange: (value) => {
          auto = value;
        },
      },
      {
        kind: 'toggle',
        label: zh ? '合成音效' : 'Synth audio',
        value: sound,
        onChange: (value) => {
          sound = value;
          if (value) void resumeAudio();
        },
      },
      {
        kind: 'range',
        label: zh ? '重力' : 'Gravity',
        min: 80,
        max: 620,
        step: 1,
        value: gravity,
        onInput: (value) => {
          gravity = value;
        },
      },
      {
        kind: 'range',
        label: zh ? '密度' : 'Density',
        min: 0.4,
        max: 1.8,
        step: 0.05,
        value: density,
        onInput: (value) => {
          density = value;
        },
      },
      {
        kind: 'range',
        label: zh ? '拖尾' : 'Trail',
        min: 2,
        max: 16,
        step: 1,
        value: trail,
        onInput: (value) => {
          trail = value;
        },
      },
      {
        kind: 'button',
        label: zh ? '齐射' : 'Volley',
        primary: true,
        onClick: () => {
          KINDS.forEach((kind, index) => {
            launch(width * (0.18 + index * 0.12), height * (0.28 + (index % 3) * 0.08), kind);
          });
        },
      },
    ];
  },
});

startLoop((dt, time) => {
  autoTimer -= dt;
  if (auto && autoTimer <= 0) {
    autoTimer = 0.55 + Math.random() * 0.7;
    launch(width * (0.15 + Math.random() * 0.7), height * (0.18 + Math.random() * 0.32));
  }
  for (let i = delayed.length - 1; i >= 0; i -= 1) {
    const item = delayed[i]!;
    if (time >= item.at) {
      explode(item.x, item.y, item.kind, item.hue);
      delayed.splice(i, 1);
    }
  }
  for (let i = rockets.length - 1; i >= 0; i -= 1) {
    const rocket = rockets[i]!;
    rocket.x += rocket.vx * dt;
    rocket.y += rocket.vy * dt;
    rocket.vy += gravity * 0.35 * dt;
    pushSpark({
      x: rocket.x,
      y: rocket.y,
      vx: (Math.random() - 0.5) * 20,
      vy: 40,
      life: 0.25,
      max: 0.25,
      hue: 40,
      size: 1.5,
      drag: 1,
      gravity: 0.2,
      trail: [],
      glitter: false,
    });
    if (rocket.y <= rocket.targetY || rocket.vy > -40) {
      explode(rocket.x, rocket.y, rocket.kind, rocket.hue);
      rockets.splice(i, 1);
    }
  }
  for (let i = sparks.length - 1; i >= 0; i -= 1) {
    const spark = sparks[i]!;
    spark.trail.push(spark.x, spark.y);
    const limit = trail * 2;
    if (spark.trail.length > limit) spark.trail.splice(0, spark.trail.length - limit);
    spark.vy += gravity * spark.gravity * dt;
    spark.vx *= Math.exp(-spark.drag * dt);
    spark.vy *= Math.exp(-spark.drag * 0.35 * dt);
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.life -= dt;
    if (spark.life <= 0) sparks.splice(i, 1);
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(0, 0, 10, 0.22)';
  ctx.fillRect(0, 0, width, height);
  for (const star of stars) {
    const alpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(time * 2 + star.p));
    ctx.fillStyle = `rgba(230, 236, 255, ${alpha})`;
    ctx.fillRect(star.x * width, star.y * height, star.s, star.s);
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const spark of sparks) {
    const alpha = Math.max(0, spark.life / spark.max);
    const light = spark.glitter ? 70 + 20 * Math.sin(time * 30 + spark.x) : 62;
    ctx.strokeStyle = hsl(spark.hue, 90, light, alpha * 0.85);
    ctx.lineWidth = spark.size;
    ctx.beginPath();
    const pts = spark.trail;
    if (pts.length >= 4) {
      ctx.moveTo(pts[0]!, pts[1]!);
      for (let p = 2; p < pts.length; p += 2) ctx.lineTo(pts[p]!, pts[p + 1]!);
      ctx.lineTo(spark.x, spark.y);
      ctx.stroke();
    }
    ctx.fillStyle = hsl(spark.hue, 100, 78, alpha);
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, spark.size * (0.7 + alpha), 0, Math.PI * 2);
    ctx.fill();
  }
});
