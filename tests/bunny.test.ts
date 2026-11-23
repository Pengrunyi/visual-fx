import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { eraseWeight, headBox, type CutoutLayout } from '../src/scenes/portrait/personMotion';

const layout = JSON.parse(readFileSync('public/bunny/layout.json', 'utf8')) as CutoutLayout;

function imageSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP' && buf.toString('ascii', 12, 16) === 'VP8X') {
    return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG' && buf.toString('ascii', 12, 16) === 'IHDR') {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  throw new Error(`unsupported image ${path}`);
}

describe('bunny photo placement', () => {
  it('reads public/bunny/layout.json and matches the cutout files', () => {
    const person = imageSize('public/bunny/person.webp');
    const head = imageSize('public/bunny/head.png');
    expect(person).toEqual(layout.person);
    expect(head).toEqual({ width: layout.head.w, height: layout.head.h });
    expect(layout.person.width).toBeGreaterThan(layout.person.height * 0.6);
    expect(layout.head.y).toBe(0);
    expect(layout.head.x + layout.head.w).toBeLessThanOrEqual(layout.person.width);
    expect(layout.head.y + layout.head.h).toBeLessThanOrEqual(layout.person.height);
    expect(layout.neck_pivot.y).toBeGreaterThan(layout.head.y);
    expect(layout.neck_pivot.y).toBeLessThan(layout.head.y + layout.head.h * 0.75);

    const box = headBox(layout);
    expect(box.left).toBeCloseTo(layout.head.x / layout.person.width, 6);
    expect(box.top).toBeCloseTo(layout.head.y / layout.person.height, 6);
    expect(box.width).toBeCloseTo(layout.head.w / layout.person.width, 6);
    expect(box.height).toBeCloseTo(layout.head.h / layout.person.height, 6);
    expect(box.originX).toBeCloseTo((layout.neck_pivot.x - layout.head.x) / layout.head.w, 6);
    expect(box.originY).toBeCloseTo((layout.neck_pivot.y - layout.head.y) / layout.head.h, 6);
    const css = readFileSync('src/scenes/bunny/bunny.css', 'utf8');
    expect(css).toContain(`aspect-ratio: ${layout.person.width} / ${layout.person.height}`);
    expect(css).toContain('stage-fade');
  });

  it('keeps the half-body page on the shared gesture implementation', () => {
    const main = readFileSync('src/scenes/bunny/main.ts', 'utf8');
    const html = readFileSync('bunny/index.html', 'utf8');
    expect(main).toContain("folder: 'bunny'");
    expect(main).toContain("framing: 'half'");
    expect(main).toContain('mountGesturePortrait');
    expect(main).toContain("theme: 'pastel'");
    expect(readFileSync('src/scenes/me/main.ts', 'utf8')).not.toContain('pastel');
    expect(readFileSync('src/scenes/bunny/bunny.css', 'utf8')).toContain('#fff6ee');
    expect(readFileSync('src/scenes/me/me.css', 'utf8')).not.toContain('pastel-stage');
    expect(html).toContain('用手势，让它做个反应');
    expect(html).toContain('src="/src/scenes/bunny/main.ts"');
    expect(html).not.toMatch(/cdn\.|googleapis|jsdelivr|unpkg|esm\.sh/i);
    const pivotY = layout.neck_pivot.y - layout.head.y;
    expect(eraseWeight(1, 40, pivotY + 80, 40, pivotY)).toBe(0);
  });
});
