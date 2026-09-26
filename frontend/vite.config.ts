import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// В разработке запросы /api проксируются на backend (uvicorn на порту 8000).
// Для отдельного деплоя frontend задайте VITE_API_URL — адрес backend.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_PROXY_TARGET ?? 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
