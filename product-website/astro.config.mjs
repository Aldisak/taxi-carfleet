import { defineConfig } from 'astro/config'

export default defineConfig({
  // Canonical origin for the apex deployment (drives canonical/OG/hreflang in Base.astro).
  site: 'https://taxi-carfleet.com',
  i18n: { defaultLocale: 'cs', locales: ['cs', 'en'], routing: { prefixDefaultLocale: false } },
  // Emit client scripts as external same-origin /_astro/*.js files instead of
  // inlining them. The apex site is served under a strict CSP (`script-src 'self'`,
  // infra/Caddyfile) that blocks inline scripts — inlined `<script type="module">`
  // included. assetsInlineLimit:0 forces Astro to externalize the pricing
  // calculator + contact-form scripts so they load and run under that CSP.
  vite: { build: { assetsInlineLimit: 0 } },
})
