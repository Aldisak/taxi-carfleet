import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Mirror vite.config.ts so __APP_VERSION__ is defined under the test runner too.
  define: {
    __APP_VERSION__: JSON.stringify('0.0.1-test'),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Exclude Playwright E2E specs from vitest — they require a real browser.
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
})
