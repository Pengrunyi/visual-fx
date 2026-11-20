import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { clamp } from './loop';

export function createOrbit(
  camera: PerspectiveCamera,
  options: {
    radius: number;
    target?: Vector3;
    theta?: number;
    phi?: number;
    minRadius?: number;
    maxRadius?: number;
    minPhi?: number;
    maxPhi?: number;
  },
) {
  const target = options.target ?? new Vector3();
  let theta = options.theta ?? 0.4;
  let phi = options.phi ?? 1.05;
  let radius = options.radius;
  let pause = 0;

  const apply = () => {
    camera.position.set(
      target.x + radius * Math.sin(phi) * Math.sin(theta),
      target.y + radius * Math.cos(phi),
      target.z + radius * Math.sin(phi) * Math.cos(theta),
    );
    camera.lookAt(target);
  };
  apply();

  return {
    drag(dx: number, dy: number) {
      pause = 1.4;
      theta -= dx * 0.005;
      phi = clamp(phi + dy * 0.004, options.minPhi ?? 0.28, options.maxPhi ?? Math.PI - 0.22);
      apply();
    },
    pinch(factor: number) {
      radius = clamp(radius / factor, options.minRadius ?? 2.2, options.maxRadius ?? 28);
      apply();
    },
    spin(dt: number, speed: number) {
      pause = Math.max(0, pause - dt);
      if (pause > 0 || speed === 0) return;
      theta += dt * speed;
      apply();
    },
    apply,
  };
}

const raycaster = new Raycaster();
const ground = new Plane(new Vector3(0, 1, 0), 0);
const ndc = new Vector2();

export function hitGround(camera: PerspectiveCamera, nx: number, ny: number, target: Vector3): boolean {
  ndc.set(nx, ny);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(ground, target) !== null;
}
