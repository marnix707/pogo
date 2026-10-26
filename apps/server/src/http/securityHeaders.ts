import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';

/** sha256 CSP sources for the inline scripts of the built index.html (the look is applied before first paint). */
export function inlineScriptHashes(webDistDir: string | undefined): string[] {
  if (!webDistDir) return [];
  try {
    const html = readFileSync(join(webDistDir, 'index.html'), 'utf8');
    const hashes: string[] = [];
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      hashes.push(
        `'sha256-${createHash('sha256')
          .update(m[1] ?? '')
          .digest('base64')}'`,
      );
    }
    return hashes;
  } catch {
    return [];
  }
}

/**
 * Headers every response gets, and a Content-Security-Policy for the web app's pages. Nothing may frame the
 * game (the admin panel would otherwise be open to clickjacking); scripts come only from our own origin plus
 * the one inline script (by hash); no plugins, no foreign forms.
 */
export function registerSecurityHeaders(
  app: FastifyInstance,
  options: { production: boolean; webDistDir?: string },
) {
  const scriptSrc = ["'self'", ...inlineScriptHashes(options.webDistDir)].join(' ');
  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    "connect-src 'self' ws: wss:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    // A recovery link carries a token in its address: never leak it as a referrer.
    reply.header('referrer-policy', 'no-referrer');
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (options.production) {
      reply.header('strict-transport-security', 'max-age=15552000; includeSubDomains');
      if (String(reply.getHeader('content-type') ?? '').startsWith('text/html')) {
        reply.header('content-security-policy', csp);
      }
    }
    return payload;
  });
}
