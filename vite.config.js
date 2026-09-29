import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envPrefix: 'GITHUG_',
  server: {
    proxy: {
      // Proxy API calls to the local Netlify CLI (netlify dev), which serves
      // the edge functions. This keeps GITHUG_FUNCTION_URL="/api/auth" working
      // in both dev (5173 -> 8888) and production.
      '/api': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
    },
  },
})
