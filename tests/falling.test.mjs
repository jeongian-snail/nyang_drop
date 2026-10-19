import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
import { CatGame, RULES } from '../dist/game-core.js';

test('yellow cat falls after the cats supporting it merge away', () => {
  const game = new CatGame(Matter);
  game.start();
  const support = game.addCat(6, 200, 485, { eligible: true });
  const yellow = game.addCat(1, 220, 400, { eligible: true });
  // Reproduce the suspended body state left by the previous engine settings.
  Matter.Sleeping.set(support, true);
  Matter.Sleeping.set(yellow, true);
  game.addCat(6, 90, 485, { eligible: true });
  game.step();
  assert.equal(game.bodies.has(support.id), false);
  assert.equal(game.bodies.has(yellow.id), true);
  assert.equal(yellow.isSleeping, false);
  const initialY = yellow.position.y;
  for (let i = 0; i < 120; i++) {
    game.step();
  }
  assert.ok(yellow.position.y > initialY + 30, 'unsupported yellow cat must fall');
  assert.equal(game.score, 640);
});

test('settled cats keep responding to gravity when a support disappears', () => {
  const game = new CatGame(Matter);
  game.start();
  const support = Matter.Bodies.rectangle(220, 500, 220, 20, { isStatic: true, label: 'floor' });
  Matter.Composite.add(game.engine.world, support);
  const yellow = game.addCat(1, 220, 450, { eligible: true });
  for (let i = 0; i < 960; i++) {
    game.step();
  }
  const restingY = yellow.position.y;
  assert.ok(restingY < RULES.floor - 80);
  assert.equal(yellow.isSleeping, true, 'a supported resting cat should settle to sleep');
  Matter.Composite.remove(game.engine.world, support);
  game.step();
  assert.equal(yellow.isSleeping, false, 'removing support must wake the cat');
  for (let i = 0; i < 120; i++) {
    game.step();
  }
  assert.ok(yellow.position.y > restingY + 70);
  assert.ok(Math.abs(yellow.position.y + yellow.circleRadius - RULES.floor) < 2);
});

test('a whole sleeping stack wakes when its floor moves; cats cannot support a floating group', () => {
  const game = new CatGame(Matter);
  game.start();
  const platform = Matter.Bodies.rectangle(220, 500, 220, 20, { isStatic: true, label: 'floor' });
  Matter.Composite.add(game.engine.world, platform);
  const cats = [
    [3, 452],
    [2, 383],
    [1, 327],
  ].map(([level, y]) => game.addCat(level, 220, y, { eligible: true }));
  cats.forEach((cat) => Matter.Sleeping.set(cat, true));
  game.step();
  assert.ok(cats.every((cat) => cat.isSleeping));
  Matter.Body.setPosition(platform, { x: 700, y: 500 });
  game.step();
  assert.ok(cats.every((cat) => !cat.isSleeping));
  const initialY = cats[2].position.y;
  for (let i = 0; i < 120; i++) {
    game.step();
  }
  assert.ok(cats[2].position.y > initialY + 50);
});

test('stacked cats stop lateral jitter and stay settled during ten seconds without input', () => {
  for (const layout of [
    [
      [8, 112, 534],
      [7, 310, 546],
      [6, 215, 405],
      [4, 143, 309],
      [3, 263, 315],
      [2, 204, 239],
    ],
    [
      [7, 102, 546],
      [6, 240, 557],
      [4, 360, 576],
      [5, 150, 420],
      [3, 290, 444],
      [2, 360, 480],
      [4, 83, 332],
      [2, 218, 338],
      [1, 294, 373],
      [0, 350, 392],
    ],
  ]) {
    const game = new CatGame(Matter);
    game.start();
    for (const [level, x, y] of layout) {
      game.addCat(level, x, y, { eligible: true });
    }
    for (let i = 0; i < 1440; i++) {
      game.step();
    }
    assert.equal(game.state, 'playing');
    const settled = new Map(
      [...game.bodies.values()].map((cat) => [
        cat.id,
        { x: cat.position.x, y: cat.position.y, angle: cat.angle },
      ]),
    );
    for (let i = 0; i < 1200; i++) {
      game.step();
      for (const cat of game.bodies.values()) {
        const before = settled.get(cat.id);
        assert.ok(
          Math.abs(cat.position.x - before.x) < 0.05,
          'no repeated lateral motion after settling',
        );
        assert.ok(Math.abs(cat.position.y - before.y) < 0.05);
        assert.ok(Math.abs(cat.angle - before.angle) < 0.001);
      }
    }
  }
});

test('a new falling cat can wake and move a settled cat', () => {
  const game = new CatGame(Matter);
  game.start();
  const resting = game.addCat(4, 220, 576, { eligible: true });
  for (let i = 0; i < 960; i++) {
    game.step();
  }
  assert.equal(resting.isSleeping, true);
  const initialX = resting.position.x;
  game.addCat(0, 240, 470, { velocity: { x: 0, y: 4 } });
  let woke = false;
  for (let i = 0; i < 120; i++) {
    game.step();
    woke ||= !resting.isSleeping;
  }
  assert.ok(woke);
  assert.ok(Math.abs(resting.position.x - initialX) > 0.01);
});
