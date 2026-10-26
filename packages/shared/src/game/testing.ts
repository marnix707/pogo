import type { Rng } from './rng';

/** Rng that returns scripted die faces (1-6) in order, for tests that need exact rolls. */
/** An Rng that always rolls the same face (1-6): with Yatzy every roll is a Yatzy. */
export function createFixedRng(face: number): Rng {
  return { int: () => face - 1 };
}

export function createDiceRng(faces: number[]): Rng {
  let i = 0;
  return {
    int(maxExclusive) {
      const face = faces[i++];
      if (face === undefined) throw new Error('Scripted Rng ran out of values');
      const value = face - 1;
      if (value < 0 || value >= maxExclusive)
        throw new Error(`Scripted value ${face} out of range`);
      return value;
    },
  };
}
