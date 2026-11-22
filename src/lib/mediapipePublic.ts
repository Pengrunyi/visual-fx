/** Same-origin MediaPipe assets shared by the milk-frog and /me/ pages. No runtime CDN. */
export const MILK_FROG_WASM_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
] as const;

/** Path under the Vite base, served from `dist/milk-frog/wasm/`. */
export const MILK_FROG_WASM_DIR = 'milk-frog/wasm';

/** Committed float16 hand landmarker, copied from `public/` into dist. */
export const MILK_FROG_MODEL = 'milk-frog/hand_landmarker.task';
