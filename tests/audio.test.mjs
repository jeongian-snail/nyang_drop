import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGameAudio } from '../dist/audio.js';
import Matter from 'matter-js';
import { CatGame } from '../dist/game-core.js';

// Deterministic Web Audio clock: verifies lifecycle/voice scheduling, not audible quality.
function harness({
  muted = false,
  musicVolume = 0.6,
  effectsVolume = 0.8,
  failedSamples = false,
  blockedResume = false,
  brokenSetup = false,
} = {}) {
  const sources = [],
    contexts = [],
    gains = [],
    timers = new Map();
  let timerId = 0;
  class Param {
    value = 1;
    setValueAtTime(value) {
      this.value = value;
    }
    exponentialRampToValueAtTime(value) {
      this.value = value;
    }
    cancelScheduledValues() {}
    setTargetAtTime(value) {
      this.value = value;
    }
  }
  class Node {
    gain = new Param();
    frequency = new Param();
    playbackRate = new Param();
    threshold = new Param();
    knee = new Param();
    ratio = new Param();
    attack = new Param();
    release = new Param();
    connect() {}
    disconnect() {}
    setPeriodicWave() {}
    start(at) {
      this.started = at;
    }
    stop(at) {
      this.stopAt = at;
    }
  }
  class AudioContext {
    state = 'suspended';
    currentTime = 0;
    sampleRate = 32000;
    destination = new Node();
    listeners = {};
    constructor() {
      contexts.push(this);
    }
    createGain() {
      if (brokenSetup) {
        throw new Error('Audio device initialization failed');
      }
      const node = new Node();
      gains.push(node);
      return node;
    }
    createDynamicsCompressor() {
      return new Node();
    }
    createPeriodicWave() {
      return {};
    }
    createBiquadFilter() {
      return new Node();
    }
    createBuffer(channels, length) {
      return { getChannelData: () => new Float32Array(length) };
    }
    createBufferSource() {
      const node = new Node();
      sources.push(node);
      return node;
    }
    createOscillator() {
      const node = new Node();
      node.oscillator = true;
      sources.push(node);
      return node;
    }
    decodeAudioData(bytes) {
      return Promise.resolve({ sample: new Uint8Array(bytes)[0], duration: 1 });
    }
    addEventListener(type, callback) {
      this.listeners[type] = callback;
    }
    close() {
      this.state = 'closed';
      this.listeners.statechange?.();
      return Promise.resolve();
    }
    resume() {
      if (blockedResume) {
        return Promise.reject(new Error('User gesture required'));
      }
      this.state = 'running';
      this.listeners.statechange?.();
      return Promise.resolve();
    }
  }
  let fetches = 0;
  const view = {
    AudioContext,
    setInterval(callback) {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearInterval(id) {
      timers.delete(id);
    },
  };
  const audio = createGameAudio({
    muted,
    musicVolume,
    effectsVolume,
    view,
    random: () => 0.4,
    fetchAudio: async (url) => {
      fetches++;
      if (failedSamples) {
        throw new Error('Offline');
      }
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array([Number(/meow-(\d)/.exec(url)[1])]).buffer,
      };
    },
  });
  const flush = async () => {
    for (let i = 0; i < 12; i++) {
      await Promise.resolve();
    }
  };
  return {
    audio,
    sources,
    contexts,
    gains,
    timers,
    flush,
    fetches: () => fetches,
    meows: () => sources.filter((source) => source.buffer?.sample),
    advance(seconds) {
      const context = contexts[0];
      context.currentTime += seconds;
      for (const source of sources) {
        if (!source.ended && source.stopAt <= context.currentTime) {
          source.ended = true;
          source.onended?.();
        }
      }
      for (const callback of [...timers.values()]) {
        callback();
      }
    },
  };
}

test('automatic game start is silent until a gesture; unlocking never duplicates the music loop', async () => {
  const h = harness();
  await h.audio.preload();
  h.audio.setPlaying(true);
  h.audio.setVisible(true);
  assert.equal(h.contexts.length, 0);
  assert.equal(h.fetches(), 4);
  h.audio.unlock();
  await h.flush();
  assert.equal(h.contexts.length, 1);
  assert.equal(h.timers.size, 1);
  for (let i = 0; i < 10; i++) {
    h.audio.unlock();
    h.audio.setPlaying(true);
  }
  assert.equal(h.contexts.length, 1);
  assert.equal(h.timers.size, 1);
  const initialNotes = h.sources.length;
  h.advance(0.3);
  assert.ok(h.sources.length > initialNotes);
});

test('mute, pause and backgrounding silence every voice and resume only when all allow it', async () => {
  const h = harness();
  h.audio.setPlaying(true);
  h.audio.unlock();
  await h.flush();
  h.audio.play('merge');
  h.audio.setMuted(true);
  assert.equal(h.timers.size, 0);
  assert.ok(h.sources.every((source) => source.stopAt <= 0.03));
  const count = h.sources.length;
  h.audio.play('merge');
  assert.equal(h.sources.length, count);
  h.audio.setVisible(false);
  h.audio.setMuted(false);
  assert.equal(h.timers.size, 0);
  h.audio.setPlaying(false);
  h.audio.setVisible(true);
  assert.equal(h.timers.size, 0);
  h.audio.setPlaying(true);
  assert.equal(h.timers.size, 1);
  h.audio.setVisible(false);
  h.advance(60);
  const before = h.sources.length;
  h.audio.setVisible(true);
  assert.equal(h.timers.size, 1);
  assert.ok(h.sources.length - before < 8, 'no burst of music notes from the background interval');
  assert.ok(h.sources.slice(before).every((source) => source.started >= 60));
});

test('saved mute preference prevents context creation until the user enables sound', async () => {
  const h = harness({ muted: true });
  h.audio.setPlaying(true);
  h.audio.unlock();
  assert.equal(h.contexts.length, 0);
  h.audio.setMuted(false);
  assert.equal(h.contexts.length, 0);
  h.audio.unlock();
  await h.flush();
  assert.equal(h.timers.size, 1);
});

test('merge calls use all four recordings without adjacent repeats and limit overlapping meows', async () => {
  const h = harness();
  h.audio.setPlaying(true);
  h.audio.unlock();
  await h.flush();
  for (let i = 0; i < 16; i++) {
    h.audio.play('merge', i % 10);
  }
  const meows = h.meows();
  assert.equal(meows.length, 16);
  for (let i = 0; i < 16; i += 4) {
    assert.equal(new Set(meows.slice(i, i + 4).map((node) => node.buffer.sample)).size, 4);
  }
  for (let i = 1; i < meows.length; i++) {
    assert.notEqual(meows[i].buffer.sample, meows[i - 1].buffer.sample);
  }
  assert.equal(meows.filter((node) => node.stopAt === undefined).length, 3);
  h.audio.setMuted(true);
  assert.ok(meows.every((node) => node.stopAt <= 0.03));
});

test('failed samples and blocked autoplay never block the game or leak rejected promises', async () => {
  const missing = harness({ failedSamples: true });
  missing.audio.setPlaying(true);
  missing.audio.unlock();
  await missing.flush();
  assert.doesNotThrow(() => missing.audio.play('merge'));
  assert.equal(missing.meows().length, 0);
  assert.equal(missing.timers.size, 1, 'original music is independent of sample loading');
  const blocked = harness({ blockedResume: true });
  blocked.audio.setPlaying(true);
  blocked.audio.unlock();
  await blocked.flush();
  assert.equal(blocked.timers.size, 0);
  assert.equal(blocked.sources.length, 0);
});

test('a full music loop stays within the scheduling window and survives audio interruption', async () => {
  const h = harness();
  h.audio.setPlaying(true);
  h.audio.unlock();
  await h.flush();
  for (let i = 0; i < 950; i++) {
    const before = h.sources.length;
    h.advance(0.04);
    for (const source of h.sources.slice(before)) {
      assert.ok(source.started >= h.contexts[0].currentTime);
      assert.ok(source.started < h.contexts[0].currentTime + 0.16);
    }
  }
  assert.equal(h.timers.size, 1);
  h.contexts[0].state = 'interrupted';
  h.contexts[0].listeners.statechange();
  assert.equal(h.timers.size, 0);
  h.audio.unlock();
  await h.flush();
  assert.equal(h.timers.size, 1);
});

test('all delivered cat recordings are valid short mono WAV files with headroom', async () => {
  for (let i = 1; i <= 4; i++) {
    const bytes = await readFile(new URL(`../dist/assets/audio/meow-${i}.wav`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WAVE');
    assert.equal(bytes.readUInt16LE(22), 1);
    assert.equal(bytes.readUInt32LE(24), 32000);
    const duration = bytes.readUInt32LE(40) / 64000;
    assert.ok(duration >= 0.5 && duration < 2);
    let peak = 0;
    for (let n = 44; n < bytes.length; n += 2) {
      peak = Math.max(peak, Math.abs(bytes.readInt16LE(n)));
    }
    assert.ok(peak >= 10000 && peak <= 22000, `sample ${i} has no clipping`);
  }
});

test('music and effects volumes change independently, including before unlock and while muted', async () => {
  const h = harness({ musicVolume: 0.2, effectsVolume: 0.9 });
  h.audio.setMusicVolume(0.25);
  h.audio.setEffectsVolume(0.5);
  assert.equal(h.contexts.length, 0);
  h.audio.setPlaying(true);
  h.audio.unlock();
  await h.flush();
  const [, music, effects] = h.gains;
  assert.equal(music.gain.value, 0.38 * 0.25);
  assert.equal(effects.gain.value, 0.68 * 0.5);
  const notes = h.sources.length;
  h.audio.setMusicVolume(0);
  assert.equal(music.gain.value, 0);
  assert.equal(effects.gain.value, 0.68 * 0.5);
  h.audio.setEffectsVolume(0.3);
  assert.equal(effects.gain.value, 0.68 * 0.3);
  assert.equal(h.sources.length, notes);
  assert.equal(h.timers.size, 1, 'moving a slider never restarts the loop');
  h.audio.setMuted(true);
  h.audio.setMusicVolume(0.75);
  h.audio.setEffectsVolume(0);
  assert.equal(h.timers.size, 0);
  h.audio.setMuted(false);
  assert.equal(music.gain.value, 0.38 * 0.75);
  assert.equal(effects.gain.value, 0);
  assert.equal(h.timers.size, 1);
});

test('an audio device exception during a merge cannot interrupt the physics step or lose its score', async () => {
  const h = harness();
  h.audio.setPlaying(true);
  h.audio.unlock();
  await h.flush();
  let failures = 0;
  h.contexts[0].createBufferSource = () => {
    failures++;
    throw new Error('Audio device unavailable');
  };
  const game = new CatGame(Matter, {
    onEvent: (event) => {
      if (event.type === 'merge') {
        h.audio.play('merge', event.level);
      }
    },
  });
  game.start();
  game.addCat(0, 200, 500);
  game.addCat(0, 235, 500);
  assert.doesNotThrow(() => game.step());
  assert.equal(game.score, 10);
  assert.equal(game.bodies.size, 1);
  assert.equal(h.contexts[0].state, 'closed');
  assert.equal(h.timers.size, 0);
  for (let i = 0; i < 120; i++) {
    game.step();
    h.audio.unlock();
    h.audio.play('merge');
  }
  assert.ok(game.time > 1000);
  assert.equal(game.score, 10);
  assert.equal(failures, 1);
});

test('audio scheduler failures stop the broken loop and leave control methods usable', async () => {
  const h = harness();
  h.audio.setPlaying(true);
  h.audio.unlock();
  await h.flush();
  h.contexts[0].createBufferSource = () => {
    throw new Error('Cannot create an audio node');
  };
  assert.doesNotThrow(() => h.advance(0.3));
  assert.equal(h.timers.size, 0);
  assert.equal(h.contexts[0].state, 'closed');
  assert.doesNotThrow(() => {
    h.audio.setMuted(true);
    h.audio.setVisible(false);
    h.audio.setPlaying(false);
    h.audio.setMusicVolume(0.1);
  });
});

test('a failure while stopping sound cannot block pause or leave an audio timer running', async () => {
  const h = harness();
  h.audio.setPlaying(true);
  h.audio.unlock();
  await h.flush();
  for (const gain of h.gains) {
    gain.gain.cancelScheduledValues = () => {
      throw new Error('Audio node disconnected');
    };
  }
  assert.doesNotThrow(() => h.audio.setPlaying(false));
  assert.equal(h.timers.size, 0);
  assert.equal(h.contexts[0].state, 'closed');
});

test('partially initialized audio is closed and never reused by later gestures', async () => {
  const h = harness({ brokenSetup: true });
  h.audio.setPlaying(true);
  assert.doesNotThrow(() => h.audio.unlock());
  assert.equal(h.contexts[0].state, 'closed');
  for (let i = 0; i < 3; i++) {
    h.audio.unlock();
    h.audio.setPlaying(true);
  }
  await h.flush();
  assert.equal(h.contexts.length, 1);
  assert.equal(h.timers.size, 0);
});
