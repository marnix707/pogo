import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://localhost:3000';
// Bind-mounted sources on WSL/Docker don't reliably emit fs events, so poll.
const usePolling = process.env.CHOKIDAR_USEPOLLING === 'true';

export default defineConfig({
  plugins: [react()],
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
