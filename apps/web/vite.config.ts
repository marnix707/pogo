import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// The release number comes from this package's version (see CLAUDE.md, "Versions").
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as {
  version: string;
};

// One id per build: the page compares it with /version.json to notice that a newer build was deployed.
const BUILD_ID = process.env.RENDER_GIT_COMMIT?.slice(0, 12) || Date.now().toString(36);

/** Writes `version.json` ({"build": id}) into the build, and serves it from the dev server too. */
const versionFile = (): Plugin => ({
  name: 'pogo-version-file',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ build: BUILD_ID }),
    });
  },
  configureServer(server) {
    server.middlewares.use('/version.json', (_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify({ build: BUILD_ID }));
    });
  },
});

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';
// Bind-mounted sources on WSL/Docker don't reliably emit fs events, so poll.
const usePolling = process.env.CHOKIDAR_USEPOLLING === 'true';

export default defineConfig({
  plugins: [react(), versionFile()],
  define: { __APP_VERSION__: JSON.stringify(version), __BUILD_ID__: JSON.stringify(BUILD_ID) },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Dev server only: reachable by LAN IP from phones and by service name from the e2e container.
    allowedHosts: true,
    watch: usePolling ? { usePolling: true, interval: 300 } : undefined,
    // One origin for the phone: the dev server proxies API + realtime to the server container.
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
      '/socket.io': { target: apiTarget, ws: true, changeOrigin: true },
    },
  },
});
