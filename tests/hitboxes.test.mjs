import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
import { catOrigin } from '../dist/cat-collider.js';
import { CatGame } from '../dist/game-core.js';
import { drawCatHitbox } from '../dist/hitboxes.js';
import { CAT_OUTLINES } from '../dist/cat-outlines.js';

function recorder() {
  const paths = [];
  let points = [],
    dash = [];
  const ctx = {
    save() {},
    restore() {},
    setLineDash(value) {
      dash = value;
    },
    beginPath() {
      points = [];
    },
    moveTo(x, y) {
      points.push([x, y]);
    },
    lineTo(x, y) {
      points.push([x, y]);
    },
    closePath() {},
    fill() {},
    stroke() {
      paths.push({ points, dash });
    },
  };
  return { ctx, paths };
}

test('hitboxes follow actual engine vertices and rotated merge outlines without mutating bodies', () => {
  const game = new CatGame(Matter);
  const body = game.addCat(5, 220, 350, { angle: 0.71 });
  const snapshot = () =>
    JSON.stringify([
      body.position.x,
      body.position.y,
      body.angle,
      ...body.vertices.map((p) => [p.x, p.y]),
    ]);
  const before = snapshot();
  const { ctx, paths } = recorder();
  drawCatHitbox(ctx, body);
  assert.equal(paths.length, 2);
  assert.deepEqual(
    paths[0].points,
    body.vertices.map(({ x, y }) => [x, y]),
  );
  assert.deepEqual(paths[0].dash, []);
  assert.deepEqual(paths[1].dash, [4, 3]);
  const origin = catOrigin(body);
  const expected = CAT_OUTLINES[body.cat.level].points.map(([px, py]) => [
    origin.x + body.cat.radius * (Math.cos(body.angle) * px - Math.sin(body.angle) * py),
    origin.y + body.cat.radius * (Math.sin(body.angle) * px + Math.cos(body.angle) * py),
  ]);
  assert.deepEqual(paths[1].points, expected);
  assert.equal(snapshot(), before);
  Matter.Body.setPosition(body, { x: 300, y: 400 });
  Matter.Body.setAngle(body, -0.4);
  const moved = recorder();
  drawCatHitbox(moved.ctx, body);
  assert.notDeepEqual(moved.paths[1].points, paths[1].points);
  assert.deepEqual(
    moved.paths[0].points,
    body.vertices.map(({ x, y }) => [x, y]),
  );
});

test('terminal cats show only their physical collider because they cannot merge', () => {
  const game = new CatGame(Matter);
  const { ctx, paths } = recorder();
  drawCatHitbox(ctx, game.addCat(10, 220, 450));
  assert.equal(paths.length, 1);
});
