import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { findViolationsInDir } from './src/lib/cdnCheck';
import { SITE_BASE } from './src/lib/site';

/** Drop full-line URL comments, including ones embedded in GLSL strings. */
function stripUrlCommentLines(code: string): string {
  return code.replace(/^[ \t]*\/\/[^\n]*https?:\/\/[^\n]*$/gm, '');
}

function stripDependencyUrlComments(): Plugin {
  return {
    name: 'strip-dependency-url-comments',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/node_modules/three/')) return null;
      const next = stripUrlCommentLines(code);
      return next === code ? null : { code: next, map: null };
    },
    renderChunk(code) {
      const next = stripUrlCommentLines(code);
      return next === code ? null : { code: next, map: null };
    },
  };
}

function noExternalCdn(): Plugin {
  return {
    name: 'no-external-cdn',
    apply: 'build',
    writeBundle(options) {
      const dir = options.dir ?? resolve(__dirname, 'dist');
      const violations = findViolationsInDir(dir);
      if (violations.length === 0) return;
      const preview = violations
        .slice(0, 24)
        .map((item) => `${item.file}: ${item.url}`)
        .join('\n');
      throw new Error(
        `External network URLs found in dist (${violations.length}):\n${preview}`,
      );
    },
  };
}

export default defineConfig({
  base: SITE_BASE,
  plugins: [stripDependencyUrlComments(), noExternalCdn()],
  build: {
    sourcemap: false,
    target: 'es2022',
    chunkSizeWarningLimit: 800,
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        blackHole: resolve(__dirname, 'black-hole/index.html'),
        fluid: resolve(__dirname, 'fluid/index.html'),
        galaxy: resolve(__dirname, 'galaxy/index.html'),
        aurora: resolve(__dirname, 'aurora/index.html'),
        fireworks: resolve(__dirname, 'fireworks/index.html'),
        christmas: resolve(__dirname, 'christmas/index.html'),
        snowGlobe: resolve(__dirname, 'snow-globe/index.html'),
        musicReactor: resolve(__dirname, 'music-reactor/index.html'),
      },
    },
  },
});
