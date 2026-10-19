import test from 'node:test';
import assert from 'node:assert/strict';
import Matter from 'matter-js';
import { CatGame, RULES } from '../dist/game-core.js';
import { createSeed, createSeededRandom, normalizeSeed } from '../dist/seed.js';

const sequence = (seed, count = 1000) => {
  const random = createSeededRandom(seed);
  return Array.from({ length: count }, () => Math.floor(random() * 4));
};

test('equal text seeds reproduce long sequences and distinct seeds change the sequence', () => {
  for (const seed of ['42', '0', '냥냥 대결 🐈', 'a'.repeat(64)]) {
    const first = sequence(seed);
    assert.deepEqual(first, sequence(seed));
    assert.notDeepEqual(first, sequence(`${seed}!`));
    assert.deepEqual([...new Set(first)].sort(), [0, 1, 2, 3]);
  }
  assert.notDeepEqual(sequence('cat'), sequence('CAT'));
});

test('seed normalization preserves zero and unifies surrounding spaces and Unicode composition', () => {
  assert.equal(normalizeSeed(0), '0');
  assert.deepEqual(sequence('  냥냥  '), sequence('냥냥'.normalize('NFD')));
  assert.equal(normalizeSeed('   '), '');
  const seed = createSeed();
  assert.ok(seed.length > 0 && seed.length <= 64);
  assert.deepEqual(sequence(seed), sequence(seed));
});

test('real drop order ignores waiting, aiming, rejected inputs, pauses and unrelated randomness', () => {
  const orders = [[], []];
  const games = orders.map(
    (order) =>
      new CatGame(Matter, {
        seed: 'same-order',
        onEvent(event) {
          if (event.type === 'drop') {
            order.push(event.body.cat.level);
          }
        },
      }),
  );
  games.forEach((game) => game.start());
  for (let drop = 0; drop < 12; drop++) {
    games.forEach((game, index) => {
      game.aim(80 + ((drop * 61 + index * 83) % 280));
      game.pause();
      assert.equal(game.drop(), false);
      game.resume();
      assert.equal(game.drop(), true);
      assert.equal(game.drop(), false);
      for (let tick = 0; tick < 90 + index * 60; tick++) {
        Math.random();
        game.step(RULES.step);
      }
    });
  }
  assert.deepEqual(orders[0], orders[1]);
  assert.deepEqual(orders[0], sequence('same-order', 12));
});

test('reset repeats the first cat and queue, and an explicit new seed replaces the old sequence', () => {
  const game = new CatGame(Matter, { seed: 'first' });
  const first = [game.current, game.next, ...Array.from({ length: 100 }, () => game.roll())];
  game.reset();
  assert.deepEqual(
    [game.current, game.next, ...Array.from({ length: 100 }, () => game.roll())],
    first,
  );
  game.reset({ seed: 'second' });
  assert.equal(game.seed, 'second');
  assert.deepEqual(
    [game.current, game.next, ...Array.from({ length: 100 }, () => game.roll())],
    sequence('second', 102),
  );
  game.reset({ seed: 'first' });
  assert.deepEqual([game.current, game.next], first.slice(0, 2));
});
