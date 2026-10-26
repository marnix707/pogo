/**
 * The client address behind the host's proxies. With `hops` unset the whole X-Forwarded-For header is trusted
 * (Fastify's `trustProxy: true`: the leftmost entry, which a client can forge). With `hops` set, the proxies
 * append the address they saw, so the entry `hops` places from the right is the one our own proxy wrote and
 * anything a client prepended is ignored.
 */
export function forwardedClientIp(
  header: string | string[] | undefined,
  hops: number | undefined,
): string | null {
  const raw = Array.isArray(header) ? header.join(',') : header;
  const parts = raw
    ?.split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts?.length) return null;
  if (!hops) return parts[0] ?? null;
  return parts[Math.max(0, parts.length - hops)] ?? null;
}
