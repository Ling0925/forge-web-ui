// 3D projection helpers for the usage energy-network canvas.

export type Vec3 = readonly [number, number, number];

export function rotateY(p: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}

export function rotateX(p: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
}

export function transformPoint(p: Vec3, yaw: number, pitch: number): Vec3 {
  return rotateX(rotateY(p, yaw), pitch);
}

export function projectPoint(
  p: Vec3,
  cx: number,
  cy: number,
  fov: number,
  sceneScale: number,
): { x: number; y: number; z: number; scale: number } {
  const scaled: Vec3 = [
    p[0] * sceneScale,
    p[1] * sceneScale,
    p[2] * sceneScale,
  ];
  const depth = Math.max(fov + scaled[2], 120);
  const scale = fov / depth;
  return {
    x: cx + scaled[0] * scale,
    y: cy + scaled[1] * scale,
    z: scaled[2],
    scale,
  };
}

export function quadraticBezier3D(
  p0: Vec3,
  p1: Vec3,
  p2: Vec3,
  t: number,
): Vec3 {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const ut2 = 2 * u * t;
  return [
    uu * p0[0] + ut2 * p1[0] + tt * p2[0],
    uu * p0[1] + ut2 * p1[1] + tt * p2[1],
    uu * p0[2] + ut2 * p1[2] + tt * p2[2],
  ];
}

/**
 * Computes a smooth, non-crossing laminar 3D control point for a session conduit
 * between a Model node and Forge (0,0,0), so multiple active sessions on the same
 * model fan out as a symmetric parallel ribbon without crossing.
 */
export function conduitControlPoint(
  modelPos: Vec3,
  siblingIndex: number,
  siblingCount: number,
): Vec3 {
  const midX = modelPos[0] * 0.5;
  const midY = modelPos[1] * 0.5;
  const midZ = modelPos[2] * 0.5;

  // Tangent perpendicular in XZ plane
  const lenXZ = Math.hypot(modelPos[0], modelPos[2]) || 1;
  const perpX = -modelPos[2] / lenXZ;
  const perpZ = modelPos[0] / lenXZ;

  // When siblingCount === 1, keep lateralSpread = 0 and a gentle lift so Provider -> Model ID -> Forge flows in one unbroken line.
  // When siblingCount > 1, fan out symmetrically into a non-crossing parallel ribbon.
  const normalizedSpread =
    siblingCount <= 1 ? 0 : (siblingIndex / (siblingCount - 1)) * 2 - 1;
  const maxLateral =
    siblingCount <= 1 ? 0 : Math.min(24, (siblingCount - 1) * 9);
  const lateralSpread = normalizedSpread * maxLateral;
  const verticalLift =
    siblingCount <= 1 ? 3 : 4 + (1 - Math.abs(normalizedSpread) * 0.45) * 4;

  return [
    midX + perpX * lateralSpread,
    midY - verticalLift,
    midZ + perpZ * lateralSpread,
  ];
}
