import { sep } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/** Serve the built web app and fall back to index.html for client-side routes. */
export async function registerStatic(app: FastifyInstance, root: string) {
  await app.register(fastifyStatic, {
    root,
    cacheControl: false, // set per file below
    setHeaders(res, filePath) {
      // Vite fingerprints everything in /assets, so it can be cached forever; HTML must revalidate.
      res.setHeader(
        'cache-control',
        filePath.includes(`${sep}assets${sep}`)
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      );
    },
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.method !== 'GET' || req.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html');
  });
}
