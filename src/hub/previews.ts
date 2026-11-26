export type PreviewDraw = (ctx: CanvasRenderingContext2D, time: number, w: number, h: number) => void;

export const previews: Record<string, PreviewDraw> = {
  attention: (ctx, time, w, h) => {
    ctx.fillStyle = '#070b14';
    ctx.fillRect(0, 0, w, h);
    const n = 6;
    const orbs = Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      return {
        x: w * (0.14 + t * 0.72),
        y: h * 0.58 - Math.sin(t * Math.PI) * h * 0.16 + Math.sin(time * 1.4 + i) * 3,
      };
    });
    const query = orbs[1];
    const colors = ['#7af0ff', '#ffb15a', '#ff6b9a', '#c4b5fd'];
    ctx.globalCompositeOperation = 'lighter';
    orbs.forEach((orb, index) => {
      if (index === 1) return;
      const weight = index === 4 ? 0.72 : index === 0 || index === 2 ? 0.38 : 0.12;
      colors.forEach((color, head) => {
        const bend = 18 + head * 10 + weight * 16;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.18 + weight * (head === index % 4 ? 0.7 : 0.15);
        ctx.lineWidth = 1 + weight * (head === index % 4 ? 5 : 1.5);
        ctx.beginPath();
        ctx.moveTo(query.x, query.y);
        ctx.quadraticCurveTo((query.x + orb.x) / 2, Math.min(query.y, orb.y) - bend, orb.x, orb.y);
        ctx.stroke();
      });
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    orbs.forEach((orb, index) => {
      const radius = index === 1 ? 9 : 6;
      const glow = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, radius * 2.4);
      glow.addColorStop(0, 'rgba(255,255,255,0.95)');
      glow.addColorStop(1, 'rgba(122,240,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, radius * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = index === 1 ? '#e9fbff' : '#c5d4ea';
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
  },
  'black-hole': (ctx, time, w, h) => {
    ctx.fillStyle = '#05040a';
    ctx.fillRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 0.52;
    const disk = ctx.createRadialGradient(cx, cy, 8, cx, cy, w * 0.42);
    disk.addColorStop(0, 'rgba(0,0,0,0)');
    disk.addColorStop(0.25, 'rgba(255, 170, 70, 0.15)');
    disk.addColorStop(0.45, 'rgba(255, 90, 20, 0.85)');
    disk.addColorStop(0.7, 'rgba(120, 20, 0, 0.4)');
    disk.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = disk;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.42, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 220, 170, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 24, 0, Math.PI * 2);
    ctx.stroke();
    const a = time * 1.4;
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * w * 0.28, cy + Math.sin(a) * h * 0.1, 3.5, 0, Math.PI * 2);
    ctx.fill();
  },
  fluid: (ctx, time, w, h) => {
    ctx.fillStyle = '#04040c';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i += 1) {
      const x = w * (0.5 + Math.sin(time * 0.7 + i) * 0.32);
      const y = h * (0.5 + Math.cos(time * 0.9 + i * 1.3) * 0.28);
      const radius = 30 + Math.sin(time * 2 + i) * 10;
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      const hue = (i * 48 + time * 40) % 360;
      g.addColorStop(0, `hsla(${hue} 100% 60% / 0.85)`);
      g.addColorStop(1, `hsla(${hue} 100% 50% / 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  galaxy: (ctx, time, w, h) => {
    ctx.fillStyle = '#050714';
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    for (let i = 0; i < 280; i += 1) {
      const arm = i % 4;
      const radius = (i / 280) * w * 0.42;
      const angle = arm * 1.57 + radius * 0.04 + time * 0.35;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius * 0.55;
      ctx.fillStyle = i % 11 === 0 ? '#ff7ad9' : '#9ecbff';
      ctx.fillRect(x, y, 1.6, 1.6);
    }
  },
  aurora: (ctx, time, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#071425');
    sky.addColorStop(1, '#02040a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(0, h * 0.7);
      for (let x = 0; x <= w; x += 8) {
        const y = h * (0.32 + i * 0.06) + Math.sin(x * 0.02 + time + i) * 18;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fillStyle = `hsla(${140 + i * 20} 90% 60% / ${0.18 - i * 0.04})`;
      ctx.fill();
    }
    ctx.fillStyle = '#0c1218';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.78);
    ctx.lineTo(w * 0.3, h * 0.62);
    ctx.lineTo(w * 0.55, h * 0.74);
    ctx.lineTo(w, h * 0.58);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();
  },
  fireworks: (ctx, time, w, h) => {
    ctx.fillStyle = 'rgba(0, 0, 12, 0.35)';
    ctx.fillRect(0, 0, w, h);
    const burst = (time * 0.6) % 1;
    const cx = w * (0.3 + 0.4 * ((Math.floor(time * 0.6) % 3) / 2));
    const cy = h * 0.38;
    for (let i = 0; i < 28; i += 1) {
      const a = (i / 28) * Math.PI * 2;
      const r = burst * 60;
      ctx.fillStyle = `hsla(${(i * 18) % 360} 90% 65% / ${1 - burst})`;
      ctx.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2, 2);
    }
  },
  christmas: (ctx, time, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#1a0e08');
    sky.addColorStop(1, '#070402');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w / 2, h * 0.48, 8, w / 2, h * 0.5, w * 0.34);
    glow.addColorStop(0, 'rgba(255, 196, 96, 0.28)');
    glow.addColorStop(1, 'rgba(255, 196, 96, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    for (let i = 0; i < 110; i += 1) {
      const y01 = i / 110;
      const y = h * 0.84 - y01 * h * 0.62;
      const layer = (y01 * 6) % 1;
      const spread = (1 - y01) * w * 0.22 * (0.35 + 0.65 * (1 - layer));
      const x = cx + Math.sin(i * 1.7 + time * 0.6) * spread;
      ctx.fillStyle = i % 8 === 0 ? '#ff5a5a' : i % 5 === 0 ? '#7dffb3' : '#f0c36a';
      ctx.fillRect(x, y, i % 8 === 0 ? 3 : 2, i % 8 === 0 ? 3 : 2);
    }
    ctx.fillStyle = '#fff1c2';
    ctx.beginPath();
    ctx.arc(cx, h * 0.16, 5 + Math.sin(time * 3) * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ff7a18';
    ctx.lineWidth = 3;
    const bob = Math.sin(time * 1.4) * 4;
    ctx.strokeRect(w * 0.68, h * 0.34 + bob, 28, 36);
    ctx.strokeRect(w * 0.22, h * 0.42 - bob, 24, 32);
  },
  'snow-globe': (ctx, time, w, h) => {
    ctx.fillStyle = '#0b1018';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5a371f';
    ctx.fillRect(w * 0.28, h * 0.72, w * 0.44, h * 0.12);
    ctx.beginPath();
    ctx.arc(w / 2, h * 0.46, w * 0.24, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(210, 230, 255, 0.7)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = 'rgba(180, 210, 255, 0.08)';
    ctx.fill();
    for (let i = 0; i < 18; i += 1) {
      const a = time * 0.8 + i;
      const x = w / 2 + Math.cos(a) * 28;
      const y = h * 0.42 + ((i * 17 + time * 30) % 70);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, y, 2, 2);
    }
  },
  'music-reactor': (ctx, time, w, h) => {
    ctx.fillStyle = '#090014';
    ctx.fillRect(0, 0, w, h);
    const bars = 24;
    for (let i = 0; i < bars; i += 1) {
      const energy = 0.25 + 0.75 * Math.abs(Math.sin(time * 3 + i * 0.45));
      const bh = energy * h * 0.62;
      ctx.fillStyle = `hsl(${280 + i * 4} 90% 62%)`;
      const bw = w / bars - 3;
      ctx.fillRect(8 + i * (w / bars), h * 0.78 - bh, bw, bh);
    }
  },
  'milk-frog': (ctx, time, w, h) => {
    ctx.fillStyle = '#102418';
    ctx.fillRect(0, 0, w, h);
    const bob = Math.sin(time * 2.2) * 5;
    const cx = w * 0.52;
    const cy = h * 0.56 + bob;
    ctx.fillStyle = '#2ea24e';
    ctx.beginPath();
    ctx.ellipse(cx, h * 0.84, w * 0.22, h * 0.055, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.15, h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff3d4';
    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.04, w * 0.08, h * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fffdf8';
    ctx.beginPath();
    ctx.arc(cx - w * 0.055, cy - h * 0.07, 16, 0, Math.PI * 2);
    ctx.arc(cx + w * 0.055, cy - h * 0.07, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#24180f';
    ctx.beginPath();
    ctx.arc(cx - w * 0.04, cy - h * 0.05, 6, 0, Math.PI * 2);
    ctx.arc(cx + w * 0.07, cy - h * 0.05, 6, 0, Math.PI * 2);
    ctx.fill();
    const wave = Math.sin(time * 7);
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx + w * 0.12, cy);
    ctx.quadraticCurveTo(cx + w * 0.2, cy - 20 - wave * 26, cx + w * 0.26, cy - 8 - wave * 36);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.12, cy);
    ctx.quadraticCurveTo(cx - w * 0.2, cy + 10 + wave * 18, cx - w * 0.24, cy + 28);
    ctx.stroke();
  },
  me: (ctx, time, w, h) => {
    ctx.fillStyle = '#10141c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.9, w * 0.11, h * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
    const photo = portrait('me');
    if (photo?.complete && photo.naturalWidth > 0) {
      const bob = Math.sin(time * 2.1) * 3;
      const ih = h * 0.98;
      const iw = ih * (photo.naturalWidth / photo.naturalHeight);
      ctx.drawImage(photo, (w - iw) / 2, h - ih + 6 + bob, iw, ih);
      return;
    }
    ctx.fillStyle = '#1b1f28';
    ctx.fillRect(w * 0.42, h * 0.28, w * 0.16, h * 0.62);
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.22, h * 0.1, 0, Math.PI * 2);
    ctx.fill();
  },
  bunny: (ctx, time, w, h) => {
    ctx.fillStyle = '#16141c';
    ctx.fillRect(0, 0, w, h);
    const photo = portrait('bunny');
    if (photo?.complete && photo.naturalWidth > 0) {
      const bob = Math.sin(time * 2.1) * 2;
      const iw = w * 0.72;
      const ih = iw * (photo.naturalHeight / photo.naturalWidth);
      ctx.drawImage(photo, (w - iw) / 2, h - ih + bob, iw, ih);
      return;
    }
    ctx.fillStyle = '#d7c4ea';
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.22, 18, 28, -0.4, 0, Math.PI * 2);
    ctx.ellipse(w * 0.62, h * 0.2, 18, 28, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f3d7e6';
    ctx.beginPath();
    ctx.arc(w * 0.55, h * 0.42, 28, 0, Math.PI * 2);
    ctx.fill();
  },
};

const portraits = new Map<string, HTMLImageElement>();

function portrait(folder: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  let photo = portraits.get(folder);
  if (!photo) {
    photo = new Image();
    photo.src = `${import.meta.env.BASE_URL}${folder}/person.webp`;
    portraits.set(folder, photo);
  }
  return photo;
}
