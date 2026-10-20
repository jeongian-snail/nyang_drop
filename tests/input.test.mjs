import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import Matter from 'matter-js';
import { CatGame, CATS, RULES, SPRITE, clamp } from '../dist/game-core.js';
import { createIntro } from '../dist/intro.js';
import { createGameAudio } from '../dist/audio.js';
import { CAT_OUTLINES } from '../dist/cat-outlines.js';
import { createSeed, normalizeSeed } from '../dist/seed.js';
import { drawCatHitbox } from '../dist/hitboxes.js';

// DOM adapters exercise production event handlers; they do not replace browser visual/device QA.
async function harness({
  brokenImage = false,
  pendingImage = false,
  skipIntro = true,
  skipWhileLoading = false,
  reducedMotion = false,
  stored = null,
} = {}) {
  const elements = new Map();
  const context2d = new Proxy(
    {},
    {
      get: (target, key) => target[key] || (() => {}),
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    },
  );
  const document = { activeElement: null, hidden: false, listeners: {} };
  class Element {
    constructor(id = '') {
      this.id = id;
      this.listeners = {};
      this.hidden = false;
      this.disabled = false;
      this.children = [];
      this.attributes = {};
      this.textContent = '';
      this.nodes = {};
      const classes = new Set();
      this.classList = {
        add: (...names) => names.forEach((n) => classes.add(n)),
        remove: (...names) => names.forEach((n) => classes.delete(n)),
        contains: (n) => classes.has(n),
        toggle: (n, force) => {
          if (force) {
            classes.add(n);
          } else {
            classes.delete(n);
          }
        },
      };
    }
    set innerHTML(value) {
      this.html = value;
      if (this.id === 'cat-collection') {
        this.children = CATS.map(() => new Element());
      }
    }
    get innerHTML() {
      return this.html || '';
    }
    addEventListener(type, callback) {
      (this.listeners[type] ??= []).push(callback);
    }
    removeEventListener(type, callback) {
      this.listeners[type] = (this.listeners[type] || []).filter(
        (listener) => listener !== callback,
      );
    }
    fire(type, values = {}) {
      const event = {
        pointerType: 'touch',
        isPrimary: true,
        pointerId: 1,
        clientX: 220,
        clientY: 200,
        button: 0,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...values,
      };
      for (const callback of this.listeners[type] || []) {
        callback(event);
      }
      return event;
    }
    querySelector(selector) {
      return (this.nodes[selector] ??= new Element());
    }
    querySelectorAll() {
      const ids = {
        modal: ['primary-button', 'secondary-button'],
        'game-settings': [
          'settings-close',
          'next-preview-toggle',
          'hitbox-toggle',
          'seed-input',
          'seed-apply',
        ],
        'volume-panel': ['volume-close', 'music-volume', 'effects-volume', 'sound-toggle'],
        'volume-control': [
          'volume-button',
          'volume-close',
          'music-volume',
          'effects-volume',
          'sound-toggle',
        ],
      };
      return (ids[this.id] || []).map(get);
    }
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
    focus() {
      document.activeElement = this;
    }
    contains(element) {
      return (
        this === element ||
        Object.values(this.nodes).includes(element) ||
        this.querySelectorAll().includes(element)
      );
    }
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 440, bottom: 650, width: 440, height: 650 };
    }
    setPointerCapture(id) {
      this.capture = id;
    }
    releasePointerCapture() {
      this.capture = null;
    }
    getContext() {
      return context2d;
    }
  }
  const get = (id) => {
    if (!elements.has(id)) {
      elements.set(id, new Element(id));
    }
    return elements.get(id);
  };
  document.getElementById = get;
  document.addEventListener = Element.prototype.addEventListener;
  document.fire = Element.prototype.fire;
  const window = new Element();
  window.Matter = Matter;
  window.devicePixelRatio = 1;
  let startupReady = false;
  window.nyangStartup = {
    failed: false,
    ready() {
      startupReady = true;
      return true;
    },
  };
  window.innerWidth = 390;
  window.innerHeight = 844;
  document.documentElement = new Element();
  document.documentElement.classList.add('intro-running');
  get('game-layout').classList.add('intro-concealed');
  get('game-layout').inert = true;
  get('room-decor').classList.add('intro-concealed');
  get('overlay').hidden = true;
  let introFrame,
    timerId = 0;
  const timeouts = new Map(),
    pendingImages = [];
  window.requestAnimationFrame = (callback) => {
    introFrame = callback;
    return 1;
  };
  window.cancelAnimationFrame = () => {
    introFrame = null;
  };
  window.setTimeout = (callback, delay) => {
    timeouts.set(++timerId, { callback, delay });
    return timerId;
  };
  window.clearTimeout = (id) => {
    timeouts.delete(id);
  };
  const expire = (delay) => {
    const timer = [...timeouts].find(([, value]) => value.delay === delay);
    if (!timer) {
      return false;
    }
    timeouts.delete(timer[0]);
    timer[1].callback();
    return true;
  };
  const audioErrors = [];
  let raf,
    reloaded = false;
  const sandbox = {
    CatGame,
    CATS,
    RULES,
    SPRITE,
    clamp,
    CAT_OUTLINES,
    createSeed,
    normalizeSeed,
    drawCatHitbox,
    document,
    window,
    createGameAudio: (options) =>
      createGameAudio({ ...options, view: window, fetchAudio: async () => ({ ok: false }) }),
    createIntro: (options) => {
      const controller = createIntro({ ...options, view: window });
      if (skipWhileLoading) {
        get('intro-skip').fire('click');
      }
      return controller;
    },
    matchMedia: () => ({ matches: reducedMotion }),
    localStorage: {
      getItem: (key) => {
        if (stored) {
          return stored[key] ?? null;
        }
        throw new Error('Storage blocked');
      },
      setItem: (key, value) => {
        if (stored) {
          stored[key] = String(value);
        } else {
          throw new Error('Storage blocked');
        }
      },
    },
    performance: { now: () => 0 },
    requestAnimationFrame: (callback) => {
      raf = callback;
    },
    Image: class {
      complete = true;
      naturalWidth = 1254;
      set src(value) {
        this.url = value;
        const finish = () => (brokenImage ? this.onerror?.() : this.onload?.());
        if (pendingImage && value.endsWith(CATS[0].file)) {
          pendingImages.push(finish);
        } else {
          queueMicrotask(finish);
        }
      }
    },
    console: { error: (...message) => audioErrors.push(message) },
    location: {
      reload: () => {
        reloaded = true;
      },
    },
  };
  const source = (await readFile(new URL('../dist/app.js', import.meta.url), 'utf8'))
    .replace(/^import[^\n]+\n/gm, '')
    .replace(
      'renderCollection();',
      'globalThis.api = { getGame: () => game, modal: () => modalKind, introActive: () => intro.active };\nrenderCollection();',
    );
  const loading = vm.runInNewContext(`(async () => { ${source} })()`, sandbox);
  if (!pendingImage) {
    await loading;
  } else {
    for (let i = 0; i < 12; i++) {
      await Promise.resolve();
    }
  }
  if (skipIntro) {
    get('intro-skip').fire('click');
  }
  return {
    get,
    document,
    window,
    api: sandbox.api,
    errors: audioErrors,
    loading,
    startupReady: () => startupReady,
    frame: (time) => raf(time),
    frameIntro: (time) => introFrame?.(time),
    expireIntro: () => expire(10000),
    expireLoad: () => expire(15000),
    expireVolumeClose: () => expire(180),
    finishPendingImages: () => pendingImages.forEach((finish) => finish()),
    reloaded: () => reloaded,
  };
}

test('seed input applies the same sequence in separate browsers and restarts from the first cat', async () => {
  const first = await harness(),
    second = await harness();
  for (const h of [first, second]) {
    h.get('seed-input').value = '  친구와-42  ';
    h.get('seed-form').fire('submit');
    assert.equal(h.api.getGame().seed, '친구와-42');
    assert.equal(h.get('seed-input').value, '친구와-42');
    assert.equal(h.api.getGame().bodies.size, 0);
  }
  const game = first.api.getGame();
  const initial = [game.current, game.next];
  assert.deepEqual(initial, [second.api.getGame().current, second.api.getGame().next]);
  first.get('game').fire('keydown', { key: 'Enter' });
  first.get('restart-button').fire('click');
  first.get('primary-button').fire('click');
  assert.deepEqual([game.current, game.next], initial);
  assert.equal(game.seed, '친구와-42');
});

test('editing or cancelling a seed leaves the active board and sequence unchanged', async () => {
  const h = await harness(),
    game = h.api.getGame();
  h.get('game').fire('keydown', { key: 'Enter' });
  const seed = game.seed,
    current = game.current,
    next = game.next;
  h.get('seed-input').value = 'new-seed';
  assert.equal(game.seed, seed);
  h.get('seed-form').fire('submit');
  assert.equal(h.api.modal(), 'restart');
  assert.equal(game.seed, seed);
  h.document.fire('keydown', { key: 'Escape' });
  assert.equal(game.seed, seed);
  assert.deepEqual([game.current, game.next], [current, next]);
  assert.equal(game.bodies.size, 1);
  assert.equal(h.get('seed-input').value, seed);
  assert.equal(game.state, 'playing');
});

test('seed confirmation survives help, changes the seed only on confirm, and blank input makes a shareable seed', async () => {
  const h = await harness(),
    game = h.api.getGame();
  h.get('game').fire('keydown', { key: 'Enter' });
  h.get('seed-input').value = '0';
  h.get('seed-form').fire('submit');
  h.get('help-button').fire('click');
  h.get('primary-button').fire('click');
  h.get('primary-button').fire('click');
  assert.equal(game.seed, '0');
  assert.equal(game.bodies.size, 0);
  assert.equal(game.score, 0);
  assert.equal(h.get('seed-input').disabled, false);
  h.get('seed-input').value = '   ';
  h.get('seed-form').fire('submit');
  assert.ok(game.seed.length > 0);
  assert.notEqual(game.seed, '0');
  assert.equal(h.get('seed-input').value, game.seed);
});

test('seed controls cannot reset a game while a modal or intro is active', async () => {
  const h = await harness({ skipIntro: false });
  const game = h.api.getGame(),
    seed = game.seed;
  h.get('seed-input').value = 'blocked';
  h.get('seed-form').fire('submit');
  assert.equal(game.seed, seed);
  h.get('intro-skip').fire('click');
  h.get('pause-button').fire('click');
  h.get('seed-form').fire('submit');
  assert.equal(game.seed, seed);
  assert.equal(game.state, 'paused');
});

test('cat rain, paws and title fade into play without accepting input during the transition', async () => {
  const h = await harness({ skipIntro: false });
  const game = h.api.getGame();
  assert.equal(
    h.startupReady(),
    true,
    'the app must acknowledge successful initialization to its independent guard',
  );
  assert.equal(h.get('overlay').hidden, true);
  assert.equal(h.api.modal(), null);
  h.get('game').fire('pointerdown', { pointerType: 'mouse' });
  assert.equal(game.state, 'ready');
  assert.equal(game.bodies.size, 0);
  assert.equal(h.get('game-layout').inert, true);
  h.frameIntro(0);
  h.frameIntro(1899);
  assert.equal(h.get('intro').classList.contains('is-paws'), false);
  h.frameIntro(1900);
  assert.equal(h.get('intro').classList.contains('is-paws'), true);
  h.frameIntro(3150);
  assert.equal(h.get('intro').classList.contains('is-title'), true);
  assert.equal(h.get('game-layout').classList.contains('intro-concealed'), true);
  h.frameIntro(4450);
  assert.equal(h.get('game-layout').classList.contains('intro-concealed'), false);
  assert.equal(h.get('game-layout').inert, true);
  h.frameIntro(5250);
  assert.equal(h.api.introActive(), true);
  assert.equal(h.get('intro').classList.contains('is-leaving'), true);
  assert.equal(h.get('game-layout').inert, true);
  h.get('game').fire('pointerdown', { pointerType: 'mouse' });
  assert.equal(game.state, 'ready');
  assert.equal(game.bodies.size, 0);
  h.frameIntro(6049);
  assert.equal(h.api.introActive(), true);
  h.frameIntro(6050);
  assert.equal(h.api.introActive(), false);
  assert.equal(h.get('intro').hidden, true);
  assert.equal(h.get('game-layout').inert, false);
  assert.equal(h.document.documentElement.classList.contains('intro-running'), false);
  assert.equal(h.document.activeElement, h.get('game'));
  assert.equal(game.state, 'playing');
  assert.equal(h.get('overlay').hidden, true);
  assert.equal(game.bodies.size, 0);
  h.get('game').fire('pointerdown', { pointerType: 'mouse' });
  assert.equal(game.bodies.size, 1);
  assert.equal(h.errors.length, 0);
});
test('skip, Escape and timeout each enter play once without dropping a cat', async () => {
  for (const exit of [
    (h) => h.get('intro-skip').fire('click'),
    (h) => h.window.fire('keydown', { key: 'Escape' }),
    (h) => h.expireIntro(),
  ]) {
    const h = await harness({ skipIntro: false });
    h.frameIntro(0);
    exit(h);
    h.frameIntro(5000);
    assert.equal(h.api.introActive(), false);
    assert.equal(h.get('intro').hidden, true);
    assert.equal(h.get('game-layout').inert, false);
    assert.equal(h.api.getGame().state, 'playing');
    assert.equal(h.api.getGame().bodies.size, 0);
    assert.equal(h.get('overlay').hidden, true);
  }
});
test('reduced motion shows a static pile and logo and enters play', async () => {
  const h = await harness({ skipIntro: false, reducedMotion: true });
  assert.equal(h.get('intro').classList.contains('is-reduced'), true);
  assert.equal(h.get('intro').classList.contains('is-title'), true);
  h.frameIntro(0);
  h.frameIntro(1000);
  assert.equal(h.api.introActive(), false);
  assert.equal(h.get('game-layout').inert, false);
  assert.equal(h.api.getGame().state, 'playing');
});

test('skipping while assets load starts play when loading completes', async () => {
  const h = await harness({ skipIntro: false, skipWhileLoading: true });
  assert.equal(h.api.introActive(), false);
  assert.equal(h.api.getGame().state, 'playing');
  assert.equal(h.get('toast').hidden, true);
  assert.equal(h.get('overlay').hidden, true);
  assert.equal(h.errors.length, 0);
});

test('help returns to the automatically started game without a welcome screen', async () => {
  const h = await harness();
  h.get('help-button').fire('click');
  assert.equal(h.api.modal(), 'help');
  assert.equal(h.api.getGame().state, 'paused');
  h.get('primary-button').fire('click');
  assert.equal(h.api.modal(), null);
  assert.equal(h.api.getGame().state, 'playing');
  assert.equal(h.get('overlay').hidden, true);
});

test('repeated help clicks after game over still return to a usable restart screen', async () => {
  const h = await harness(),
    game = h.api.getGame();
  const cat = game.addCat(0, 220, 100, { eligible: true });
  Matter.Body.setStatic(cat, true);
  for (let i = 0; i < 250; i++) {
    game.step();
  }
  assert.equal(game.state, 'over');
  assert.equal(h.api.modal(), 'over');
  h.get('help-button').fire('click');
  h.get('help-button').fire('click');
  h.get('primary-button').fire('click');
  assert.equal(h.api.modal(), 'over');
  h.get('primary-button').fire('click');
  assert.equal(game.state, 'playing');
  assert.equal(game.bodies.size, 0);
});

test('repeated help clicks during play return to play instead of an unwanted pause', async () => {
  const h = await harness();
  h.get('help-button').fire('click');
  h.get('help-button').fire('click');
  h.get('primary-button').fire('click');
  assert.equal(h.api.getGame().state, 'playing');
  assert.equal(h.api.modal(), null);
});

test('help opened from restart confirmation preserves its cancel destination', async () => {
  for (const paused of [false, true]) {
    const h = await harness(),
      game = h.api.getGame();
    if (paused) {
      h.get('pause-button').fire('click');
      h.get('secondary-button').fire('click');
    } else {
      h.get('restart-button').fire('click');
    }
    assert.equal(h.api.modal(), 'restart');
    h.get('help-button').fire('click');
    h.get('primary-button').fire('click');
    assert.equal(h.api.modal(), 'restart');
    h.get('secondary-button').fire('click');
    assert.equal(game.state, paused ? 'paused' : 'playing');
    assert.equal(h.api.modal(), paused ? 'pause' : null);
  }
});

test('a stalled cat image times out to retry and late image completion cannot start a hidden game', async () => {
  const h = await harness({ pendingImage: true });
  assert.equal(h.api.getGame().state, 'ready');
  assert.equal(h.expireLoad(), true, 'image loading must have a finite deadline');
  await h.loading;
  assert.equal(h.api.modal(), 'error');
  assert.equal(h.get('primary-button').disabled, false);
  h.finishPendingImages();
  await Promise.resolve();
  assert.equal(h.api.getGame().state, 'ready');
  assert.equal(h.api.modal(), 'error');
  h.get('primary-button').fire('click');
  assert.equal(h.reloaded(), true);
});

test('a slow image completing after the intro watchdog still starts once and clears its deadline', async () => {
  const h = await harness({ pendingImage: true, skipIntro: false });
  assert.equal(h.expireIntro(), true);
  assert.equal(h.api.getGame().state, 'ready');
  h.finishPendingImages();
  await h.loading;
  assert.equal(h.api.getGame().state, 'playing');
  assert.equal(h.api.modal(), null);
  assert.equal(h.get('toast').hidden, true);
  assert.equal(h.expireLoad(), false);
  assert.equal(h.api.getGame().bodies.size, 0);
});

test('a stale tab cannot replace a higher saved score with its lower score', async () => {
  const stored = { 'nyang-drop.best': '0' };
  const h = await harness({ stored }),
    game = h.api.getGame();
  // Another tab establishes a higher record after this one has already loaded.
  stored['nyang-drop.best'] = '1000';
  game.addCat(0, 200, 500);
  game.addCat(0, 235, 500);
  game.step();
  assert.equal(game.score, 10);
  assert.equal(stored['nyang-drop.best'], '1000');
  h.frame(16);
  assert.equal(h.get('best').textContent, '1,000');
  assert.equal(h.get('best-mobile').textContent, '1,000');
});

test('storage notifications update the record without changing the active game', async () => {
  const stored = { 'nyang-drop.best': '0' };
  const h = await harness({ stored });
  stored['nyang-drop.best'] = '2000';
  h.window.fire('storage', { key: 'nyang-drop.best', newValue: '2000' });
  assert.equal(h.get('best').textContent, '2,000');
  assert.equal(h.api.getGame().state, 'playing');
  assert.equal(h.api.getGame().bodies.size, 0);
});

test('racing record writes converge to the higher score without repeated writes', async () => {
  const stored = { 'nyang-drop.best': '0' };
  const first = await harness({ stored }),
    second = await harness({ stored });
  // A lower write lands before the other tab receives the higher-score event.
  stored['nyang-drop.best'] = '10';
  second.window.fire('storage', { key: 'nyang-drop.best', newValue: '1000' });
  assert.equal(stored['nyang-drop.best'], '1000');
  first.window.fire('storage', { key: 'nyang-drop.best', newValue: '10' });
  assert.equal(stored['nyang-drop.best'], '1000');
  assert.equal(first.get('best').textContent, '1,000');
  assert.equal(second.get('best').textContent, '1,000');
});

test('actual app starts with storage blocked, responds to touch drag and cancels aborted gestures', async () => {
  const h = await harness();
  const board = h.get('game'),
    game = h.api.getGame();
  assert.equal(h.get('overlay').hidden, true);
  assert.equal(game.state, 'playing');
  board.fire('pointerdown', { clientX: 100 });
  board.fire('pointermove', { clientX: 300 });
  assert.equal(game.bodies.size, 0);
  board.fire('pointerup', { clientX: 300 });
  assert.equal(game.bodies.size, 1);
  assert.equal([...game.bodies.values()][0].position.x, 300);
  for (let i = 0; i < 90; i++) {
    game.step();
  }
  board.fire('pointerdown');
  board.fire('pointercancel');
  board.fire('pointerup');
  assert.equal(game.bodies.size, 1);
  board.fire('pointerdown');
  board.fire('pointerup', { clientX: -20 });
  assert.equal(game.bodies.size, 1);
  assert.equal(h.errors.length, 0);
});
test('touch during cooldown is not saved for release after the cooldown', async () => {
  const h = await harness();
  const board = h.get('game'),
    game = h.api.getGame();
  board.fire('pointerdown');
  board.fire('pointerup');
  assert.equal(game.bodies.size, 1);
  board.fire('pointerdown');
  for (let i = 0; i < 90; i++) {
    game.step();
  }
  board.fire('pointerup');
  assert.equal(game.bodies.size, 1);
});
test('secondary touch cannot place a cat, and mouse click drops immediately', async () => {
  const h = await harness();
  const board = h.get('game'),
    game = h.api.getGame();
  board.fire('pointerdown', { pointerId: 2, isPrimary: false });
  board.fire('pointerup', { pointerId: 2, isPrimary: false });
  assert.equal(game.bodies.size, 0);
  board.fire('pointerdown', { pointerType: 'mouse', clientX: 180 });
  assert.equal(game.bodies.size, 1);
});
test('Escape pause stays paused even when the event bubbles to document', async () => {
  const h = await harness();
  const event = h.get('game').fire('keydown', { key: 'Escape', repeat: false });
  h.document.fire('keydown', event);
  assert.equal(h.api.getGame().state, 'paused');
  assert.equal(h.api.modal(), 'pause');
  h.get('primary-button').fire('click');
  assert.equal(h.api.getGame().state, 'playing');
});
test('switching tabs cancels an unfinished gesture without pausing the game', async () => {
  const h = await harness();
  const game = h.api.getGame();
  h.get('game').fire('pointerdown');
  h.document.hidden = true;
  h.document.fire('visibilitychange');
  assert.equal(game.state, 'playing');
  h.document.hidden = false;
  h.document.fire('visibilitychange');
  h.get('game').fire('pointerup');
  assert.equal(game.state, 'playing');
  assert.equal(game.bodies.size, 0);
  assert.equal(h.api.modal(), null);
  assert.equal(h.get('overlay').hidden, true);
  h.get('game').fire('pointerdown');
  h.get('game').fire('pointerup');
  assert.equal(game.bodies.size, 1);
});
test('focus changes, resize and page restore keep playing without accumulating background time', async () => {
  const h = await harness();
  const game = h.api.getGame();
  h.get('game').fire('pointerdown', { pointerType: 'mouse' });
  h.frame(16);
  h.frame(32);
  const before = game.time;
  h.window.fire('blur');
  h.window.fire('resize');
  h.window.fire('pagehide');
  h.window.fire('pageshow');
  h.frame(60000);
  assert.equal(game.time, before);
  h.frame(60017);
  assert.ok(game.time > before && game.time < before + 30);
  assert.equal(game.state, 'playing');
  assert.equal(h.api.modal(), null);
});
test('manual pause is preserved across a tab switch', async () => {
  const h = await harness();
  const game = h.api.getGame();
  h.get('pause-button').fire('click');
  assert.equal(game.state, 'paused');
  h.document.hidden = true;
  h.document.fire('visibilitychange');
  h.window.fire('blur');
  h.document.hidden = false;
  h.document.fire('visibilitychange');
  h.frame(10000);
  assert.equal(game.state, 'paused');
  assert.equal(h.api.modal(), 'pause');
  h.get('primary-button').fire('click');
  assert.equal(game.state, 'playing');
});
test('restart confirmation resets the active board and keyboard drop remains available', async () => {
  const h = await harness();
  const game = h.api.getGame();
  h.get('game').fire('keydown', { key: ' ', repeat: false });
  assert.equal(game.bodies.size, 1);
  h.get('restart-button').fire('click');
  assert.equal(h.api.modal(), 'restart');
  assert.equal(game.state, 'paused');
  h.get('primary-button').fire('click');
  assert.equal(game.bodies.size, 0);
  assert.equal(game.state, 'playing');
  h.get('game').fire('keydown', { key: 'Enter', repeat: false });
  assert.equal(game.bodies.size, 1);
  h.frame(16);
  h.frame(32);
  assert.equal(h.errors.length, 0);
});
test('missing asset produces a usable retry state rather than starting invisibly', async () => {
  const h = await harness({ brokenImage: true });
  assert.equal(h.api.modal(), 'error');
  assert.equal(h.get('primary-button').disabled, false);
  h.get('primary-button').fire('click');
  assert.equal(h.reloaded(), true);
  assert.equal(h.errors.length, 1);
});

test('speaker hover and touch open volume without changing the game or mute state', async () => {
  const stored = { 'nyang-drop.music-volume': '23', 'nyang-drop.effects-volume': '67' };
  const h = await harness({ stored });
  const game = h.api.getGame();
  const before = [game.seed, game.current, game.next, game.time, game.state];
  assert.equal(h.get('volume-panel').hidden, true);
  h.get('volume-control').fire('pointerenter', { pointerType: 'mouse' });
  assert.equal(h.get('volume-panel').hidden, false);
  assert.equal(h.get('volume-button').attributes['aria-expanded'], 'true');
  assert.equal(stored['nyang-drop.muted'], undefined);
  assert.equal(h.get('music-volume-value').textContent, '23%');
  assert.equal(h.get('effects-volume-value').textContent, '67%');
  h.get('music-volume').fire('input', { target: { value: '12' } });
  h.get('effects-volume').fire('input', { target: { value: '0' } });
  assert.equal(stored['nyang-drop.music-volume'], '12');
  assert.equal(stored['nyang-drop.effects-volume'], '0');
  assert.equal(h.get('music-volume').attributes['aria-valuetext'], '12%');
  h.get('sound-toggle').fire('click');
  assert.equal(h.get('volume-button').attributes['aria-label'], '볼륨 조절 · 음소거 중');
  h.get('sound-toggle').fire('click');
  assert.equal(h.get('volume-button').attributes['aria-label'], '볼륨 조절');
  h.get('volume-control').fire('pointerleave');
  h.expireVolumeClose();
  assert.equal(h.get('volume-panel').hidden, true);
  h.get('volume-button').fire('click');
  assert.equal(h.get('volume-panel').hidden, false);
  assert.equal(h.document.activeElement, h.get('music-volume'));
  const escape = h.get('volume-control').fire('keydown', { key: 'Escape' });
  h.document.fire('keydown', escape);
  assert.equal(h.get('volume-panel').hidden, true);
  assert.equal(h.document.activeElement, h.get('volume-button'));
  assert.deepEqual([game.seed, game.current, game.next, game.time, game.state], before);
  assert.equal(game.bodies.size, 0);
  h.get('volume-button').fire('click');
  h.document.fire('pointerdown', { target: h.get('game') });
  assert.equal(h.get('volume-panel').hidden, true);
  const reloaded = await harness({ stored });
  assert.equal(reloaded.get('music-volume-value').textContent, '12%');
  assert.equal(reloaded.get('effects-volume-value').textContent, '0%');
});

test('moving into volume controls cancels hover dismissal and focused sliders stay open', async () => {
  const h = await harness();
  h.get('volume-control').fire('pointerenter', { pointerType: 'touch' });
  assert.equal(h.get('volume-panel').hidden, true);
  h.get('volume-control').fire('pointerenter', { pointerType: 'mouse' });
  h.get('volume-control').fire('pointerleave');
  h.get('volume-control').fire('pointerenter', { pointerType: 'mouse' });
  assert.equal(h.expireVolumeClose(), false);
  assert.equal(h.get('volume-panel').hidden, false);
  h.get('volume-button').fire('click');
  h.get('volume-control').fire('pointerleave');
  h.expireVolumeClose();
  assert.equal(h.get('volume-panel').hidden, false);
  h.get('volume-control').fire('focusout', { relatedTarget: h.get('effects-volume') });
  assert.equal(h.get('volume-panel').hidden, false);
  h.get('volume-control').fire('focusout', { relatedTarget: h.get('settings-button') });
  assert.equal(h.get('volume-panel').hidden, true);
});

test('settings and volume are exclusive and modal focus stays in the front panel', async () => {
  const h = await harness();
  h.get('help-button').fire('click');
  h.get('settings-button').fire('click');
  assert.equal(h.get('game-settings').hidden, false);
  const tab = h.document.fire('keydown', { key: 'Tab' });
  assert.notEqual(tab.defaultPrevented, true);
  h.get('seed-apply').disabled = false;
  h.get('seed-apply').focus();
  h.document.fire('keydown', { key: 'Tab' });
  assert.equal(h.document.activeElement, h.get('settings-close'));
  h.get('volume-button').fire('click');
  assert.equal(h.get('game-settings').hidden, true);
  assert.equal(h.get('volume-panel').hidden, false);
  h.get('sound-toggle').focus();
  h.document.fire('keydown', { key: 'Tab' });
  assert.equal(h.document.activeElement, h.get('volume-close'));
  const escape = h.get('volume-control').fire('keydown', { key: 'Escape' });
  h.document.fire('keydown', escape);
  assert.equal(h.api.modal(), 'help');
  h.get('primary-button').fire('click');
  assert.equal(h.api.getGame().state, 'playing');
  h.get('volume-button').fire('click');
  h.get('settings-button').fire('click');
  assert.equal(h.get('volume-panel').hidden, true);
  assert.equal(h.get('game-settings').hidden, false);
});

test('hitbox preference survives reloads and never changes the seeded game', async () => {
  const stored = {};
  const h = await harness({ stored });
  const game = h.api.getGame();
  game.drop();
  const snapshot = () => [
    game.seed,
    game.current,
    game.next,
    game.time,
    game.score,
    game.state,
    ...[...game.bodies.values()].flatMap((body) => [body.id, body.position.x, body.position.y]),
  ];
  const before = snapshot();
  assert.equal(h.get('hitbox-toggle').checked, false);
  h.get('hitbox-toggle').fire('change', { target: { checked: true } });
  assert.equal(stored['nyang-drop.hitboxes'], 'true');
  assert.deepEqual(snapshot(), before);
  const reloaded = await harness({ stored });
  assert.equal(reloaded.get('hitbox-toggle').checked, true);
  h.get('hitbox-toggle').fire('change', { target: { checked: false } });
  assert.deepEqual(snapshot(), before);
  const hiddenAgain = await harness({ stored });
  assert.equal(hiddenAgain.get('hitbox-toggle').checked, false);
  const blocked = await harness();
  blocked.get('hitbox-toggle').fire('change', { target: { checked: true } });
  assert.equal(blocked.get('hitbox-toggle').checked, true);
  assert.equal(blocked.errors.length, 0);
});

test('applying the seed from settings closes the panel and resets only on confirmation', async () => {
  const h = await harness();
  h.get('settings-button').fire('click');
  h.get('seed-input').value = 'settings-seed';
  h.get('seed-form').fire('submit');
  assert.equal(h.api.getGame().seed, 'settings-seed');
  assert.equal(h.get('game-settings').hidden, true);
  h.api.getGame().drop();
  h.get('settings-button').fire('click');
  h.get('seed-input').value = 'replacement';
  h.get('seed-form').fire('submit');
  assert.equal(h.get('game-settings').hidden, true);
  assert.equal(h.api.modal(), 'restart');
  assert.equal(h.api.getGame().seed, 'settings-seed');
  h.get('secondary-button').fire('click');
  assert.equal(h.api.getGame().seed, 'settings-seed');
  assert.equal(h.get('seed-input').value, 'settings-seed');
  assert.equal(h.api.getGame().bodies.size, 1);
});

test('next preview defaults off and remembers both on and off across visits', async () => {
  const stored = {};
  const h = await harness({ stored });
  assert.equal(h.get('next-preview-toggle').checked, false);
  assert.equal(h.get('next-preview-desktop').hidden, true);
  assert.equal(h.get('next-preview-mobile').hidden, true);
  h.get('settings-button').fire('click');
  h.get('next-preview-toggle').fire('change', { target: { checked: true } });
  assert.equal(stored['nyang-drop.next-preview'], 'true');
  const reloaded = await harness({ stored });
  assert.equal(reloaded.get('next-preview-toggle').checked, true);
  for (const suffix of ['desktop', 'mobile']) {
    assert.equal(reloaded.get(`next-preview-${suffix}`).hidden, false);
    const cat = CATS[reloaded.api.getGame().next];
    assert.equal(reloaded.get(`next-image-${suffix}`).src, `./assets/${cat.file}`);
    assert.equal(reloaded.get(`next-name-${suffix}`).textContent, cat.name);
  }
  reloaded.get('next-preview-toggle').fire('change', { target: { checked: false } });
  assert.equal(stored['nyang-drop.next-preview'], 'false');
  const hiddenAgain = await harness({ stored });
  assert.equal(hiddenAgain.get('next-preview-desktop').hidden, true);
  assert.equal(hiddenAgain.get('next-preview-mobile').hidden, true);
});

test('preview reads the seeded queue without changing it and refreshes after repeated cats', async () => {
  const h = await harness({ stored: { 'nyang-drop.next-preview': 'true' } });
  h.get('seed-input').value = 'preview-queue';
  h.get('seed-form').fire('submit');
  const game = h.api.getGame();
  const reference = new CatGame(Matter, { seed: game.seed });
  reference.start();
  let repeatedCurrent = false;
  for (let i = 0; i < 20; i++) {
    const before = [
      game.seed,
      game.current,
      game.next,
      game.score,
      game.time,
      game.bodies.size,
      game.state,
    ];
    for (const checked of [false, true]) {
      h.get('next-preview-toggle').fire('change', { target: { checked } });
      assert.deepEqual(
        [game.seed, game.current, game.next, game.score, game.time, game.bodies.size, game.state],
        before,
      );
    }
    const previousCurrent = game.current;
    const previousNext = game.next;
    game.time = game.cooldownUntil;
    reference.time = reference.cooldownUntil;
    assert.equal(game.drop(), true);
    assert.equal(reference.drop(), true);
    h.frame(0);
    assert.deepEqual([game.current, game.next], [reference.current, reference.next]);
    repeatedCurrent ||= previousCurrent === game.current && previousNext !== game.next;
    for (const suffix of ['desktop', 'mobile']) {
      assert.equal(h.get(`next-image-${suffix}`).src, `./assets/${CATS[game.next].file}`);
      assert.equal(h.get(`next-level-${suffix}`).textContent, `${game.next + 1}단계`);
    }
  }
  assert.equal(repeatedCurrent, true);
});

test('preview switch still works when browser storage is blocked', async () => {
  const h = await harness();
  h.get('next-preview-toggle').fire('change', { target: { checked: true } });
  assert.equal(h.get('next-preview-desktop').hidden, false);
  h.get('next-preview-toggle').fire('change', { target: { checked: false } });
  assert.equal(h.get('next-preview-mobile').hidden, true);
  assert.equal(h.api.getGame().state, 'playing');
  assert.equal(h.errors.length, 0);
});

test('settings markup labels the switch and keeps preview hidden before startup', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['settings-button', 'game-settings', 'settings-close', 'next-preview-toggle']) {
    assert.ok(ids.includes(id));
  }
  assert.match(html, /for="next-preview-toggle"/);
  assert.match(html, /id="next-preview-toggle"[^>]*type="checkbox"[^>]*role="switch"/);
  for (const suffix of ['desktop', 'mobile']) {
    assert.match(html, new RegExp(`id="next-preview-${suffix}"[^>]*\\bhidden`));
  }
});

test('seed and hitbox controls belong to settings while volume belongs to the speaker', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const settings = /id="game-settings"[\s\S]*?<\/section>/.exec(html)[0];
  const volume = /id="volume-panel"[\s\S]*?<\/section>/.exec(html)[0];
  assert.equal((html.match(/id="seed-form"/g) || []).length, 1);
  assert.match(settings, /id="seed-form"/);
  assert.match(settings, /id="hitbox-toggle"[^>]*type="checkbox"[^>]*role="switch"/);
  assert.doesNotMatch(settings, /id="music-volume"|id="effects-volume"/);
  assert.match(volume, /id="music-volume"/);
  assert.match(volume, /id="effects-volume"/);
  assert.doesNotMatch(volume, /id="seed-input"/);
});
