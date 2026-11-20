export interface PointerSample {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

export interface PointerHandlers {
  drag?: (dx: number, dy: number, sample: PointerSample, id: number) => void;
  pinch?: (factor: number) => void;
  tap?: (sample: PointerSample) => void;
  doubleTap?: (sample: PointerSample) => void;
  down?: (sample: PointerSample, count: number, id: number) => void;
  move?: (sample: PointerSample, count: number, id: number) => void;
  up?: (sample: PointerSample, count: number, id: number) => void;
}

export function attachPointers(el: HTMLElement, handlers: PointerHandlers): () => void {
  const points = new Map<number, PointerSample>();
  let lastDistance = 0;
  let travel = 0;
  let lastTapAt = 0;

  const sampleFrom = (event: PointerEvent): PointerSample => {
    const rect = el.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;
    return {
      x,
      y,
      nx: ((x - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      ny: -(((y - rect.top) / Math.max(1, rect.height)) * 2 - 1),
    };
  };

  const onDown = (event: PointerEvent) => {
    el.setPointerCapture(event.pointerId);
    const sample = sampleFrom(event);
    points.set(event.pointerId, sample);
    travel = 0;
    handlers.down?.(sample, points.size, event.pointerId);
    if (points.size >= 2) {
      const [a, b] = [...points.values()];
      lastDistance = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  const onMove = (event: PointerEvent) => {
    const prev = points.get(event.pointerId);
    if (!prev) return;
    const sample = sampleFrom(event);
    const dx = sample.x - prev.x;
    const dy = sample.y - prev.y;
    travel += Math.abs(dx) + Math.abs(dy);
    points.set(event.pointerId, sample);
    if (points.size === 1) handlers.drag?.(dx, dy, sample, event.pointerId);
    if (points.size >= 2 && lastDistance > 0) {
      const [a, b] = [...points.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > 0) handlers.pinch?.(distance / lastDistance);
      lastDistance = distance;
    }
    handlers.move?.(sample, points.size, event.pointerId);
  };

  const onUp = (event: PointerEvent) => {
    const sample = points.get(event.pointerId) ?? sampleFrom(event);
    points.delete(event.pointerId);
    if (points.size < 2) lastDistance = 0;
    handlers.up?.(sample, points.size, event.pointerId);
    if (travel < 10 && points.size === 0) {
      const now = performance.now();
      if (now - lastTapAt < 320) handlers.doubleTap?.(sample);
      else handlers.tap?.(sample);
      lastTapAt = now;
    }
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
  };
}
