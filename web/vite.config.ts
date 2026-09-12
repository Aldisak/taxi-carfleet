import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    // App version shown in Settings (read at build time from package.json).
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      devOptions: {
        // SW must NOT register in dev — only active in production builds
        enabled: false,
      },
      manifest: {
        name: 'Taxi Řidič',
        short_name: 'Taxi Řidič',
        description: 'Aplikace pro řidiče taxi',
        theme_color: '#1e2a4a',
        background_color: '#1e2a4a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/d',
        scope: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache only app shell assets (JS/CSS/HTML) — not API or hub routes
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [
          // Never intercept API calls or SignalR hub connections
          /^\/api/,
          /^\/hubs/,
        ],
        // No runtime caching for API or real-time traffic
        runtimeCaching: [],
      },
    }),
  ],
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
