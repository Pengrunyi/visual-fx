import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { freshSlugs, joinBase, scenes } from '../src/lib/scenes';
import { SITE_BASE } from '../src/lib/site';

const SLUGS = [
  'attention',
  'bunny',
  'me',
  'milk-frog',
  'black-hole',
  'fluid',
  'galaxy',
  'aurora',
  'fireworks',
  'christmas',
  'snow-globe',
  'music-reactor',
];

describe('scene registry', () => {
  it('lists twelve stable routes', () => {
    expect(scenes.map((scene) => scene.slug)).toEqual(SLUGS);
    expect(scenes[0]).toMatchObject({
      slug: 'attention',
      route: '/attention/',
      titleZh: '注意力实验室',
      titleEn: 'Attention Lab',
      pageTitle: '注意力实验室 · Attention Lab',
    });
    expect(freshSlugs.has('attention')).toBe(true);
    expect(new Set(scenes.map((scene) => scene.route)).size).toBe(12);
    expect(new Set(scenes.map((scene) => scene.titleZh)).size).toBe(12);
    expect(new Set(scenes.map((scene) => scene.pageTitle)).size).toBe(12);
    scenes.forEach((scene) => {
      expect(scene.route).toBe(`/${scene.slug}/`);
      expect(scene.pageTitle.startsWith(scene.titleZh)).toBe(true);
      expect(scene.description.length).toBeGreaterThan(12);
    });
  });

  it('joins the GitHub Pages base without duplicate slashes', () => {
    expect(SITE_BASE).toBe('/visual-fx/');
    expect(joinBase(SITE_BASE, '/black-hole/')).toBe('/visual-fx/black-hole/');
    expect(joinBase('/visual-fx', 'fluid/')).toBe('/visual-fx/fluid/');
  });

  it('keeps each standalone page self-contained and localized', () => {
    const viewport = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    scenes.forEach((scene) => {
      const html = readFileSync(`${scene.slug}/index.html`, 'utf8');
      expect(html).toContain(`<title>${scene.pageTitle}</title>`);
      expect(html).toContain(`content="${scene.description}"`);
      expect(html).toContain(viewport);
      expect(html).toContain(`src="/src/scenes/${scene.slug}/main.ts"`);
      expect(html).not.toMatch(/cdn\.|googleapis|jsdelivr|unpkg|esm\.sh/i);
    });
    const hub = readFileSync('index.html', 'utf8');
    expect(hub).toContain('视觉特效合集');
    expect(hub).toContain('href="https://github.com/Pengrunyi/visual-fx"');
  });
});
