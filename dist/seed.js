// Keep drop-order randomness separate from audio, particles and physics.
export const normalizeSeed = (seed) =>
  String(seed ?? '')
    .normalize('NFC')
    .trim();

export function createSeed() {
  const values = new Uint32Array(2);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
  } else {
    values[0] = Math.floor(Math.random() * 2 ** 32);
    values[1] = Math.floor(Math.random() * 2 ** 32);
  }
  return [...values].map((value) => value.toString(36)).join('-');
}

export function createSeededRandom(seed) {
  // FNV-1a over normalized UTF-16 code units, followed by Mulberry32.
  // Explicit 32-bit operations make the sequence independent of the browser.
  const text = normalizeSeed(seed);
  let state = 2166136261;
  for (let i = 0; i < text.length; i++) {
    state = Math.imul(state ^ text.charCodeAt(i), 16777619) >>> 0;
  }
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 2 ** 32;
  };
}
