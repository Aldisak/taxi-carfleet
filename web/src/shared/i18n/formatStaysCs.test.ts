import { describe, it, expect, afterEach } from 'vitest'
import i18n from './index'
import { formatCzk } from '../format/money'
import { defaultThisMonthRange } from '../date/analyticsRange'

/**
 * AC#6 / spec §21 non-goal guard: formatting is language-independent. Money stays
 * cs-CZ (`… Kč`, cs-CZ grouping) and dates stay Europe/Prague-anchored regardless
 * of the active UI language. This is a REGRESSION guard — money.ts / analyticsRange.ts
 * never read i18n today, so this is GREEN on first run; it bites the day someone wires
 * `Intl.NumberFormat(i18n.language)` or a UI-language date formatter into either module.
 *
 * We deliberately switch the UI language to de-DE mid-test and restore cs-CZ after,
 * so the assertions run under a NON-Czech UI (preserving the suite's Czech baseline).
 */
describe('formatting stays cs-CZ / Europe/Prague regardless of UI language', () => {
  afterEach(async () => {
    await i18n.changeLanguage('cs-CZ')
  })

  it('keeps money in cs-CZ (Kč + cs-CZ grouping) after switching UI to de-DE', async () => {
    // cs-CZ groups thousands with U+00A0; de-DE would use a dot ("1.200").
    const csGrouped = formatCzk(1200)

    await i18n.changeLanguage('de-DE')
    expect(i18n.language).toBe('de-DE')

    // Same value, still cs-CZ formatted — no dot grouping, still " Kč".
    expect(formatCzk(1200)).toBe(csGrouped)
    expect(formatCzk(1200).replace(/\s/g, ' ')).toBe('1 200 Kč')
  })

  it('keeps date ranges Europe/Prague-anchored after switching UI to de-DE', async () => {
    // A UTC instant that is still the previous day in some zones but a fixed
    // Prague-local calendar day; the range must not shift with the UI language.
    const at = new Date('2026-09-14T22:30:00Z') // 2026-09-15 00:30 Prague (CEST)
    const csRange = defaultThisMonthRange(at)
    expect(csRange).toEqual({ from: '2026-09-01', to: '2026-09-15' })

    await i18n.changeLanguage('de-DE')
    expect(defaultThisMonthRange(at)).toEqual(csRange)
  })
})
