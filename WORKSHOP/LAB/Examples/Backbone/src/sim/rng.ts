// Seeded generator. Its state is four whole numbers held in the world, so it is copied,
// hashed and replayed with everything else. The simulation never uses Math.random.

import type { RngState } from "./types";

/** Builds a generator state from seed text. */
export function seedRng(text: string): RngState {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  const next = (): number => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
  const state: RngState = { a: next(), b: next(), c: next(), d: next() };
  for (let i = 0; i < 12; i++) nextU32(state);
  return state;
}

/** Next whole number from 0 to 2^32 - 1. Advances the state. */
export function nextU32(s: RngState): number {
  const t = (((s.a + s.b) | 0) + s.d) | 0;
  s.d = (s.d + 1) | 0;
  s.a = s.b ^ (s.b >>> 9);
  s.b = (s.c + (s.c << 3)) | 0;
  s.c = (s.c << 21) | (s.c >>> 11);
  s.c = (s.c + t) | 0;
  return t >>> 0;
}

/** Whole number from 0 to n - 1. n must be at least 1. */
export function nextInt(s: RngState, n: number): number {
  return Math.floor((nextU32(s) / 4294967296) * n);
}

/** Whole number from lo to hi, both included. */
export function nextRange(s: RngState, lo: number, hi: number): number {
  return lo + nextInt(s, hi - lo + 1);
}
