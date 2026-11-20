export const SPLAT_FRAG = `
precision highp float;
uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec3 uColor;
uniform float uRadius;
varying vec2 vUv;
void main() {
  vec4 base = texture2D(uTarget, vUv);
  vec2 d = vUv - uPoint;
  float splat = exp(-dot(d, d) / max(uRadius, 1e-6));
  gl_FragColor = base + vec4(uColor * splat, 0.0);
}
`;

export const ADVECT_FRAG = `
precision highp float;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform float uDt;
uniform float uDissipation;
varying vec2 vUv;
void main() {
  vec2 vel = texture2D(uVelocity, vUv).xy;
  vec2 coord = clamp(vUv - uDt * vel, vec2(0.001), vec2(0.999));
  vec4 value = texture2D(uSource, coord);
  float decay = 1.0 / (1.0 + uDissipation * uDt);
  gl_FragColor = value * decay;
}
`;

export const CURL_FRAG = `
precision highp float;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  float L = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
  float R = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
  float B = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
  float curl = 0.5 * ((R - L) - (T - B));
  gl_FragColor = vec4(curl, 0.0, 0.0, 1.0);
}
`;

export const VORTICITY_FRAG = `
precision highp float;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexel;
uniform float uDt;
uniform float uVorticity;
varying vec2 vUv;
void main() {
  float c = texture2D(uCurl, vUv).x;
  float cL = texture2D(uCurl, vUv - vec2(uTexel.x, 0.0)).x;
  float cR = texture2D(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
  float cB = texture2D(uCurl, vUv - vec2(0.0, uTexel.y)).x;
  float cT = texture2D(uCurl, vUv + vec2(0.0, uTexel.y)).x;
  vec2 grad = 0.5 * vec2(cR - cL, cT - cB);
  vec2 force = uVorticity * vec2(grad.y, -grad.x) * c / (length(grad) + 1e-5);
  vec2 vel = texture2D(uVelocity, vUv).xy + force * uDt;
  gl_FragColor = vec4(vel, 0.0, 1.0);
}
`;

export const DIVERGENCE_FRAG = `
precision highp float;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  float L = texture2D(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  float T = texture2D(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
  float div = 0.5 * ((R - L) + (T - B));
  gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
`;

export const JACOBI_FRAG = `
precision highp float;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  float L = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float div = texture2D(uDivergence, vUv).x;
  float pressure = (L + R + B + T - div) * 0.25;
  gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`;

export const GRADIENT_FRAG = `
precision highp float;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  float L = texture2D(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture2D(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture2D(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  vec2 vel = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B) * 0.5;
  gl_FragColor = vec4(vel, 0.0, 1.0);
}
`;

export const BLOOM_FRAG = `
precision highp float;
uniform sampler2D uDye;
varying vec2 vUv;
void main() {
  vec3 color = texture2D(uDye, vUv).rgb;
  float luma = max(color.r, max(color.g, color.b));
  gl_FragColor = vec4(color * smoothstep(0.25, 0.9, luma), 1.0);
}
`;

export const BLUR_FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uDirection;
varying vec2 vUv;
void main() {
  vec3 sum = texture2D(uTex, vUv).rgb * 0.227027;
  sum += texture2D(uTex, vUv + uDirection * 1.384615).rgb * 0.316216;
  sum += texture2D(uTex, vUv - uDirection * 1.384615).rgb * 0.316216;
  sum += texture2D(uTex, vUv + uDirection * 3.230769).rgb * 0.070270;
  sum += texture2D(uTex, vUv - uDirection * 3.230769).rgb * 0.070270;
  gl_FragColor = vec4(sum, 1.0);
}
`;

export const DISPLAY_FRAG = `
precision highp float;
uniform sampler2D uDye;
uniform sampler2D uBloom;
uniform float uBloomStrength;
varying vec2 vUv;
void main() {
  vec3 dye = texture2D(uDye, vUv).rgb;
  vec3 bloom = texture2D(uBloom, vUv).rgb;
  vec3 color = dye + bloom * uBloomStrength;
  color = 1.0 - exp(-color * 1.45);
  float vignette = smoothstep(1.05, 0.2, length(vUv - 0.5));
  color *= mix(0.55, 1.0, vignette);
  gl_FragColor = vec4(color, 1.0);
}
`;
