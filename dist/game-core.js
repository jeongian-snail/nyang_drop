import { visibleCatsTouch } from './merge-contact.js?v=3';
import {
  createCatBody,
  catBounds,
  catOrigin,
  catSpawnRange,
  catSupported,
} from './cat-collider.js';
import { createSeededRandom, normalizeSeed } from './seed.js';
export { SPRITE } from './cat-outlines.js';

export const RULES = Object.freeze({
  width: 440,
  height: 650,
  left: 22,
  right: 418,
  floor: 622,
  line: 132,
  spawnY: 64,
  cooldown: 600,
  grace: 1000,
  danger: 2000,
  step: 1000 / 120,
});
export const CATS = Object.freeze([
  { name: '회색 태비', file: '01_gray_tabby.png', radius: 19, color: '#a6a49d' },
  { name: '치즈', file: '02_orange_tabby.png', radius: 25, color: '#edb789' },
  { name: '턱시도', file: '03_tuxedo.png', radius: 31, color: '#53524f' },
  { name: '삼색', file: '04_calico.png', radius: 38, color: '#d4ab83' },
  { name: '샴', file: '05_siamese.png', radius: 46, color: '#bbaa98' },
  { name: '하얀 고양이', file: '06_white.png', radius: 55, color: '#e0d8c8' },
  { name: '블루그레이', file: '07_blue_gray.png', radius: 65, color: '#8c9ba4' },
  { name: '브라운 태비', file: '08_brown_tabby.png', radius: 76, color: '#b58a67' },
  { name: '회색 패치', file: '09_gray_patch.png', radius: 88, color: '#9c9f9c' },
  { name: '거북무늬', file: '10_tortoiseshell.png', radius: 102, color: '#ba8b6e' },
]);
export const mergePoints = (level) => (level > 0 && level < 10 ? 10 * 2 ** (level - 1) : 0);
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export class CatGame {
  constructor(Matter, { seed = null, random = Math.random, onEvent = () => {} } = {}) {
    this.M = Matter;
    this.defaultRandom = random;
    this.seed = normalizeSeed(seed) || null;
    this.onEvent = onEvent;
    this.reset();
  }
  reset({ seed = this.seed } = {}) {
    this.seed = normalizeSeed(seed) || null;
    this.random = this.seed === null ? this.defaultRandom : createSeededRandom(this.seed);
    const { Engine, Events, Composite, Bodies } = this.M;
    if (this.engine) {
      Events.off(this.engine);
      Composite.clear(this.engine.world, false);
      Engine.clear(this.engine);
    }
    // Let settled stacks sleep instead of continually feeding tiny contact
    // corrections back into them. Support checks and merges wake them again.
    this.engine = Engine.create({
      enableSleeping: true,
      positionIterations: 10,
      velocityIterations: 8,
    });
    this.engine.gravity.y = 1.35;
    this.bodies = new Map();
    this.candidates = new Map();
    this.score = 0;
    this.time = 0;
    this.cooldownUntil = 0;
    this.dangerMs = 0;
    this.highest = 0;
    this.merges = 0;
    this.lastMergeAt = -Infinity;
    this.chain = 0;
    this.won = false;
    this.current = this.roll();
    this.next = this.roll();
    this.discovered = new Set();
    this.state = 'ready';
    this.aimX = RULES.width / 2;
    const wall = { isStatic: true, label: 'wall', friction: 0.35, restitution: 0.08 };
    Composite.add(this.engine.world, [
      Bodies.rectangle(RULES.left - 30, 300, 60, 1800, wall),
      Bodies.rectangle(RULES.right + 30, 300, 60, 1800, wall),
      Bodies.rectangle(220, RULES.floor + 30, 500, 60, { ...wall, label: 'floor' }),
    ]);
    const contacts = (event) => {
      for (const pair of event.pairs) {
        const a = pair.bodyA,
          b = pair.bodyB;
        for (const [cat, other] of [
          [a, b],
          [b, a],
        ]) {
          if (cat.cat && (other.cat || other.label === 'floor')) {
            cat.cat.eligible = true;
          }
        }
        if (a.cat && b.cat && a.cat.level === b.cat.level && a.cat.level < 9) {
          const ids = [a.id, b.id].sort((x, y) => x - y);
          this.candidates.set(ids.join(':'), ids);
        }
      }
    };
    Events.on(this.engine, 'collisionStart collisionActive', contacts);
  }
  roll() {
    return Math.floor(clamp(this.random(), 0, 0.999999) * 4);
  }
  start() {
    if (this.state === 'ready') {
      this.state = 'playing';
      this.onEvent({ type: 'start' });
    }
  }
  pause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.onEvent({ type: 'pause' });
    }
  }
  resume() {
    if (this.state === 'paused') {
      this.state = 'playing';
      this.onEvent({ type: 'resume' });
    }
  }
  aim(x) {
    const range = catSpawnRange(this.current, CATS[this.current].radius);
    this.aimX = clamp(x, RULES.left - range.minX + 1, RULES.right - range.maxX - 1);
    return this.aimX;
  }
  get canDrop() {
    return this.state === 'playing' && this.time + 0.001 >= this.cooldownUntil;
  }
  addCat(level, x, y, { eligible = false, velocity, angle = 0 } = {}) {
    const { Body, Composite } = this.M;
    const body = createCatBody(this.M, level, CATS[level].radius, x, y, {
      label: 'cat',
      restitution: 0.08,
      friction: 0.45,
      frictionStatic: 0.9,
      frictionAir: 0.012,
      density: 0.001,
      slop: 0.03,
      sleepThreshold: 90,
      angle,
    });
    Object.assign(body.cat, { bornAt: this.time, eligible, popAt: this.time });
    if (velocity) {
      Body.setVelocity(body, velocity);
    }
    this.keepCatInBounds(body);
    this.bodies.set(body.id, body);
    Composite.add(this.engine.world, body);
    this.highest = Math.max(this.highest, level);
    this.discovered.add(level);
    return body;
  }
  drop(x = this.aimX) {
    if (!this.canDrop) {
      return false;
    }
    this.aim(x);
    const body = this.addCat(this.current, this.aimX, RULES.spawnY, { velocity: { x: 0, y: 0.6 } });
    this.current = this.next;
    this.next = this.roll();
    this.cooldownUntil = this.time + RULES.cooldown;
    this.aim(this.aimX);
    this.onEvent({ type: 'drop', body });
    return true;
  }
  step(dt = RULES.step) {
    if (this.state !== 'playing' || !(dt > 0)) {
      return;
    }
    // Simulation time, cooldown and danger all advance together, never from wall-clock timers.
    this.time += dt;
    this.wakeUnsupportedCats();
    this.M.Engine.update(this.engine, dt);
    this.keepCatsInBounds();
    this.findVisibleContacts();
    this.resolveMerges();
    let overflow = false;
    for (const body of this.bodies.values()) {
      if (this.time - body.cat.bornAt >= RULES.grace) {
        body.cat.eligible = true;
      }
      if (body.cat.eligible && catBounds(body).minY < RULES.line) {
        overflow = true;
      }
    }
    this.dangerMs = overflow ? this.dangerMs + dt : 0;
    if (this.dangerMs + 0.001 >= RULES.danger) {
      this.state = 'over';
      this.onEvent({ type: 'over', score: this.score });
    }
  }
  wakeUnsupportedCats() {
    if (this.engine.gravity.y <= 0 || ![...this.bodies.values()].some((body) => body.isSleeping)) {
      return;
    }
    // Rebuild the support graph from current polygons, bottom-up. Cached contact
    // pairs and circular distances cannot tell whether a rotated chin is resting.
    const floors = this.M.Composite.allBodies(this.engine.world).filter(
      (body) => body.isStatic && body.label === 'floor',
    );
    const grounded = [];
    const cats = [...this.bodies.values()].sort((a, b) => b.position.y - a.position.y);
    const bounds = new Map([...floors, ...cats].map((body) => [body, catBounds(body)]));
    const supportedBy = (body, support) =>
      catSupported(body, support, 1.5, bounds.get(body), bounds.get(support));
    for (const body of cats) {
      const supported =
        floors.some((floor) => supportedBy(body, floor)) ||
        grounded.some((support) => supportedBy(body, support));
      if (body.isStatic || supported) {
        grounded.push(body);
      } else if (body.isSleeping) {
        this.M.Sleeping.set(body, false);
      }
    }
  }
  keepCatInBounds(body) {
    // Use current polygon vertices, not velocity-expanded Matter bounds or a
    // decorative circle. Otherwise wall corrections continuously drive rotation.
    const bounds = catBounds(body);
    const dx =
      bounds.minX < RULES.left
        ? RULES.left - bounds.minX
        : bounds.maxX > RULES.right
          ? RULES.right - bounds.maxX
          : 0;
    const dy = Math.min(0, RULES.floor - bounds.maxY);
    if (Math.abs(dx) < 0.000001 && Math.abs(dy) < 0.000001) {
      return;
    }
    const velocity = { ...body.velocity };
    if ((dx > 0 && velocity.x < 0) || (dx < 0 && velocity.x > 0)) {
      velocity.x = 0;
    }
    if (dy < 0) {
      body.cat.eligible = true;
      if (velocity.y > 0) {
        velocity.y = 0;
      }
    }
    this.M.Body.translate(body, { x: dx, y: dy });
    this.M.Body.setVelocity(body, velocity);
  }
  keepCatsInBounds() {
    for (const body of this.bodies.values()) {
      this.keepCatInBounds(body);
    }
  }
  findVisibleContacts() {
    // In addition to physical contacts, follow the opaque sprite outline for
    // same-level merges, including ears and already-sleeping bodies.
    const levels = Array.from({ length: 9 }, () => []);
    for (const body of this.bodies.values()) {
      if (body.cat.level < 9) {
        levels[body.cat.level].push(body);
      }
    }
    for (const bodies of levels) {
      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i],
            b = bodies[j];
          if (!visibleCatsTouch(a, b)) {
            continue;
          }
          const ids = [a.id, b.id].sort((x, y) => x - y);
          this.candidates.set(ids.join(':'), ids);
        }
      }
    }
  }
  resolveMerges() {
    const pairs = [...this.candidates.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    this.candidates.clear();
    for (const [aId, bId] of pairs) {
      const a = this.bodies.get(aId),
        b = this.bodies.get(bId);
      if (!a || !b || a.cat.level !== b.cat.level || a.cat.level >= 9) {
        continue;
      }
      const level = a.cat.level + 1;
      const originA = catOrigin(a),
        originB = catOrigin(b);
      const x = (originA.x + originB.x) / 2,
        y = (originA.y + originB.y) / 2;
      const velocity = {
        x: clamp((a.velocity.x + b.velocity.x) / 2, -3, 3),
        y: clamp((a.velocity.y + b.velocity.y) / 2, -2, 2),
      };
      for (const body of [a, b]) {
        this.bodies.delete(body.id);
        this.M.Composite.remove(this.engine.world, body);
      }
      // Also release any already-sleeping bodies when the support graph changes.
      for (const body of this.bodies.values()) {
        if (body.isSleeping) {
          this.M.Sleeping.set(body, false);
        }
      }
      const result = this.addCat(level, x, y, { eligible: true, velocity });
      const points = mergePoints(level);
      this.score += points;
      this.merges++;
      this.chain = this.time - this.lastMergeAt < 850 ? this.chain + 1 : 1;
      this.lastMergeAt = this.time;
      this.onEvent({ type: 'merge', body: result, level, points, chain: this.chain });
      if (level === 9 && !this.won) {
        this.won = true;
        this.onEvent({ type: 'win' });
      }
    }
  }
}
