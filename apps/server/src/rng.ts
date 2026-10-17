import { randomInt } from 'node:crypto';
import type { Rng } from '@pogo/shared';

/** Cryptographically secure Rng; every dice roll on the server goes through this. */
export const cryptoRng: Rng = {
  int: (maxExclusive) => randomInt(maxExclusive),
};
