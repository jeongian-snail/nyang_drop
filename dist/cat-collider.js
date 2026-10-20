import { CAT_OUTLINES } from './cat-outlines.js';

// Convex silhouettes retain the chin and cheeks without unstable concave ears.
// Rendering stays anchored to the sprite, independently of the mass centroid.
export function createCatBody(Matter, level, radius, x, y, options = {}) {
  const vertices = Matter.Vertices.hull(
    CAT_OUTLINES[level].points.map(([px, py]) => ({ x: px * radius, y: py * radius })),
  );
  const centre = Matter.Vertices.centre(vertices);
  const angle = options.angle || 0;
  const body = Matter.Bodies.fromVertices(0, 0, vertices, { ...options, angle: 0 });
  body.cat = { level, radius, spriteOffset: { x: -centre.x, y: -centre.y } };
  Matter.Body.setAngle(body, angle);
  const cosine = Math.cos(angle),
    sine = Math.sin(angle);
  Matter.Body.setPosition(body, {
    x: x + cosine * centre.x - sine * centre.y,
    y: y + sine * centre.x + cosine * centre.y,
  });
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

export function catSupported(body, support, gap = 1.5, a = catBounds(body), b = catBounds(support)) {
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
