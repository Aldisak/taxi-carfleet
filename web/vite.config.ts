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
      // injectManifest: we ship a custom service worker (src/sw.ts) so it can handle Web Push
      // (show notification + notificationclick focus/open) in addition to app-shell precaching.
      // generateSW has no hook for a custom push handler. (UC-005 B1)
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
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
      injectManifest: {
        // Precache only app shell assets (JS/CSS/HTML) — not API or hub routes.
        // Runtime routing/navigation fallback is handled explicitly in src/sw.ts.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Name the analytics lazy chunk so the size-limit budget glob
        // `dist/assets/analytics-*.js` matches it correctly.
        // chart.js and all features/analytics/* code lands in this named chunk,
        // keeping it absent from the eager bundles.
        manualChunks(id) {
          if (
            id.includes('/features/analytics/') ||
            id.includes('/chart.js/') ||
            id.includes('/react-chartjs-2/')
          ) {
            return 'analytics'
          }
        },
      },
    },
  },
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
