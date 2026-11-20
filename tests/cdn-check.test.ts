import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findExternalUrls, findViolationsInDir, type TextFile } from '../src/lib/cdnCheck';

function violations(files: TextFile[]) {
  return findExternalUrls(files).map((item) => item.url);
}

describe('zero external CDN check', () => {
  it('allows the SVG namespace and a plain repository anchor', () => {
    expect(violations([
      { path: 'index.html', text: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' },
      { path: 'app.js', text: "document.createElementNS('http://www.w3.org/1999/xhtml','canvas')" },
      { path: 'index.html', text: '<a class="ext" href="https://github.com/Pengrunyi/visual-fx">GitHub</a>' },
      { path: 'index.html', text: '<a href="https://pengrunyi.github.io/visual-fx/">site</a>' },
    ])).toEqual([]);
  });

  it('rejects CDN scripts, fonts, protocol-relative imports, and repo URLs outside anchors', () => {
    const found = violations([
      { path: 'a.html', text: '<script src="https://cdn.jsdelivr.net/npm/three"></script>' },
      { path: 'b.html', text: '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/x.css">' },
      { path: 'c.css', text: '@import url("https://fonts.googleapis.com/css2?family=A");' },
      { path: 'd.js', text: 'import("https://esm.sh/three")' },
      { path: 'e.js', text: 'const u = "https://unpkg.com/three"' },
      { path: 'f.js', text: 'load("//fonts.gstatic.com/s/a.woff2")' },
      { path: 'g.js', text: 'const repo = "https://github.com/Pengrunyi/visual-fx"' },
      { path: 'h.html', text: '<script src="https://github.com/Pengrunyi/visual-fx"></script>' },
    ]);
    expect(found.length).toBe(8);
    expect(found.some((url) => url.includes('jsdelivr'))).toBe(true);
    expect(found.some((url) => url.includes('fonts.googleapis'))).toBe(true);
    expect(found.some((url) => url.includes('esm.sh'))).toBe(true);
  });

  it('scans html, js, and css inside a directory tree', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vfx-dist-'));
    try {
      mkdirSync(join(dir, 'assets'));
      writeFileSync(join(dir, 'index.html'), '<a href="https://github.com/Pengrunyi/visual-fx/">repo</a>');
      writeFileSync(join(dir, 'assets', 'app.js'), 'const local = "/visual-fx/fluid/";');
      writeFileSync(join(dir, 'assets', 'app.css'), 'body{background:#000}');
      writeFileSync(join(dir, 'icon.svg'), '<image href="https://cdn.jsdelivr.net/x.png"/>');
      expect(findViolationsInDir(dir)).toEqual([]);
      writeFileSync(join(dir, 'assets', 'bad.js'), 'fetch("https://unpkg.com/three")');
      expect(findViolationsInDir(dir).length).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
