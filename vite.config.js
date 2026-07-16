import { defineConfig } from 'vite';

// Client dev server. The PHP API runs separately (see ARCHITECTURE.md); the
// client reaches it via VITE_API_BASE. With no VITE_API_BASE, net.js uses the
// local mock fixture so the client runs with no database.
export default defineConfig({
  server: {
    port: 5273,
    host: '127.0.0.1',
    // Same-origin API in dev: browser hits /api on 5273, Vite forwards to the
    // PHP server on 8124 → no CORS. Override target with VITE_API_TARGET.
    proxy: {
      '/api': { target: process.env.VITE_API_TARGET || 'http://127.0.0.1:8124', changeOrigin: true },
    },
  },
  build: { target: 'es2020' },
});
