/** Token bucket: `burst` events at once, refilling `perSecond` tokens per second. */
export function createRateLimiter(burst: number, perSecond: number, now: () => number = Date.now) {
  let tokens = burst;
  let last = now();
  return function allow(cost = 1): boolean {
    const t = now();
    tokens = Math.min(burst, tokens + ((t - last) / 1000) * perSecond);
    last = t;
    if (tokens < cost) return false;
    tokens -= cost;
    return true;
  };
}
