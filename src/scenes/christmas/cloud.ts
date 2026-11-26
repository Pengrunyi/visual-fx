export const TREE_HEIGHT = 3.25;
export const TREE_RADIUS = 1.42;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ParticleSet {
  tree: Float32Array;
  burst: Float32Array;
  color: Float32Array;
  size: Float32Array;
  seed: Float32Array;
}

export interface Cloud {
  needles: ParticleSet;
  sparks: ParticleSet;
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GOLD: [number, number, number][] = [
  [1, 0.86, 0.48],
  [0.98, 0.72, 0.3],
  [1, 0.94, 0.76],
  [0.9, 0.62, 0.24],
];

const LIGHTS: [number, number, number][] = [
  [1, 0.32, 0.28],
  [0.3, 1, 0.58],
  [0.48, 0.76, 1],
  [1, 0.82, 0.32],
  [1, 0.45, 0.74],
];

/** Layered cone: each tier is wide at its base and pinches toward the next. */
export function treePoint(random: () => number): Vec3 {
  const y01 = random();
  const y = y01 * TREE_HEIGHT;
  const layers = 7;
  const along = y01 * layers;
  const layerT = along - Math.floor(along);
  const segment = 1 - layerT;
  const envelope = (1 - y01) * TREE_RADIUS;
  const radius = envelope * (0.16 + 0.84 * Math.sqrt(random()) * (0.32 + 0.68 * segment));
  const angle = random() * Math.PI * 2 + y01 * 9.2;
  return {
    x: Math.cos(angle) * radius,
    y,
    z: Math.sin(angle) * radius * 0.92,
  };
}

/** A warm cloud centered on the tree, with a brighter outer shell. */
export function burstPoint(random: () => number): Vec3 {
  const shell = random() > 0.62;
  const radius = shell ? 1.35 + random() * 1.55 : random() ** 0.55 * 1.75;
  const theta = random() * Math.PI * 2;
  const phi = Math.acos(2 * random() - 1);
  const sinPhi = Math.sin(phi);
  return {
    x: sinPhi * Math.cos(theta) * radius,
    y: Math.cos(phi) * radius * 0.92 + 1.45,
    z: sinPhi * Math.sin(theta) * radius,
  };
}

export function horizontalRadius(point: Vec3): number {
  return Math.hypot(point.x, point.z);
}

function emptySet(count: number): ParticleSet {
  return {
    tree: new Float32Array(count * 3),
    burst: new Float32Array(count * 3),
    color: new Float32Array(count * 3),
    size: new Float32Array(count),
    seed: new Float32Array(count),
  };
}

function writeParticle(
  set: ParticleSet,
  index: number,
  tree: Vec3,
  burst: Vec3,
  color: [number, number, number],
  size: number,
  seed: number,
): void {
  set.tree[index * 3] = tree.x;
  set.tree[index * 3 + 1] = tree.y;
  set.tree[index * 3 + 2] = tree.z;
  set.burst[index * 3] = burst.x;
  set.burst[index * 3 + 1] = burst.y;
  set.burst[index * 3 + 2] = burst.z;
  set.color[index * 3] = color[0];
  set.color[index * 3 + 1] = color[1];
  set.color[index * 3 + 2] = color[2];
  set.size[index] = size;
  set.seed[index] = seed;
}

export function createCloud(count: number, random: () => number = Math.random): Cloud {
  const safe = Math.max(2, Math.floor(count));
  const sparkCount = Math.max(1, Math.min(safe - 1, Math.round(safe * 0.08)));
  const needleCount = safe - sparkCount;
  const needles = emptySet(needleCount);
  const sparks = emptySet(sparkCount);
  for (let i = 0; i < needleCount; i += 1) {
    const color = GOLD[Math.floor(random() * GOLD.length)] ?? GOLD[0];
    writeParticle(needles, i, treePoint(random), burstPoint(random), color, 0.9 + random() * 1.15, random());
  }
  for (let i = 0; i < sparkCount; i += 1) {
    const y01 = (i + random() * 0.35) / sparkCount;
    const y = Math.min(TREE_HEIGHT, y01 * TREE_HEIGHT);
    const envelope = (1 - y / TREE_HEIGHT) * TREE_RADIUS * 0.98;
    const angle = y01 * Math.PI * 2 * 5.5 + random() * 0.2;
    const tree = { x: Math.cos(angle) * envelope, y, z: Math.sin(angle) * envelope * 0.92 };
    const color = LIGHTS[i % LIGHTS.length] ?? LIGHTS[0];
    writeParticle(sparks, i, tree, burstPoint(random), color, 2.2 + random() * 1.8, random());
  }
  return { needles, sparks };
}

export interface OrnamentAnchor {
  tree: Vec3;
  burst: Vec3;
  color: string;
}

const BAUBLE_COLORS = ['#e23b3b', '#f0c14a', '#2fbe78', '#6aa7ff', '#ff6eb4', '#ffe3a1', '#ff8a32'];

export function ornamentAnchors(count: number, random: () => number = Math.random): OrnamentAnchor[] {
  const safe = Math.max(1, Math.floor(count));
  const anchors: OrnamentAnchor[] = [];
  for (let i = 0; i < safe; i += 1) {
    const y01 = 0.14 + (i / safe) * 0.7;
    const y = y01 * TREE_HEIGHT;
    const envelope = (1 - y01) * TREE_RADIUS * 0.9;
    const angle = i * 2.399 + 0.35;
    anchors.push({
      tree: { x: Math.cos(angle) * envelope, y, z: Math.sin(angle) * envelope * 0.92 },
      burst: burstPoint(random),
      color: BAUBLE_COLORS[i % BAUBLE_COLORS.length] ?? BAUBLE_COLORS[0],
    });
  }
  return anchors;
}
