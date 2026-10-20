import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
import { CatGame, CATS, RULES } from '../dist/game-core.js';
import { catBounds, catOrigin, createCatBody } from '../dist/cat-collider.js';
import { CAT_OUTLINES } from '../dist/cat-outlines.js';
import { getCatOutlinePoints } from '../dist/merge-contact.js';

function foreheadY(level) {
  const points = CAT_OUTLINES[level].points;
  const crossings = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    if (a[0] !== b[0] && Math.min(a[0], b[0]) <= 0 && Math.max(a[0], b[0]) >= 0) {
      crossings.push(a[1] + ((b[1] - a[1]) * -a[0]) / (b[0] - a[0]));
    }
  }
  return Math.min(...crossings);
}

test('all cats use smaller circular face colliders without shrinking the artwork', () => {
  assert.deepEqual(
    CATS.map((cat) => cat.radius),
    [20.9475, 27.5625, 34.1775, 41.895, 50.715, 60.6375, 71.6625, 83.79, 97.02, 112.455, 143.325],
  );
  for (let level = 0; level < CATS.length; level++) {
    const radius = CATS[level].radius;
    for (const angle of [-2.4, -0.6, 0, 0.7, 2.1]) {
      const body = createCatBody(Matter, level, radius, 220, 350, { angle });
      assert.ok(body.circleRadius >= radius * 0.75 && body.circleRadius <= radius * 0.85);
      assert.equal(body.cat.radius, radius, 'merge outlines retain the original artwork size');
      assert.ok(Math.abs(catOrigin(body).x - 220) < 0.000001);
      assert.ok(Math.abs(catOrigin(body).y - 350) < 0.000001);
      // Matter approximates circles with a regular polygon, rounded to 0.001px.
      for (const point of body.vertices) {
        const distance = Math.hypot(point.x - body.position.x, point.y - body.position.y);
        assert.ok(Math.abs(distance - body.circleRadius) < 0.001);
      }
      if (angle === 0) {
        const visibleForehead = 350 + foreheadY(level) * radius;
        const colliderTop = body.position.y - body.circleRadius;
        assert.ok(colliderTop >= visibleForehead - 0.5, 'no invisible bridge between the ears');
      }
    }
  }
});

test('a small cat settles against the forehead instead of floating between large ears', () => {
  const game = new CatGame(Matter);
  game.start();
  const support = game.addCat(6, 220, 500, { eligible: true });
  Matter.Body.setStatic(support, true);
  // A short centred drop isolates face clearance from rolling off the support.
  const small = game.addCat(2, 220, 400, { eligible: true });
  for (let i = 0; i < 1440; i++) {
    game.step();
  }
  assert.equal(small.isSleeping, true);
  const headY = catOrigin(support).y + foreheadY(6) * CATS[6].radius;
  const smallBottom = Math.max(...getCatOutlinePoints(small).map(([, y]) => y));
  assert.ok(headY - smallBottom < 1.5, 'the small cat must touch the visible forehead');
  assert.ok(smallBottom - headY < 3, 'the small cat must not sink through the face');
});

test('large circular cats settle on the floor without repeated boundary corrections', () => {
  for (const level of [6, 7, 8, 9, 10]) {
    const game = new CatGame(Matter);
    game.start();
    const body = game.addCat(level, 220, 400, { eligible: true });
    for (let i = 0; i < 960; i++) {
      game.step();
    }
    assert.equal(body.isSleeping, true);
    assert.ok(Math.abs(catBounds(body).maxY - RULES.floor) < 0.2);
  }
});

test('screenshot stack stops spinning and stays settled for ten seconds', () => {
  const game = new CatGame(Matter);
  game.start();
  const layout = [
    [8, 195, 509, 2.6],
    [6, 342, 521, 1.1],
    [5, 76, 537, 2.5],
    [5, 284, 390, -2.7],
    [4, 65, 431, -1.5],
    [4, 372, 426, 0.2],
    [2, 141, 400, 1.7],
    [0, 43, 574, 0.4],
    [0, 283, 574, 0],
  ];
  for (const [level, x, y, angle] of layout) {
    game.addCat(level, x, y, { angle, eligible: true });
  }
  for (let i = 0; i < 1440; i++) {
    game.step();
  }
  const settled = [...game.bodies.values()].map((body) => ({
    body,
    x: body.position.x,
    y: body.position.y,
    angle: body.angle,
  }));
  assert.equal(settled.length, layout.length);
  assert.ok(settled.every(({ body }) => body.isSleeping));
  for (let i = 0; i < 1200; i++) {
    game.step();
    for (const { body, x, y, angle } of settled) {
      assert.ok(Math.hypot(body.position.x - x, body.position.y - y) < 0.05);
      assert.ok(Math.abs(body.angle - angle) < 0.001);
    }
  }
  assert.equal(game.state, 'playing');
  assert.ok(game.time > 21900, 'the simulation must keep advancing');
});
