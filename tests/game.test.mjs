import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
import { catBounds } from '../dist/cat-collider.js';
import { CatGame, CATS, RULES, mergePoints } from '../dist/game-core.js';

const make = (random = () => 0) => {
  const events = [];
  const game = new CatGame(Matter, { random, onEvent: (e) => events.push(e) });
  game.start();
  return { game, events };
};
const run = (game, ms) => {
  for (let i = 0; i < Math.ceil(ms / RULES.step); i++) {
    game.step();
  }
};

test('same cats merge once, score once, using the real collision engine', () => {
  const { game, events } = make();
  game.addCat(0, 200, 500);
  game.addCat(0, 235, 500);
  run(game, 100);
  assert.equal(game.bodies.size, 1);
  assert.equal([...game.bodies.values()][0].cat.level, 1);
  assert.equal(game.score, 10);
  assert.equal(events.filter((e) => e.type === 'merge').length, 1);
});
test('three simultaneous matches consume only one pair', () => {
  const { game } = make();
  for (const x of [182, 218, 254]) {
    game.addCat(0, x, 500);
  }
  run(game, 150);
  assert.deepEqual([...game.bodies.values()].map((b) => b.cat.level).sort(), [0, 1]);
  assert.equal(game.score, 10);
});
test('different levels remain separate and stack above the floor', () => {
  const { game } = make();
  game.addCat(1, 200, 500);
  game.addCat(2, 245, 500);
  run(game, 3000);
  assert.equal(game.bodies.size, 2);
  assert.equal(game.score, 0);
  for (const b of game.bodies.values()) {
    assert.ok(catBounds(b).maxY <= RULES.floor + 2);
  }
});
test('merges can chain into a further level', () => {
  const { game, events } = make();
  game.addCat(0, 205, 550);
  game.addCat(0, 239, 550);
  game.addCat(1, 222, 590);
  run(game, 1000);
  assert.equal(game.bodies.size, 1);
  assert.equal([...game.bodies.values()][0].cat.level, 2);
  assert.equal(game.score, 30);
  assert.equal(events.filter((e) => e.type === 'merge').length, 2);
});
test('level 10 still awards 2560 points and can now merge into the final Maine Coon', () => {
  const { game, events } = make();
  game.addCat(8, 160, 500);
  game.addCat(8, 285, 500);
  run(game, 100);
  assert.equal(game.score, 2560);
  assert.equal(game.won, false);
  assert.equal(events.filter((e) => e.type === 'win').length, 0);
  const tenth = [...game.bodies.values()][0];
  game.addCat(9, tenth.position.x, tenth.position.y - 150);
  run(game, 500);
  assert.equal(game.bodies.size, 1);
  const final = [...game.bodies.values()][0];
  assert.equal(final.cat.level, 10);
  assert.equal(CATS[final.cat.level].name, '메인쿤');
  assert.equal(game.score, 2560 + 5120);
  assert.equal(game.highest, 10);
  assert.equal(game.discovered.has(10), true);
  assert.equal(game.won, true);
  assert.equal(game.state, 'playing');
  assert.equal(events.filter((e) => e.type === 'win').length, 1);
  assert.equal(events.filter((e) => e.type === 'merge' && e.level === 10).length, 1);
  assert.deepEqual(
    Array.from({ length: CATS.length - 1 }, (_, i) => mergePoints(i + 1)),
    [10, 20, 40, 80, 160, 320, 640, 1280, 2560, 5120],
  );
  for (const invalid of [-1, 0, 0.5, CATS.length, NaN]) {
    assert.equal(mergePoints(invalid), 0);
  }
});
test('two final Maine Coons stay separate without awarding extra points or a level 12', () => {
  const { game, events } = make();
  game.addCat(10, 140, 500, { eligible: true });
  game.addCat(10, 300, 500, { eligible: true });
  run(game, 3000);
  assert.deepEqual(
    [...game.bodies.values()].map((body) => body.cat.level),
    [10, 10],
  );
  assert.equal(game.score, 0);
  assert.equal(events.filter((event) => event.type === 'merge' || event.type === 'win').length, 0);
  assert.equal(game.state, 'playing');
  assert.ok([...game.bodies.values()].every((body) => body.isSleeping));
});
test('the final-level achievement fires once even when another Maine Coon is made', () => {
  const { game, events } = make();
  for (let i = 0; i < 2; i++) {
    game.addCat(9, 150, 360);
    game.addCat(9, 290, 360);
    run(game, 100);
  }
  assert.equal(game.score, 10240);
  assert.equal(events.filter((event) => event.type === 'win').length, 1);
  assert.equal(events.filter((event) => event.type === 'merge' && event.level === 10).length, 2);
});
test('rapid drops respect 600ms cooldown, and do not queue', () => {
  const { game } = make();
  assert.equal(game.drop(-999), true);
  assert.ok([...game.bodies.values()][0].position.x >= RULES.left + CATS[0].radius);
  for (let i = 0; i < 30; i++) {
    assert.equal(game.drop(300), false);
  }
  run(game, 590);
  assert.equal(game.drop(), false);
  run(game, 20);
  assert.equal(game.drop(4000), true);
  assert.equal(game.bodies.size, 2);
  run(game, 2000);
  assert.ok(game.bodies.size <= 2);
});
test('initial drop cannot lose while normally entering the board', () => {
  const { game } = make();
  game.drop();
  run(game, 1500);
  assert.equal(game.dangerMs, 0);
  assert.equal(game.state, 'playing');
});
test('uncontacted cat becomes eligible after one second; two-second danger follows', () => {
  const { game } = make();
  const cat = game.addCat(0, 220, 100);
  Matter.Body.setStatic(cat, true);
  run(game, 900);
  assert.equal(cat.cat.eligible, false);
  assert.equal(game.dangerMs, 0);
  run(game, 200);
  assert.equal(cat.cat.eligible, true);
  assert.ok(game.dangerMs > 0);
  run(game, 1800);
  assert.equal(game.state, 'playing');
  run(game, 150);
  assert.equal(game.state, 'over');
  assert.equal(game.drop(), false);
});
test('pause freezes physics, cooldown, danger and time', () => {
  const { game } = make();
  game.drop();
  const danger = game.addCat(2, 100, 115, { eligible: true });
  Matter.Body.setStatic(danger, true);
  run(game, 200);
  game.pause();
  const before = {
    time: game.time,
    danger: game.dangerMs,
    cooldown: game.cooldownUntil,
    positions: [...game.bodies.values()].map((b) => ({ ...b.position })),
  };
  run(game, 5000);
  assert.deepEqual(
    {
      time: game.time,
      danger: game.dangerMs,
      cooldown: game.cooldownUntil,
      positions: [...game.bodies.values()].map((b) => ({ ...b.position })),
    },
    before,
  );
  assert.equal(game.drop(), false);
  game.resume();
  run(game, 50);
  assert.ok(game.dangerMs > before.danger);
});
test('global danger does not reset when the overflowing body changes', () => {
  const { game } = make();
  const first = game.addCat(0, 90, 130, { eligible: true }),
    second = game.addCat(1, 300, 300, { eligible: true });
  Matter.Body.setStatic(first, true);
  Matter.Body.setStatic(second, true);
  run(game, 1100);
  Matter.Body.setPosition(first, { x: 90, y: 350 });
  Matter.Body.setPosition(second, { x: 300, y: 130 });
  run(game, 950);
  assert.equal(game.state, 'over');
});
test('danger resets only once all eligible cats are below the line', () => {
  const { game } = make();
  const cat = game.addCat(0, 220, 130, { eligible: true });
  Matter.Body.setStatic(cat, true);
  run(game, 1000);
  assert.ok(game.dangerMs > 900);
  Matter.Body.setPosition(cat, { x: 220, y: 350 });
  game.step();
  assert.equal(game.dangerMs, 0);
  Matter.Body.setPosition(cat, { x: 220, y: 130 });
  run(game, 1200);
  assert.equal(game.state, 'playing');
});
test('merge replacements remain immediately eligible and preserve global danger', () => {
  const { game } = make();
  game.engine.gravity.y = 0;
  const a = game.addCat(0, 90, 125, { eligible: true });
  Matter.Body.setStatic(a, true);
  run(game, 1300);
  Matter.Body.setStatic(a, false);
  game.addCat(0, 124, 125, { eligible: true });
  game.step();
  assert.equal(game.bodies.size, 1);
  assert.ok([...game.bodies.values()][0].cat.eligible);
  assert.ok(game.dangerMs > 1300);
  run(game, 750);
  assert.equal(game.state, 'over');
});
test('restart removes old cats, contacts, timers, score and queued work', () => {
  const { game } = make();
  game.drop();
  game.addCat(1, 200, 500);
  run(game, 100);
  game.pause();
  game.score = 1000;
  game.dangerMs = 1900;
  game.reset();
  assert.equal(game.bodies.size, 0);
  assert.equal(game.engine.world.bodies.length, 3);
  assert.equal(game.score, 0);
  assert.equal(game.time, 0);
  assert.equal(game.dangerMs, 0);
  assert.equal(game.cooldownUntil, 0);
  assert.equal(game.discovered.size, 0);
  assert.equal(game.state, 'ready');
  game.start();
  assert.equal(game.drop(), true);
});
test('spawn selection is limited to four equally sized probability intervals', () => {
  const points = [0.0, 0.24999, 0.25, 0.49999, 0.5, 0.74999, 0.75, 0.99999];
  assert.deepEqual(
    points.map((n) => make(() => n).game.current),
    [0, 0, 1, 1, 2, 2, 3, 3],
  );
});
test('seeded extended play keeps bodies finite and within side/floor bounds', () => {
  let seed = 42;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let round = 0; round < 4; round++) {
    const { game } = make(random);
    for (let drop = 0; drop < 130 && game.state === 'playing'; drop++) {
      game.drop(40 + random() * 360);
      run(game, 700);
      for (const b of game.bodies.values()) {
        assert.ok(Number.isFinite(b.position.x) && Number.isFinite(b.position.y));
        assert.ok(catBounds(b).minX >= RULES.left - 3, 'left wall penetration');
        assert.ok(catBounds(b).maxX <= RULES.right + 3, 'right wall penetration');
        assert.ok(catBounds(b).maxY <= RULES.floor + 3, 'floor penetration');
      }
    }
    assert.ok(game.merges > 0);
    assert.ok(game.score > 0);
  }
});
