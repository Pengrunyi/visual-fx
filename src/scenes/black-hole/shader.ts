import { HASH_GLSL } from '../../lib/quad';

export function blackHoleFragment(steps: number): string {
  return `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uAngle;
uniform float uZoom;
uniform float uDoppler;
uniform float uFlareAng[4];
uniform float uFlareRad[4];
uniform float uFlareAge[4];
varying vec2 vUv;

${HASH_GLSL}

const float RS = 0.55;

vec3 starfield(vec3 dir) {
  float u = atan(dir.z, dir.x);
  float v = dir.y;
  vec2 cell = floor(vec2(u * 46.0, asin(clamp(v, -1.0, 1.0)) * 38.0));
  float h = hash12(cell);
  float twinkle = 0.55 + 0.45 * sin(uTime * (0.8 + h * 5.0) + h * 30.0);
  float star = smoothstep(0.988, 0.999, h) * twinkle;
  vec3 tint = mix(vec3(0.62, 0.74, 1.0), vec3(1.0, 0.84, 0.62), hash12(cell + 2.2));
  vec3 col = tint * star * (1.2 + h);
  float band = exp(-pow((dir.y + dir.x * 0.22) * 3.4, 2.0));
  float cloud = noise(vec2(u * 3.0, v * 4.0) + 4.0);
  col += vec3(0.09, 0.11, 0.18) * band * (0.35 + cloud);
  return col;
}

vec3 diskColor(float x) {
  vec3 cool = vec3(0.35, 0.05, 0.015);
  vec3 mid = vec3(1.0, 0.42, 0.08);
  vec3 hot = vec3(1.0, 0.93, 0.78);
  vec3 col = mix(cool, mid, smoothstep(0.0, 0.45, x));
  return mix(col, hot, smoothstep(0.45, 1.0, x));
}

float flareSpot(float ang, float rad, float inertial, float radius, float age) {
  if (age > 7.5) return 0.0;
  float center = ang + uTime * 0.62 / pow(max(rad, 0.7), 1.45);
  float dang = abs(atan(sin(inertial - center), cos(inertial - center)));
  float shear = age * 0.62;
  float width = 0.045 + shear * 0.11;
  float radial = exp(-abs(radius - rad) / (0.045 + shear * 0.16));
  return exp(-dang / width) * radial * exp(-age * 0.32);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - 0.5 * uResolution) / uResolution.y;
  float yaw = uAngle.x;
  float pitch = clamp(uAngle.y, -0.95, 0.95);
  float dist = mix(7.4, 2.35, clamp(uZoom, 0.0, 1.0));
  vec3 ro = vec3(
    sin(yaw) * cos(pitch) * dist,
    sin(pitch) * dist + 0.08,
    cos(yaw) * cos(pitch) * dist
  );
  vec3 forward = normalize(-ro);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);
  vec3 rd = normalize(forward * 1.35 + uv.x * right + uv.y * up);

  vec3 pos = ro;
  vec3 vel = rd;
  vec3 color = vec3(0.0);
  float alpha = 1.0;
  bool captured = false;
  float minR = 40.0;

  for (int i = 0; i < ${steps}; i++) {
    float r = length(pos);
    minR = min(minR, r);
    if (r < RS * 0.5) {
      captured = true;
      break;
    }
    if (r > 22.0 && i > 12) break;

    float dt = 0.055 * clamp(r, 0.18, 2.4);
    vec3 L = cross(pos, vel);
    float h2 = dot(L, L);
    vec3 acc = -1.5 * RS * h2 * pos / pow(max(r, 0.28), 5.0);
    float cap = 12.0 / dt;
    float am = length(acc);
    if (am > cap) acc *= cap / am;
    vec3 prev = pos;
    vel += acc * dt;
    pos += vel * dt;

    float radCyl = length(pos.xz);
    float inner = RS * 2.55;
    float outer = 5.4;
    if (radCyl > inner && radCyl < outer) {
      float thick = 0.045 + 0.012 * radCyl;
      float height = abs(pos.y);
      float slab = exp(-height * height / (thick * thick));
      float x = clamp((radCyl - inner) / (outer - inner), 0.0, 1.0);
      float temp = pow(1.0 - x, 0.72);
      vec3 glow = diskColor(temp);
      float inertial = atan(pos.z, pos.x);
      float spin = uTime * 0.62 / pow(max(radCyl, 0.7), 1.45);
      float spiral = 0.62 + 0.38 * sin(inertial * 3.0 + spin * 2.0 - 6.0 / radCyl);
      float grain = 0.75 + 0.25 * noise(vec2(inertial * 2.4 + uTime * 0.15, radCyl * 3.2));
      glow *= temp * spiral * grain;
      color += glow * slab * dt * 0.55 * alpha;
      alpha *= clamp(1.0 - slab * dt * 0.35, 0.35, 1.0);
    }

    if (prev.y * pos.y < 0.0) {
      float t = abs(prev.y) / (abs(prev.y) + abs(pos.y) + 1e-5);
      vec3 hit = mix(prev, pos, t);
      float rad = length(hit.xz);
      if (rad > inner && rad < outer) {
        float x = clamp((rad - inner) / (outer - inner), 0.0, 1.0);
        float temp = pow(1.0 - x, 0.68);
        float inertial = atan(hit.z, hit.x);
        float spin = uTime * 0.62 / pow(max(rad, 0.7), 1.45);
        float spiral = 0.6 + 0.4 * sin((inertial + spin) * 4.0 - 7.5 / rad);
        float rings = 0.78 + 0.22 * sin(rad * 26.0 - uTime * 1.6);
        float grain = 0.65 + 0.55 * noise(vec2(inertial * 3.0 + spin, rad * 4.0));
        vec3 dc = diskColor(temp) * (0.55 + temp * 1.5) * spiral * rings * grain;

        vec3 tangent = normalize(vec3(-hit.z, 0.0, hit.x));
        float beta = clamp(uDoppler * 0.72 * sqrt(RS / max(rad, RS)), 0.0, 0.82);
        float gamma = inversesqrt(max(1.0 - beta * beta, 0.05));
        vec3 toCamera = normalize(-vel);
        float mu = dot(tangent, toCamera);
        float dop = 1.0 / (gamma * max(0.12, 1.0 - beta * mu));
        dop = mix(1.0, dop, clamp(uDoppler, 0.0, 1.0));
        dc *= pow(dop, 3.0);
        dc = mix(dc * vec3(1.0, 0.45, 0.18), dc * vec3(0.78, 0.9, 1.0), smoothstep(0.45, 1.35, dop));
        dc *= smoothstep(inner, inner + 0.28, rad);
        dc *= smoothstep(outer, outer - 0.45, rad);

        float flare = 0.0;
        flare += flareSpot(uFlareAng[0], uFlareRad[0], inertial, rad, uFlareAge[0]);
        flare += flareSpot(uFlareAng[1], uFlareRad[1], inertial, rad, uFlareAge[1]);
        flare += flareSpot(uFlareAng[2], uFlareRad[2], inertial, rad, uFlareAge[2]);
        flare += flareSpot(uFlareAng[3], uFlareRad[3], inertial, rad, uFlareAge[3]);
        dc += vec3(1.0, 0.9, 0.62) * flare * 4.5;

        float cover = clamp(0.35 + temp * 0.7, 0.0, 0.92) * alpha;
        color += dc * cover;
        alpha *= 1.0 - cover * 0.82;
      }
    }
  }

  if (!captured) {
    float photon = RS * 1.5;
    float ring = exp(-pow((minR - photon) / 0.055, 2.0));
    color += vec3(1.0, 0.9, 0.68) * ring * 1.15 * alpha;
    color += starfield(normalize(vel)) * alpha;
  }

  vec2 q = frag / uResolution - 0.5;
  color *= 1.0 - dot(q, q) * 0.85;
  color = color / (1.0 + color * 0.65);
  color = pow(max(color, vec3(0.0)), vec3(0.92));
  gl_FragColor = vec4(color, 1.0);
}
`;
}
