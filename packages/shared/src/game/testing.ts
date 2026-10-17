import type { Rng } from './rng';

/** Rng that returns scripted die faces (1-6) in order, for tests that need exact rolls. */
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
