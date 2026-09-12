import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Exclude Playwright E2E specs from vitest — they require a real browser.
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
})
