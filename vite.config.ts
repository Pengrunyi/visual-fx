import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { findViolationsInDir } from './src/lib/cdnCheck';
import { MILK_FROG_WASM_DIR, MILK_FROG_WASM_FILES } from './src/lib/mediapipePublic';
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

/** Copy tasks-vision wasm next to the milk-frog page so runtime fetches stay same-origin. */
function mediapipeAssets(): Plugin {
  const wasmDir = resolve(__dirname, 'node_modules/@mediapipe/tasks-vision/wasm');
  const serve = (url: string | undefined, res: import('node:http').ServerResponse, next: (error?: unknown) => void) => {
    const path = url?.split('?')[0] ?? '';
    const marker = `/${MILK_FROG_WASM_DIR}/`;
    const at = path.indexOf(marker);
    if (at < 0) return next();
    const name = decodeURIComponent(path.slice(at + marker.length));
    if (!MILK_FROG_WASM_FILES.includes(name as (typeof MILK_FROG_WASM_FILES)[number]) || name.includes('..')) return next();
    const file = join(wasmDir, name);
    if (!existsSync(file)) return next();
    res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8');
    const stream = createReadStream(file);
    stream.on('error', () => {
      if (!res.headersSent) next();
    });
    stream.pipe(res);
  };

  return {
    name: 'mediapipe-local-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => serve(req.url, res, next));
    },
    generateBundle() {
      for (const name of MILK_FROG_WASM_FILES) {
        this.emitFile({
          type: 'asset',
          fileName: `${MILK_FROG_WASM_DIR}/${name}`,
          source: readFileSync(join(wasmDir, name)),
        });
      }
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
  plugins: [stripDependencyUrlComments(), mediapipeAssets(), noExternalCdn()],
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
        milkFrog: resolve(__dirname, 'milk-frog/index.html'),
        me: resolve(__dirname, 'me/index.html'),
        bunny: resolve(__dirname, 'bunny/index.html'),
      },
    },
  },
});
