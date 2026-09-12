import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5249',
        changeOrigin: true,
      },
      '/hubs': {
        target: 'http://localhost:5249',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
