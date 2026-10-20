import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Matter from 'matter-js';
import { catBounds, catOrigin } from '../dist/cat-collider.js';
import { CatGame, CATS } from '../dist/game-core.js';
import { CAT_OUTLINES } from '../dist/cat-outlines.js';
import { visibleCatsTouch } from '../dist/merge-contact.js';

const fixture = () => {
  const events = [],
    game = new CatGame(Matter, { onEvent: (event) => events.push(event) });
  game.start();
  game.engine.gravity.y = 0;
  return { game, events };
};

test('screenshot reproduction: two diagonal white cats touching outside their circles merge while asleep', () => {
  const { game, events } = fixture();
  // Positions and rotations reconstructed from the attached image. These remain
  // separated by 6.69 logical pixels in the old circular collision test.
  const a = game.addCat(5, 251, 360, { angle: 0.277655, eligible: true });
  const b = game.addCat(5, 363, 327.25, { angle: -0.026628, eligible: true });
  assert.ok(
    Math.hypot(catOrigin(a).x - catOrigin(b).x, catOrigin(a).y - catOrigin(b).y) >
      a.cat.radius + b.cat.radius,
  );
  Matter.Sleeping.set(a, true);
  Matter.Sleeping.set(b, true);
  assert.equal(visibleCatsTouch(a, b), true);
  game.step();
  assert.equal(game.bodies.size, 1);
  assert.equal([...game.bodies.values()][0].cat.level, 6);
  assert.equal(game.score, 320);
  assert.equal(events.filter((event) => event.type === 'merge').length, 1);
  for (let i = 0; i < 30; i++) {
    game.step();
  }
  assert.equal(game.score, 320);
});

test('separated white sprites do not merge merely because they are near each other', () => {
  const { game } = fixture();
  const a = game.addCat(5, 185, 350, { eligible: true });
  const b = game.addCat(5, 315, 350, { eligible: true });
  Matter.Sleeping.set(a, true);
  Matter.Sleeping.set(b, true);
  assert.equal(visibleCatsTouch(a, b), false);
  for (let i = 0; i < 120; i++) {
    game.step();
  }
  assert.equal(game.bodies.size, 2);
  assert.equal(game.score, 0);
});

test('visible overlap of three equal cats still consumes only one pair', () => {
  const { game, events } = fixture();
  for (const [x, y, angle] of [
    [251, 360, 0.277655],
    [363, 327.25, -0.026628],
    [139, 327.25, 0.026628],
  ]) {
    Matter.Sleeping.set(game.addCat(5, x, y, { angle, eligible: true }), true);
  }
  game.step();
  assert.equal(game.bodies.size, 2);
  assert.equal(game.score, 320);
  assert.equal(events.filter((event) => event.type === 'merge').length, 1);
});

test('different levels and terminal cats remain excluded from visual merge checks', () => {
  const { game } = fixture();
  Matter.Sleeping.set(game.addCat(5, 160, 350, { eligible: true }), true);
  Matter.Sleeping.set(game.addCat(6, 260, 350, { eligible: true }), true);
  game.step();
  assert.equal(game.bodies.size, 2);
  assert.equal(game.score, 0);
  game.reset();
  game.start();
  game.engine.gravity.y = 0;
  Matter.Sleeping.set(game.addCat(CATS.length - 1, 160, 400, { eligible: true }), true);
  Matter.Sleeping.set(game.addCat(CATS.length - 1, 280, 400, { eligible: true }), true);
  game.step();
  assert.equal(game.bodies.size, 2);
  assert.equal(game.score, 0);
});

test('cached outlines update after rotation and movement', () => {
  const { game } = fixture();
  const a = game.addCat(5, 200, 350),
    b = game.addCat(5, 310, 350);
  assert.equal(visibleCatsTouch(a, b), true);
  Matter.Body.translate(a, { x: -41, y: 0 });
  assert.equal(visibleCatsTouch(a, b), false);
  Matter.Body.translate(a, { x: 41, y: 0 });
  assert.equal(visibleCatsTouch(a, b), true);
  Matter.Body.setAngle(a, -Math.PI / 2);
  assert.equal(visibleCatsTouch(a, b), false);
});

test('outline data is generated from exactly the images currently rendered', async () => {
  assert.equal(CAT_OUTLINES.length, CATS.length);
  for (let i = 0; i < CATS.length; i++) {
    const bytes = await readFile(new URL(`../dist/assets/${CATS[i].file}`, import.meta.url));
    assert.equal(CAT_OUTLINES[i].file, CATS[i].file);
    assert.equal(CAT_OUTLINES[i].sha256, createHash('sha256').update(bytes).digest('hex'));
  }
});

test('overlapping larger merge results cannot push cats through the container', () => {
  const { game } = fixture();
  const cat = game.addCat(5, 80, 350, { eligible: true });
  Matter.Body.setPosition(cat, { x: 55, y: 600 });
  Matter.Body.setVelocity(cat, { x: -3, y: 3 });
  game.step();
  assert.ok(catBounds(cat).minX >= 22 - 0.000001);
  assert.ok(catBounds(cat).maxY <= 622 + 0.000001);
  assert.ok(cat.velocity.x >= 0);
  assert.ok(cat.velocity.y <= 0);
});
