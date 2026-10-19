// Original, lightly swung 16-bar loop. MIDI pitches; zero leaves a breath.
const MELODY = [
  [76, 0, 79, 81, 79, 76, 74, 0],
  [72, 0, 76, 79, 76, 74, 72, 0],
  [74, 0, 77, 79, 77, 74, 72, 0],
  [71, 74, 79, 0, 77, 74, 71, 0],
  [76, 79, 84, 0, 83, 79, 76, 0],
  [81, 0, 79, 76, 74, 72, 76, 0],
  [77, 0, 76, 74, 72, 0, 74, 71],
  [72, 0, 79, 0, 76, 0, 0, 0],
  [79, 0, 76, 79, 81, 79, 76, 0],
  [76, 0, 72, 76, 79, 76, 72, 0],
  [77, 79, 81, 0, 79, 77, 74, 0],
  [79, 0, 83, 81, 79, 77, 74, 0],
  [84, 0, 83, 79, 81, 79, 76, 0],
  [81, 79, 76, 0, 74, 72, 76, 0],
  [77, 0, 76, 74, 71, 0, 74, 79],
  [76, 74, 72, 0, 72, 0, 0, 0],
];
const HARMONY = [
  [48, 60, 64, 67],
  [45, 60, 64, 69],
  [50, 62, 65, 69],
  [43, 59, 62, 67],
  [48, 60, 64, 67],
  [45, 60, 64, 69],
  [41, 60, 65, 69],
  [43, 59, 62, 67],
  [48, 60, 64, 67],
  [45, 60, 64, 69],
  [50, 62, 65, 69],
  [43, 59, 62, 67],
  [48, 60, 64, 67],
  [45, 60, 64, 69],
  [43, 59, 62, 65],
  [48, 60, 64, 67],
];
const EIGHTH = 60 / 116 / 2;
const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);
const SAMPLE_URLS = [1, 2, 3, 4].map(
  (i) => new URL(`./assets/audio/meow-${i}.wav`, import.meta.url).href,
);

export function createGameAudio({
  muted = false,
  musicVolume = 0.6,
  effectsVolume = 0.8,
  view = window,
  fetchAudio = (url) => fetch(url),
  random = Math.random,
} = {}) {
  const volume = (value) =>
    Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : 0;
  musicVolume = volume(musicVolume);
  effectsVolume = volume(effectsVolume);
  let context, musicBus, effectsBus, malletWave, shakerBuffer;
  let playing = false,
    visible = true,
    timer = null,
    nextTime = 0,
    step = 0;
  let files,
    decoding,
    resuming,
    buffers = [],
    bag = [],
    lastMeow = -1;
  let failed = false;
  const musicVoices = new Set(),
    effectVoices = new Set(),
    meows = new Set();

  // Sound is optional. A device/node failure must never escape into a merge,
  // pause dialog, or the game's animation loop. Retire this audio session on
  // genuine API failures; ordinary autoplay rejection remains retryable.
  function disableSound() {
    if (failed) {
      return;
    }
    failed = true;
    if (timer !== null) {
      view.clearInterval(timer);
      timer = null;
    }
    for (const voice of [...musicVoices, ...effectVoices]) {
      try {
        voice.source.stop();
      } catch {
        // An ended source can reject a repeated stop during device cleanup.
      }
      for (const node of [voice.source, voice.gain, ...voice.cleanup]) {
        try {
          node.disconnect();
        } catch {
          // Continue cleaning the other nodes if this node is disconnected.
        }
      }
    }
    musicVoices.clear();
    effectVoices.clear();
    meows.clear();
    try {
      Promise.resolve(context?.close()).catch(() => {});
    } catch {
      // The context may already be closed after an audio device failure.
    }
  }
  const protect =
    (action) =>
    (...args) => {
      if (failed) {
        return;
      }
      try {
        return action(...args);
      } catch {
        disableSound();
      }
    };
  const safeTick = protect(tick),
    safeSync = protect(sync);

  // Fetch independently of the game load and only create AudioContext in unlock(),
  // called synchronously from a real pointer/keyboard/click gesture.
  function preload() {
    files ??= Promise.all(
      SAMPLE_URLS.map(async (url) => {
        try {
          const response = await fetchAudio(url);
          return response.ok ? await response.arrayBuffer() : null;
        } catch {
          return null;
        }
      }),
    );
    return files;
  }
  function decode() {
    if (decoding || !context) {
      return decoding;
    }
    decoding = preload()
      .then((data) =>
        Promise.all(
          data.map(async (bytes) => {
            if (!bytes) {
              return null;
            }
            try {
              return await context.decodeAudioData(bytes);
            } catch {
              return null;
            }
          }),
        ),
      )
      .then((decoded) => {
        buffers = decoded.filter(Boolean);
      });
    return decoding;
  }
  function createContext() {
    const AudioContext = view.AudioContext || view.webkitAudioContext;
    if (!AudioContext) {
      return;
    }
    context = new AudioContext();
    const master = context.createGain(),
      limiter = context.createDynamicsCompressor();
    master.gain.value = 0.8;
    limiter.threshold.value = -12;
    limiter.knee.value = 10;
    limiter.ratio.value = 3;
    limiter.attack.value = 0.008;
    limiter.release.value = 0.14;
    musicBus = context.createGain();
    musicBus.gain.value = 0.38 * musicVolume;
    effectsBus = context.createGain();
    effectsBus.gain.value = 0.68 * effectsVolume;
    musicBus.connect(master);
    effectsBus.connect(master);
    master.connect(limiter);
    limiter.connect(context.destination);
    malletWave = context.createPeriodicWave(
      new Float32Array(5),
      new Float32Array([0, 1, 0.16, 0.22, 0.035]),
    );
    shakerBuffer = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * 0.055),
      context.sampleRate,
    );
    const noise = shakerBuffer.getChannelData(0);
    for (let i = 0; i < noise.length; i++) {
      noise[i] = (random() * 2 - 1) * (1 - i / noise.length) ** 2;
    }
    context.addEventListener('statechange', safeSync);
    decode();
  }
  const wanted = () => !failed && playing && visible && !muted;
  const audible = () => wanted() && context?.state === 'running';

  function track(source, gain, collection, cleanup = []) {
    const voice = { source, gain, cleanup, stopped: false };
    collection.add(voice);
    source.onended = protect(() => {
      collection.delete(voice);
      meows.delete(voice);
      source.disconnect();
      gain.disconnect();
      cleanup.forEach((node) => node.disconnect());
    });
    return voice;
  }
  function stopVoice(voice) {
    if (voice.stopped) {
      return;
    }
    voice.stopped = true;
    const now = context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, 0.006);
    try {
      voice.source.stop(now + 0.03);
    } catch {
      /* Already ended. */
    }
    meows.delete(voice);
  }
  function silence() {
    if (timer !== null) {
      view.clearInterval(timer);
      timer = null;
    }
    for (const voice of musicVoices) {
      stopVoice(voice);
    }
    for (const voice of effectVoices) {
      stopVoice(voice);
    }
  }
  function note(midi, at, duration, volume, type = 'mallet', collection = musicVoices) {
    const source = context.createOscillator(),
      gain = context.createGain();
    if (type === 'mallet') {
      source.setPeriodicWave(malletWave);
    } else {
      source.type = type;
    }
    source.frequency.setValueAtTime(frequency(midi), at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + 0.009);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(gain);
    gain.connect(collection === musicVoices ? musicBus : effectsBus);
    track(source, gain, collection);
    source.start(at);
    source.stop(at + duration + 0.01);
  }
  function shaker(at, accent) {
    const source = context.createBufferSource(),
      filter = context.createBiquadFilter(),
      gain = context.createGain();
    source.buffer = shakerBuffer;
    filter.type = 'highpass';
    filter.frequency.value = 5000;
    gain.gain.setValueAtTime(accent ? 0.037 : 0.018, at);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(musicBus);
    track(source, gain, musicVoices, [filter]);
    source.start(at);
    source.stop(at + 0.06);
  }
  function scheduleStep(at) {
    const bar = Math.floor(step / 8) % MELODY.length,
      beat = step % 8;
    const melody = MELODY[bar][beat],
      chord = HARMONY[bar];
    if (melody) {
      note(melody, at, 0.3, beat % 2 ? 0.13 : 0.17);
    }
    if (beat === 0 || beat === 4) {
      note(chord[0] + (beat === 4 ? 7 : 0), at, 0.35, 0.23, 'sine');
    }
    if (beat === 2 || beat === 6) {
      chord.slice(1).forEach((pitch, i) => note(pitch, at + i * 0.012, 0.19, 0.055));
    }
    if (beat % 2 || beat === 0 || beat === 4) {
      shaker(at, beat === 2 || beat === 6 || beat === 4);
    }
    step = (step + 1) % (MELODY.length * 8);
    nextTime += EIGHTH + (beat % 2 ? -0.018 : 0.018);
  }
  function tick() {
    if (!audible()) {
      silence();
      return;
    }
    // Never catch up missed notes after a suspended tab or an interrupted phone.
    if (nextTime < context.currentTime) {
      nextTime = context.currentTime + 0.025;
    }
    while (nextTime < context.currentTime + 0.13) {
      scheduleStep(nextTime);
    }
  }
  function sync() {
    if (!audible()) {
      silence();
      return;
    }
    if (timer !== null) {
      return;
    }
    nextTime = context.currentTime + 0.04;
    safeTick();
    if (!failed) {
      timer = view.setInterval(safeTick, 40);
    }
  }
  function wake() {
    safeSync();
    if (
      !wanted() ||
      !context ||
      context.state === 'closed' ||
      context.state === 'running' ||
      resuming
    ) {
      return;
    }
    try {
      resuming = Promise.resolve(context.resume())
        .then(safeSync, () => {})
        .finally(() => {
          resuming = null;
        });
    } catch {
      /* Retry on the next user gesture if the browser blocks audio. */
    }
  }
  function unlock() {
    if (muted || !visible) {
      return;
    }
    if (!context) {
      createContext();
    }
    // Resume during this gesture even if it happens while the intro is showing.
    if (context && context.state !== 'running' && context.state !== 'closed') {
      Promise.resolve(context.resume()).then(safeSync, () => {});
    }
    safeSync();
  }
  function nextMeow() {
    if (!bag.length) {
      bag = buffers.map((_, i) => i);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag.length > 1 && bag.at(-1) === lastMeow) {
        [bag[0], bag[bag.length - 1]] = [bag.at(-1), bag[0]];
      }
    }
    lastMeow = bag.pop();
    return buffers[lastMeow];
  }
  function play(kind, level = 0) {
    if (!audible()) {
      return;
    }
    const now = context.currentTime;
    if (kind === 'merge') {
      if (!buffers.length) {
        return;
      }
      while (meows.size >= 3) {
        stopVoice(meows.values().next().value);
      }
      const source = context.createBufferSource(),
        gain = context.createGain();
      source.buffer = nextMeow();
      source.playbackRate.value = 1.04 - Math.min(9, level) * 0.012 + (random() - 0.5) * 0.045;
      gain.gain.setValueAtTime(0.8 / Math.sqrt(1 + meows.size * 0.3), now);
      source.connect(gain);
      gain.connect(effectsBus);
      meows.add(track(source, gain, effectVoices));
      source.start(now);
    } else if (kind === 'drop') {
      note(55, now, 0.07, 0.075, 'sine', effectVoices);
    } else if (kind === 'win') {
      [72, 76, 79, 84].forEach((pitch, i) =>
        note(pitch, now + i * 0.1, 0.36, 0.1, 'mallet', effectVoices),
      );
    }
  }
  return {
    preload,
    unlock: protect(unlock),
    play: protect(play),
    setMusicVolume: protect((value) => {
      musicVolume = volume(value);
      if (musicBus) {
        musicBus.gain.setTargetAtTime(0.38 * musicVolume, context.currentTime, 0.025);
      }
    }),
    setEffectsVolume: protect((value) => {
      effectsVolume = volume(value);
      if (effectsBus) {
        effectsBus.gain.setTargetAtTime(0.68 * effectsVolume, context.currentTime, 0.025);
      }
    }),
    setMuted: protect((value) => {
      muted = Boolean(value);
      wake();
    }),
    setPlaying: protect((value) => {
      playing = Boolean(value);
      wake();
    }),
    setVisible: protect((value) => {
      visible = Boolean(value);
      wake();
    }),
  };
}
