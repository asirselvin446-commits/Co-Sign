import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs on :8080; proxying keeps the dashboard same-origin with the API,
// which the httpOnly refresh cookie and passkey origin checks rely on.
const api = process.env.VITE_API_PROXY ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/v1': { target: api, changeOrigin: false },
      '/socket.io': { target: api, ws: true, changeOrigin: false },
    },
  },
  build: { sourcemap: true, target: 'es2022' },
});
