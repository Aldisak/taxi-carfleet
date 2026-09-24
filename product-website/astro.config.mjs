import { defineConfig } from 'astro/config'

export default defineConfig({
  // Canonical origin for the apex deployment (drives canonical/OG/hreflang in Base.astro).
  site: 'https://taxi-carfleet.com',
  i18n: { defaultLocale: 'cs', locales: ['cs', 'en'], routing: { prefixDefaultLocale: false } },
})
