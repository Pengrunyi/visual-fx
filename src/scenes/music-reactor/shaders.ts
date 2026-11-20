export const PLASMA_FRAG = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform vec2 uAngle;
varying vec2 vUv;

float map(vec3 p) {
  float radius = 1.05 + uBass * 0.62;
  float noise = sin(p.x * 3.4 + uTime) * sin(p.y * 3.1 - uTime * 1.3) * sin(p.z * 2.8 + uTime * 0.8);
  noise += sin(length(p.xy) * 8.0 - uTime * 2.0) * uTreble;
  return length(p) - radius - noise * (0.18 + uMid * 0.32);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float yaw = uAngle.x;
  float pitch = uAngle.y;
  vec3 ro = vec3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)) * 3.3;
  vec3 forward = normalize(-ro);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);
  vec3 rd = normalize(forward + uv.x * right + uv.y * up);
  float t = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 48; i++) {
    vec3 pos = ro + rd * t;
    float d = map(pos);
    if (d < 0.004) { hit = 1.0; break; }
    t += d * 0.85;
    if (t > 8.0) break;
  }
  vec3 color = vec3(0.01, 0.0, 0.03);
  if (hit > 0.5) {
    vec3 pos = ro + rd * t;
    float e = 0.02;
    vec3 n = normalize(vec3(
      map(pos + vec3(e, 0.0, 0.0)) - map(pos - vec3(e, 0.0, 0.0)),
      map(pos + vec3(0.0, e, 0.0)) - map(pos - vec3(0.0, e, 0.0)),
      map(pos + vec3(0.0, 0.0, e)) - map(pos - vec3(0.0, 0.0, e))
    ));
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 2.0);
    vec3 plasma = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.25, 0.5) + uTime * 0.05 + n.y + uMid));
    color = plasma * (0.25 + fres * (0.8 + uBass)) + vec3(1.0, 0.4, 0.8) * fres * uTreble;
    color += vec3(0.3, 0.6, 1.0) * uBass * pow(fres, 3.0);
  }
  color += vec3(0.15, 0.02, 0.2) * uBass * exp(-length(uv) * 2.0);
  gl_FragColor = vec4(color, 1.0);
}
`;

export const TUNNEL_FRAG = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform vec2 uAngle;
varying vec2 vUv;
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float c = cos(uAngle.x);
  float s = sin(uAngle.x);
  uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
  uv *= 1.0 + uBass * 0.45;
  float radius = length(uv);
  float angle = atan(uv.y, uv.x) + uAngle.y + uTime * (0.35 + uMid * 0.8);
  float depth = 1.0 / max(radius, 0.02) + uTime * (1.3 + uBass * 3.5);
  float ribs = abs(sin(depth * 7.0 + sin(angle * 6.0)));
  float rings = abs(sin(angle * (6.0 + uTreble * 8.0)));
  float glow = pow(ribs, 10.0) + pow(rings, 12.0) * 0.6;
  glow += pow(0.12 / max(radius, 0.01), 1.35) * (0.35 + uBass);
  vec3 color = mix(vec3(0.15, 0.0, 0.35), vec3(0.0, 0.95, 0.85), ribs);
  color = mix(color, vec3(1.0, 0.2, 0.6), rings * uMid);
  color *= glow;
  color *= smoothstep(1.4, 0.1, radius);
  gl_FragColor = vec4(color, 1.0);
}
`;

export const GRID_FRAG = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform vec2 uAngle;
varying vec2 vUv;
void main() {
  vec2 uv = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;
  uv.x += uAngle.x * 0.35;
  float horizon = 0.12 + uAngle.y * 0.2 + sin(uTime) * 0.02;
  vec3 color = mix(vec3(0.02, 0.0, 0.06), vec3(0.12, 0.0, 0.18), smoothstep(-0.2, horizon, uv.y));
  float sun = length(uv - vec2(0.0, horizon + 0.18));
  color += vec3(1.0, 0.25, 0.55) * pow(0.08 / max(sun, 0.001), 1.45) * (0.55 + uBass * 1.4);
  if (uv.y < horizon) {
    float height = horizon - uv.y + 0.08;
    float z = (0.55 + uBass * 0.25) / max(height, 0.02);
    float x = uv.x * z;
    z += uTime * (1.6 + uBass * 3.2);
    float gx = abs(fract(x * 1.2) - 0.5);
    float gz = abs(fract(z * 1.1) - 0.5);
    float grid = smoothstep(0.045, 0.0, gx) + smoothstep(0.045, 0.0, gz);
    float fade = exp(-z * 0.08);
    color += vec3(1.0, 0.15, 0.55) * grid * fade * (0.7 + uMid);
    color += vec3(0.2, 0.6, 1.0) * smoothstep(0.2, 0.0, abs(uv.x)) * fade * uTreble;
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

export const MANDALA_FRAG = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform vec2 uAngle;
varying vec2 vUv;
const float PI = 3.14159265;
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float c = cos(uAngle.x + uTime * 0.05);
  float s = sin(uAngle.x + uTime * 0.05);
  uv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
  float radius = length(uv);
  float angle = atan(uv.y, uv.x) + uAngle.y;
  float slices = 8.0;
  angle = abs(mod(angle, 2.0 * PI / slices) - PI / slices);
  vec2 p = vec2(cos(angle), sin(angle)) * radius;
  float value = sin(p.x * (16.0 + uTreble * 20.0) + uTime) * sin(p.y * 16.0 - uTime * 0.8);
  value += sin(radius * (24.0 + uBass * 30.0) - uTime * (1.5 + uBass * 4.0));
  value += uMid * sin(angle * 20.0 + uTime * 2.0);
  vec3 color = 0.5 + 0.5 * cos(6.2831 * (vec3(0.05, 0.33, 0.62) + value * 0.25 + uMid));
  color *= smoothstep(1.15, 0.15, radius);
  color *= 0.35 + uBass * 0.9 + uTreble * 0.4;
  float ring = exp(-abs(radius - (0.35 + uBass * 0.25)) * 18.0);
  color += vec3(1.0, 0.45, 0.85) * ring;
  gl_FragColor = vec4(color, 1.0);
}
`;
