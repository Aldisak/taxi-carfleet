import { configureAxe } from 'vitest-axe'

/**
 * axe preconfigured for jsdom: color-contrast needs real layout (canvas) and is
 * unreliable in jsdom — contrast is guaranteed by theme token pairs and verified
 * by the manual Lighthouse check (rules/web-accessibility.md#jsdom-limits).
 */
export const axe = configureAxe({
  rules: { 'color-contrast': { enabled: false } },
})
