import { CAT_OUTLINES } from './cat-outlines.js';
import { catOrigin } from './cat-collider.js';

// Only bridge subpixel/antialiased edge gaps, not a percentage of the cat's size.
const EDGE_TOLERANCE = 1.25;
const cache = new WeakMap();
const cross = (ax, ay, bx, by) => ax * by - ay * bx;

function geometry(body) {
  const { x, y } = catOrigin(body),
    angle = body.angle,
    radius = body.cat.radius;
  const prior = cache.get(body);
  if (prior && prior.x === x && prior.y === y && prior.angle === angle) {
    return prior;
  }
  const cosine = Math.cos(angle),
    sine = Math.sin(angle);
  const points = CAT_OUTLINES[body.cat.level].points.map(([px, py]) => [
    x + radius * (cosine * px - sine * py),
    y + radius * (sine * px + cosine * py),
  ]);
  const segments = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return {
      a: point,
      b: next,
      minX: Math.min(point[0], next[0]),
      maxX: Math.max(point[0], next[0]),
      minY: Math.min(point[1], next[1]),
      maxY: Math.max(point[1], next[1]),
    };
  });
  const result = {
    x,
    y,
    angle,
    points,
    segments,
    minX: Math.min(...points.map((p) => p[0])),
    maxX: Math.max(...points.map((p) => p[0])),
    minY: Math.min(...points.map((p) => p[1])),
    maxY: Math.max(...points.map((p) => p[1])),
  };
  cache.set(body, result);
  return result;
}
function boundsOverlap(a, b) {
  return (
    a.minX <= b.maxX + EDGE_TOLERANCE &&
    b.minX <= a.maxX + EDGE_TOLERANCE &&
    a.minY <= b.maxY + EDGE_TOLERANCE &&
    b.minY <= a.maxY + EDGE_TOLERANCE
  );
}
function pointSegmentDistanceSquared(point, a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = dx * dx + dy * dy;
  const t = length
    ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length))
    : 0;
  return (point[0] - a[0] - dx * t) ** 2 + (point[1] - a[1] - dy * t) ** 2;
}
function segmentsTouch(first, second) {
  if (!boundsOverlap(first, second)) {
    return false;
  }
  const { a, b } = first,
    { a: c, b: d } = second;
  const abx = b[0] - a[0],
    aby = b[1] - a[1],
    cdx = d[0] - c[0],
    cdy = d[1] - c[1];
  // Crossing edges, including zero-length intersections. Bounds below exclude disjoint collinear edges.
  if (
    first.minX <= second.maxX &&
    second.minX <= first.maxX &&
    first.minY <= second.maxY &&
    second.minY <= first.maxY &&
    cross(abx, aby, c[0] - a[0], c[1] - a[1]) * cross(abx, aby, d[0] - a[0], d[1] - a[1]) <= 0 &&
    cross(cdx, cdy, a[0] - c[0], a[1] - c[1]) * cross(cdx, cdy, b[0] - c[0], b[1] - c[1]) <= 0
  ) {
    return true;
  }
  return (
    Math.min(
      pointSegmentDistanceSquared(a, c, d),
      pointSegmentDistanceSquared(b, c, d),
      pointSegmentDistanceSquared(c, a, b),
      pointSegmentDistanceSquared(d, a, b),
    ) <=
    EDGE_TOLERANCE ** 2
  );
}
function contains(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function getCatOutlinePoints(body) {
  return geometry(body).points;
}

export function visibleCatsTouch(a, b) {
  const outlineA = CAT_OUTLINES[a.cat.level],
    outlineB = CAT_OUTLINES[b.cat.level];
  const reach = a.cat.radius * outlineA.bound + b.cat.radius * outlineB.bound + EDGE_TOLERANCE;
  const originA = catOrigin(a),
    originB = catOrigin(b);
  if ((originA.x - originB.x) ** 2 + (originA.y - originB.y) ** 2 > reach ** 2) {
    return false;
  }
  const shapeA = geometry(a),
    shapeB = geometry(b);
  if (!boundsOverlap(shapeA, shapeB)) {
    return false;
  }
  for (const edgeA of shapeA.segments) {
    for (const edgeB of shapeB.segments) {
      if (segmentsTouch(edgeA, edgeB)) {
        return true;
      }
    }
  }
  return contains(shapeA.points[0], shapeB.points) || contains(shapeB.points[0], shapeA.points);
}
