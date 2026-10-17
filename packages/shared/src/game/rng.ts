/** Injected source of randomness. Game logic never touches Math.random or crypto directly. */
export interface Rng {
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
}

/** Deterministic PRNG (mulberry32). For tests and replays only; the server injects a crypto-backed Rng. */
export function createSeededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    int(maxExclusive) {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      return Math.floor(r * maxExclusive);
    },
  };
}
