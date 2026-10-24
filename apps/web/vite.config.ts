import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

// The release number comes from this package's version (see CLAUDE.md, "Versions").
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as {
  version: string;
};

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';
// Bind-mounted sources on WSL/Docker don't reliably emit fs events, so poll.
const usePolling = process.env.CHOKIDAR_USEPOLLING === 'true';

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
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
