import { visibleCatsTouch } from './merge-contact.js';
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
    const r = CATS[this.current].radius;
    this.aimX = clamp(x, RULES.left + r + 1, RULES.right - r - 1);
    return this.aimX;
  }
  get canDrop() {
    return this.state === 'playing' && this.time + 0.001 >= this.cooldownUntil;
  }
  addCat(level, x, y, { eligible = false, velocity, angle = 0 } = {}) {
    const { Bodies, Body, Composite } = this.M;
    const r = CATS[level].radius;
    const body = Bodies.circle(
      clamp(x, RULES.left + r, RULES.right - r),
      Math.min(y, RULES.floor - r),
      r,
      {
        label: 'cat',
        restitution: 0.15,
        friction: 0.32,
        frictionStatic: 0.7,
        frictionAir: 0.012,
        density: 0.001,
        slop: 0.03,
        sleepThreshold: 90,
      },
    );
    body.cat = { level, bornAt: this.time, eligible, popAt: this.time };
    if (velocity) {
      Body.setVelocity(body, velocity);
    }
    Body.setAngle(body, angle);
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
      if (body.cat.eligible && body.position.y - CATS[body.cat.level].radius < RULES.line) {
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
    // Sleeping collision pairs may be cached or inactive. Rebuild support from
    // current positions, bottom-up, so a floating group cannot support itself.
    // Circles are polygonal in Matter; tolerate their small edge gaps, not a
    // visible distance. Static side walls alone never count as a floor.
    const gap = 1.5;
    const floors = this.M.Composite.allBodies(this.engine.world).filter(
      (body) => body.isStatic && body.label === 'floor',
    );
    const grounded = [];
    const cats = [...this.bodies.values()].sort((a, b) => b.position.y - a.position.y);
    for (const body of cats) {
      const { x, y } = body.position,
        radius = body.circleRadius;
      const onFloor = floors.some(
        (floor) =>
          x >= floor.bounds.min.x &&
          x <= floor.bounds.max.x &&
          Math.abs(y + radius - floor.bounds.min.y) <= gap,
      );
      const supported =
        onFloor ||
        grounded.some((support) => {
          const dx = x - support.position.x,
            dy = support.position.y - y;
          return dy > 0.5 && dx * dx + dy * dy <= (radius + support.circleRadius + gap) ** 2;
        });
      if (body.isStatic || supported) {
        grounded.push(body);
      } else if (body.isSleeping) {
        this.M.Sleeping.set(body, false);
      }
    }
  }
  keepCatsInBounds() {
    // A merge can instantly enlarge a body inside a crowded stack. Resolve any
    // resulting wall penetration before testing contacts or drawing this step.
    for (const body of this.bodies.values()) {
      const radius = body.circleRadius,
        { x, y } = body.position;
      const nextX = clamp(x, RULES.left + radius, RULES.right - radius);
      const nextY = Math.min(y, RULES.floor - radius);
      if (nextX === x && nextY === y) {
        continue;
      }
      const velocity = { ...body.velocity };
      if ((x < nextX && velocity.x < 0) || (x > nextX && velocity.x > 0)) {
        velocity.x = 0;
      }
      if (y > nextY) {
        body.cat.eligible = true;
        if (velocity.y > 0) {
          velocity.y = 0;
        }
      }
      this.M.Body.setPosition(body, { x: nextX, y: nextY });
      this.M.Body.setVelocity(body, velocity);
    }
  }
  findVisibleContacts() {
    // Physics circles intentionally stay simple. Merge contact also follows the
    // actual opaque sprite outline, including ears, even for sleeping bodies.
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
      const x = (a.position.x + b.position.x) / 2,
        y = (a.position.y + b.position.y) / 2;
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
