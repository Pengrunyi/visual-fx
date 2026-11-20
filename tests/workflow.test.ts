import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('GitHub Pages workflow', () => {
  it('tests, builds, and deploys dist on main', () => {
    const yaml = readFileSync('.github/workflows/pages.yml', 'utf8');
    expect(yaml).toContain('branches: [main]');
    expect(yaml).toContain('workflow_dispatch:');
    expect(yaml).toContain('npm ci');
    expect(yaml).toContain('npm test');
    expect(yaml).toContain('npm run build');
    expect(yaml).toContain('actions/deploy-pages@v4');
    expect(yaml).toContain('path: dist');
  });
});
