import { CAT_OUTLINES } from './cat-outlines.js';

// Fit the face between the central forehead and chin, excluding the ears.
// Radius and vertical centre are fractions of the unchanged artwork radius.
export const CAT_COLLIDERS = Object.freeze([
  { scale: 0.83, offsetY: 0.065 },
  { scale: 0.85, offsetY: 0.085 },
  { scale: 0.84, offsetY: 0.1 },
  { scale: 0.81, offsetY: 0.085 },
  { scale: 0.83, offsetY: 0.09 },
  { scale: 0.83, offsetY: 0.09 },
  { scale: 0.78, offsetY: 0.09 },
  { scale: 0.83, offsetY: 0.05 },
  { scale: 0.8, offsetY: 0.085 },
  { scale: 0.77, offsetY: 0.11 },
]);

export function createCatBody(Matter, level, radius, x, y, options = {}) {
  const profile = CAT_COLLIDERS[level];
  const offsetY = radius * profile.offsetY;
  const angle = options.angle || 0;
  const body = Matter.Bodies.circle(
    x - Math.sin(angle) * offsetY,
    y + Math.cos(angle) * offsetY,
    radius * profile.scale,
    options,
    32,
  );
  body.cat = { level, radius, spriteOffset: { x: 0, y: -offsetY } };
  return body;
}

export function catOrigin(body) {
  const offset = body.cat.spriteOffset;
  if (!offset) {
    return body.position;
  }
  const cosine = Math.cos(body.angle),
    sine = Math.sin(body.angle);
  return {
    x: body.position.x + cosine * offset.x - sine * offset.y,
    y: body.position.y + sine * offset.x + cosine * offset.y,
  };
}

export function catBounds(body) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const point of body.vertices) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, maxX, minY, maxY };
}

export function catSpawnRange(level, radius) {
  const points = CAT_OUTLINES[level].points;
  return {
    minX: radius * Math.min(...points.map((point) => point[0])),
    maxX: radius * Math.max(...points.map((point) => point[0])),
  };
}

export function catSupported(
  body,
  support,
  gap = 1.5,
  a = catBounds(body),
  b = catBounds(support),
) {
  if (support.position.y <= body.position.y + 0.5) {
    return false;
  }
  if (
    a.minX > b.maxX + gap ||
    b.minX > a.maxX + gap ||
    a.minY > b.maxY + gap ||
    b.minY > a.maxY + gap
  ) {
    return false;
  }
  // A separating-axis distance check also works for rotated sleeping bodies.
  for (const axis of [...body.axes, ...support.axes]) {
    let minA = Infinity,
      maxA = -Infinity,
      minB = Infinity,
      maxB = -Infinity;
    for (const point of body.vertices) {
      const projection = point.x * axis.x + point.y * axis.y;
      minA = Math.min(minA, projection);
      maxA = Math.max(maxA, projection);
    }
    for (const point of support.vertices) {
      const projection = point.x * axis.x + point.y * axis.y;
      minB = Math.min(minB, projection);
      maxB = Math.max(maxB, projection);
    }
    if (minA > maxB + gap || minB > maxA + gap) {
      return false;
    }
  }
  return true;
}
