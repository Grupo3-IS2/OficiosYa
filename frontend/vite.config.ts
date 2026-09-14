import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// `npm run dev` serves the SPA on :5173 and forwards the backend paths to Spring
// Boot, so the frontend always calls relative URLs (`/api/...`, `/ws/...`,
// `/uploads/...`) — the same way it does in production behind nginx.
//
// BACKEND_URL points at the backend: the default suits `npm run dev` on the host;
// `docker compose --profile dev up` sets it to http://app:8080 (the container).
const backend = process.env.BACKEND_URL ?? 'http://localhost:8080'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': { target: backend, changeOrigin: true },
      '/ws': { target: backend.replace(/^http/, 'ws'), ws: true },
      '/uploads': { target: backend, changeOrigin: true },
    },
  },
})
