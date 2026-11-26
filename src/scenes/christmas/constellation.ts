export interface StarNode {
  x: number;
  y: number;
  kind: 'apex' | 'outline' | 'inner';
}

export interface ConstellationEdge {
  a: number;
  b: number;
  tone: 'silver' | 'gold';
}

export interface Constellation {
  nodes: StarNode[];
  edges: ConstellationEdge[];
}

export interface SkyStar {
  x: number;
  y: number;
  radius: number;
  phase: number;
  warm: boolean;
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

export interface SnowFlake {
  x: number;
  y: number;
  speed: number;
  drift: number;
  size: number;
}

function node(x: number, y: number, kind: StarNode['kind']): StarNode {
  return { x, y, kind };
}

/**
 * A layered triangular tree: sloping sides, branch shelves, a spine, and a trunk.
 * Coordinates are unit space, y up, apex at the top.
 */
export function createConstellation(): Constellation {
  const nodes: StarNode[] = [
    node(0, 1, 'apex'),
    node(-0.09, 0.9, 'outline'),
    node(-0.17, 0.78, 'outline'),
    node(-0.27, 0.64, 'outline'),
    node(-0.37, 0.48, 'outline'),
    node(-0.47, 0.32, 'outline'),
    node(-0.56, 0.16, 'outline'),
    node(0.09, 0.9, 'outline'),
    node(0.17, 0.78, 'outline'),
    node(0.27, 0.64, 'outline'),
    node(0.37, 0.48, 'outline'),
    node(0.47, 0.32, 'outline'),
    node(0.56, 0.16, 'outline'),
    node(0, 0.84, 'inner'),
    node(0, 0.68, 'inner'),
    node(0, 0.5, 'inner'),
    node(0, 0.32, 'inner'),
    node(0, 0.16, 'inner'),
    node(-0.1, 0.72, 'inner'),
    node(0.1, 0.72, 'inner'),
    node(-0.18, 0.54, 'inner'),
    node(0.18, 0.54, 'inner'),
    node(-0.26, 0.36, 'inner'),
    node(0.26, 0.36, 'inner'),
    node(-0.05, 0.08, 'inner'),
    node(0.05, 0.08, 'inner'),
    node(-0.045, -0.02, 'inner'),
    node(0.045, -0.02, 'inner'),
  ];
  const edges: ConstellationEdge[] = [];
  const link = (a: number, b: number, tone: 'silver' | 'gold' = 'silver') => {
    edges.push({ a, b, tone });
  };
  for (let i = 0; i < 6; i += 1) link(i, i + 1);
  link(0, 7);
  for (let i = 7; i < 12; i += 1) link(i, i + 1);
  for (let i = 13; i < 17; i += 1) link(i, i + 1, 'gold');
  link(1, 13, 'gold');
  link(7, 13, 'gold');
  link(2, 14);
  link(8, 14);
  link(3, 15, 'gold');
  link(9, 15, 'gold');
  link(4, 16);
  link(10, 16);
  link(5, 17, 'gold');
  link(11, 17, 'gold');
  link(6, 17);
  link(12, 17);
  link(2, 18, 'gold');
  link(18, 14);
  link(8, 19, 'gold');
  link(19, 14);
  link(3, 20);
  link(20, 15);
  link(9, 21);
  link(21, 15);
  link(4, 22, 'gold');
  link(22, 16);
  link(10, 23, 'gold');
  link(23, 16);
  link(17, 24);
  link(17, 25);
  link(24, 26);
  link(25, 27);
  link(26, 27, 'gold');
  return { nodes, edges };
}

export function graphIsConnected(nodeCount: number, edges: readonly ConstellationEdge[]): boolean {
  if (nodeCount === 0) return false;
  const seen = new Set<number>([0]);
  const stack = [0];
  while (stack.length > 0) {
    const current = stack.pop() ?? 0;
    for (const edge of edges) {
      const next = edge.a === current ? edge.b : edge.b === current ? edge.a : -1;
      if (next >= 0 && !seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return seen.size === nodeCount;
}

export function maxEdgeLength(nodes: readonly StarNode[], edges: readonly ConstellationEdge[]): number {
  let max = 0;
  for (const edge of edges) {
    const start = nodes[edge.a];
    const end = nodes[edge.b];
    if (!start || !end) continue;
    max = Math.max(max, Math.hypot(start.x - end.x, start.y - end.y));
  }
  return max;
}

export function horizontalReach(nodes: readonly StarNode[], yMin: number, yMax: number): number {
  const slice = nodes.filter((item) => item.y >= yMin && item.y < yMax);
  if (slice.length === 0) return 0;
  return Math.max(...slice.map((item) => Math.abs(item.x)));
}

/** Soften the sculpture outward without breaking the silhouette. */
export function loosenedPosition(star: StarNode, loosen: number, phase: number): { x: number; y: number } {
  const amount = Math.max(0, Math.min(1, loosen));
  const drift = amount * 0.055;
  return {
    x: star.x * (1 + drift * 1.35) + Math.sin(phase) * drift * 0.2,
    y: star.y + (star.y - 0.4) * drift * 0.45,
  };
}

/** Later, inner strokes fade first, so a loosened tree keeps its outline. */
export function edgeVisibility(loosen: number, order: number, count: number): number {
  const amount = Math.max(0, Math.min(1, loosen));
  const along = count <= 1 ? 0 : order / (count - 1);
  const fade = amount * Math.max(0, along - 0.28) / 0.72;
  const clamped = Math.max(0, Math.min(1, 1 - fade));
  return clamped * clamped * (3 - 2 * clamped);
}

export const PIN_SLOTS: readonly { x: number; y: number }[] = [
  { x: -0.16, y: 0.78 },
  { x: 0.16, y: 0.78 },
  { x: -0.28, y: 0.58 },
  { x: 0.28, y: 0.58 },
  { x: -0.4, y: 0.4 },
  { x: 0.4, y: 0.4 },
  { x: -0.2, y: 0.26 },
  { x: 0.2, y: 0.26 },
];

export function nextPin(placed: number): { x: number; y: number } {
  return PIN_SLOTS[Math.abs(Math.floor(placed)) % PIN_SLOTS.length] ?? PIN_SLOTS[0];
}

/** Photo ornaments hang on the branches, wider toward the lower boughs. */
export function ornamentAnchor(index: number, count: number): { x: number; y: number } {
  const slots = [
    { x: -0.32, y: 0.7 },
    { x: 0.32, y: 0.7 },
    { x: -0.44, y: 0.46 },
    { x: 0.44, y: 0.46 },
    { x: -0.22, y: 0.32 },
    { x: 0.22, y: 0.32 },
  ];
  const safeCount = Math.max(1, count);
  const slot = slots[Math.abs(index) % Math.min(safeCount, slots.length)] ?? slots[0];
  return slot;
}

export function createStarfield(count: number, random: () => number): SkyStar[] {
  const stars: SkyStar[] = [];
  const total = Math.max(0, Math.floor(count));
  for (let i = 0; i < total; i += 1) {
    stars.push({
      x: random(),
      y: random(),
      radius: random() > 0.92 ? 1.35 + random() * 0.6 : 0.45 + random() * 0.7,
      phase: random() * Math.PI * 2,
      warm: random() > 0.9,
    });
  }
  return stars;
}

export function createSnow(count: number, random: () => number): SnowFlake[] {
  const flakes: SnowFlake[] = [];
  for (let i = 0; i < Math.max(0, Math.floor(count)); i += 1) {
    flakes.push({
      x: random(),
      y: random(),
      speed: 0.035 + random() * 0.05,
      drift: random() * Math.PI * 2,
      size: 0.6 + random() * 0.9,
    });
  }
  return flakes;
}

export function stepSnow(flakes: SnowFlake[], dt: number, amount: number, reduced = false): void {
  if (reduced || amount <= 0.01 || dt <= 0) return;
  for (const flake of flakes) {
    flake.y -= flake.speed * dt * amount;
    flake.x += Math.sin(flake.drift + flake.y * 8) * 0.012 * dt * amount;
    if (flake.y < -0.03) flake.y = 1.03;
    if (flake.x < -0.02) flake.x = 1.02;
    if (flake.x > 1.02) flake.x = -0.02;
  }
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export function projectTree(point: { x: number; y: number }, width: number, height: number): ScreenPoint {
  const cx = width * 0.5;
  const top = height * 0.13;
  const bottom = Math.min(height * 0.7, height - 168);
  const span = Math.max(80, bottom - top);
  const scale = Math.min(width * 0.4, span * 0.5);
  return {
    x: cx + point.x * scale * 2,
    y: bottom - ((point.y + 0.02) / 1.02) * span,
  };
}

export function nearestNode(point: { x: number; y: number }, nodes: readonly { x: number; y: number }[]): number {
  let best = 0;
  let bestDistance = Infinity;
  nodes.forEach((nodePoint, index) => {
    const distance = (nodePoint.x - point.x) ** 2 + (nodePoint.y - point.y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}
