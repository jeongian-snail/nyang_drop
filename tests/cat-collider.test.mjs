import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
import { CatGame, CATS, RULES } from '../dist/game-core.js';
import { catBounds, catOrigin, createCatBody } from '../dist/cat-collider.js';
import { getCatOutlinePoints } from '../dist/merge-contact.js';

test('rotated colliders reach the visible chin, cheeks and ears without a circular gap', () => {
  for (let level = 0; level < CATS.length; level++) {
    for (const angle of [-2.4, -0.6, 0, 0.7, 2.1]) {
      const body = createCatBody(Matter, level, CATS[level].radius, 220, 350, { angle });
      const origin = catOrigin(body);
      assert.ok(Math.abs(origin.x - 220) < 0.000001);
      assert.ok(Math.abs(origin.y - 350) < 0.000001);
      const outline = getCatOutlinePoints(body);
      const visible = {
        minX: Math.min(...outline.map(([x]) => x)),
        maxX: Math.max(...outline.map(([x]) => x)),
        minY: Math.min(...outline.map(([, y]) => y)),
        maxY: Math.max(...outline.map(([, y]) => y)),
      };
      const actual = catBounds(body);
      for (const edge of ['minX', 'maxX', 'minY', 'maxY']) {
        assert.ok(Math.abs(actual[edge] - visible[edge]) < 0.000001, `level ${level}: ${edge}`);
      }
    }
  }
});

test('large cats rest with their visible outline on the floor', () => {
  for (const level of [6, 7, 8, 9]) {
    const game = new CatGame(Matter);
    game.start();
    const body = game.addCat(level, 220, 400, { eligible: true });
    for (let i = 0; i < 960; i++) {
      game.step();
    }
    assert.equal(body.isSleeping, true);
    const visibleBottom = Math.max(...getCatOutlinePoints(body).map(([, y]) => y));
    assert.ok(Math.abs(visibleBottom - RULES.floor) < 0.2, 'no empty space below the chin');
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
