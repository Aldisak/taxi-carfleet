import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import { PriceRangeBadge } from './PriceRangeBadge'

function renderBadge(...args: Parameters<typeof PriceRangeBadge>) {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <PriceRangeBadge {...args[0]} />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

describe('PriceRangeBadge', () => {
  it('renders a fixed price as a single "pevná" price', () => {
    renderBadge({ view: { kind: 'fixed', priceCzk: 300, routeId: 'r7' } })
    const badge = screen.getByRole('status')
    expect(badge).toHaveTextContent(/300\s*Kč/)
    expect(badge).toHaveTextContent(/pevná/i)
  })

  it('renders an estimate as a RANGE, never a single number (AC #4)', () => {
    renderBadge({ view: { kind: 'estimate', lowCzk: 180, highCzk: 220, distanceKm: 12.4, durationMin: 18, degraded: false } })
    const badge = screen.getByRole('status')
    // Both DISTINCT bounds appear, joined by a dash — never one exact number.
    expect(badge).toHaveTextContent(/180\s*Kč/)
    expect(badge).toHaveTextContent(/220\s*Kč/)
    expect(badge).toHaveTextContent(/odhad/i)
    expect(badge).toHaveTextContent(/–/)
    // A single exact estimate (e.g. just "Odhad 200 Kč") must NOT be shown.
    expect(badge.textContent).not.toMatch(/^Odhad\s+\d+\s*Kč$/)
    // A non-degraded estimate is NOT labelled "orientační odhad".
    expect(badge).not.toHaveTextContent(/orientační/i)
  })

  it('labels a degraded estimate "orientační odhad" with the wider range (AC#5)', () => {
    renderBadge({ view: { kind: 'estimate', lowCzk: 160, highCzk: 240, distanceKm: 12.4, durationMin: 18, degraded: true } })
    const badge = screen.getByRole('status')
    expect(badge).toHaveTextContent(/orientační odhad/i)
    // Still a RANGE with both wider bounds.
    expect(badge).toHaveTextContent(/160\s*Kč/)
    expect(badge).toHaveTextContent(/240\s*Kč/)
  })

  it('renders a Meter quote as "Podle taximetru" (A6 fallback)', () => {
    renderBadge({ view: { kind: 'meter' } })
    const badge = screen.getByRole('status')
    expect(badge).toHaveTextContent(/taximetru/i)
  })

  it('shows the error message when the quote is unavailable (502)', () => {
    renderBadge({ view: null, errorKey: 'customer.custom.quoteUnavailable' })
    expect(screen.getByText(/cenu nelze spočítat/i)).toBeInTheDocument()
  })

  it('renders nothing when there is no view and no error', () => {
    const { container } = renderBadge({ view: null })
    expect(container).toBeEmptyDOMElement()
  })

  it('has no axe violations', async () => {
    const { container } = renderBadge({ view: { kind: 'estimate', lowCzk: 180, highCzk: 220, distanceKm: 12.4, durationMin: 18, degraded: false } })
    expect(await axe(container)).toHaveNoViolations()
  })
})
