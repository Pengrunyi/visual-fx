export interface SampleCard {
  canvas: HTMLCanvasElement;
  label: string;
}

const WIDTH = 408;
const HEIGHT = 504;

function board(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d');
  return { canvas, ctx };
}

function backdrop(ctx: CanvasRenderingContext2D, top: string, bottom: string): void {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, top);
  sky.addColorStop(1, bottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(WIDTH * 0.5, HEIGHT * 0.42, 20, WIDTH * 0.5, HEIGHT * 0.48, 230);
  glow.addColorStop(0, 'rgba(255, 214, 140, 0.28)');
  glow.addColorStop(1, 'rgba(255, 214, 140, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function badge(ctx: CanvasRenderingContext2D, caption: string): void {
  ctx.fillStyle = 'rgba(28, 16, 8, 0.72)';
  roundRect(ctx, 22, 22, 92, 36, 18);
  ctx.fill();
  ctx.fillStyle = '#f6e2b0';
  ctx.font = '600 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('示例', 68, 40);
  ctx.fillStyle = '#f3d7a2';
  ctx.font = '600 28px sans-serif';
  ctx.fillText(caption, WIDTH / 2, HEIGHT - 42);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPerson(variant: number): HTMLCanvasElement {
  const { canvas, ctx } = board();
  backdrop(ctx, variant === 0 ? '#4a2c22' : '#3a3148', '#140c0a');
  const cx = WIDTH / 2;
  ctx.fillStyle = variant === 0 ? '#6a3b32' : '#2c3d55';
  ctx.beginPath();
  ctx.ellipse(cx, 430, 150, 92, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = variant === 0 ? '#8d4d3e' : '#3d5570';
  ctx.beginPath();
  ctx.ellipse(cx, 392, 116, 78, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = variant === 0 ? '#f0c2a4' : '#e7b89a';
  ctx.beginPath();
  ctx.ellipse(cx, 246, 78, 92, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = variant === 0 ? '#2a1a14' : '#1c140e';
  ctx.beginPath();
  ctx.ellipse(cx, 214, 84, 62, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = variant === 0 ? '#3a241c' : '#24180f';
  ctx.beginPath();
  ctx.ellipse(cx - 8, 188, 70, 36, -0.2, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#2a211c';
  ctx.beginPath();
  ctx.ellipse(cx - 26, 246, 7, 8, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 28, 246, 7, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6a4638';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx + 2, 286, 16, 0.15, Math.PI - 0.15);
  ctx.stroke();
  if (variant === 1) {
    ctx.fillStyle = '#c4493a';
    ctx.beginPath();
    ctx.moveTo(cx - 70, 330);
    ctx.lineTo(cx + 78, 318);
    ctx.lineTo(cx + 64, 360);
    ctx.lineTo(cx - 78, 368);
    ctx.fill();
  }
  badge(ctx, '人像');
  return canvas;
}

function drawPet(variant: number): HTMLCanvasElement {
  const { canvas, ctx } = board();
  backdrop(ctx, variant === 0 ? '#3d2a18' : '#2a3330', '#120e0c');
  const cx = WIDTH / 2;
  const cy = 268;
  ctx.fillStyle = variant === 0 ? '#d9a15a' : '#efe6d6';
  if (variant === 0) {
    ctx.beginPath();
    ctx.moveTo(cx - 78, 196);
    ctx.lineTo(cx - 112, 92);
    ctx.lineTo(cx - 28, 150);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 78, 196);
    ctx.lineTo(cx + 112, 92);
    ctx.lineTo(cx + 28, 150);
    ctx.fill();
    ctx.fillStyle = '#f2c48a';
    ctx.beginPath();
    ctx.moveTo(cx - 70, 188);
    ctx.lineTo(cx - 92, 118);
    ctx.lineTo(cx - 38, 158);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 70, 188);
    ctx.lineTo(cx + 92, 118);
    ctx.lineTo(cx + 38, 158);
    ctx.fill();
  } else {
    ctx.fillStyle = '#8d5a32';
    ctx.beginPath();
    ctx.ellipse(cx - 108, 210, 36, 70, -0.5, 0, Math.PI * 2);
    ctx.ellipse(cx + 108, 210, 36, 70, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#efe6d6';
  }
  ctx.beginPath();
  ctx.ellipse(cx, cy, 112, 100, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = variant === 0 ? '#f6d7b0' : '#fffaf2';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 28, 64, 52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#24180f';
  ctx.beginPath();
  ctx.ellipse(cx - 36, cy - 8, 10, 14, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 36, cy - 8, 10, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx - 40, cy - 14, 4, 0, Math.PI * 2);
  ctx.arc(cx + 32, cy - 14, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = variant === 0 ? '#e07a5a' : '#1d1a17';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 28, 8, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = variant === 0 ? '#8a5a32' : '#b9ab9a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 18, cy + 34);
  ctx.lineTo(cx - 92, cy + 22);
  ctx.moveTo(cx - 18, cy + 44);
  ctx.lineTo(cx - 88, cy + 52);
  ctx.moveTo(cx + 18, cy + 34);
  ctx.lineTo(cx + 92, cy + 22);
  ctx.moveTo(cx + 18, cy + 44);
  ctx.lineTo(cx + 88, cy + 52);
  ctx.stroke();
  badge(ctx, '宠物');
  return canvas;
}

/** Illustrated stand-ins. They are labeled 示例 so they are not mistaken for photographs. */
export function createSampleCards(): SampleCard[] {
  return [
    { canvas: drawPerson(0), label: '示例人像' },
    { canvas: drawPet(0), label: '示例宠物' },
    { canvas: drawPerson(1), label: '示例人像' },
    { canvas: drawPet(1), label: '示例宠物' },
  ];
}
