import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'

// Leaflet cannot render in jsdom (no layout) — mock the lazily-loaded inner.
vi.mock('./RideMapInner', () => ({
  default: () => <div data-testid="ride-map-inner">map</div>,
}))

import { RideMapStrip } from './RideMapStrip'

function renderStrip() {
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider theme={theme}>
        <RideMapStrip pickupLat={50} pickupLng={14} dropoffLat={null} dropoffLng={null} ownLat={null} ownLng={null} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

describe('RideMapStrip', () => {
  it('is collapsed by default — the map body is not mounted', () => {
    renderStrip()
    expect(screen.queryByTestId('ride-map-inner')).not.toBeInTheDocument()
  })

  it('exposes an expanded/collapsed toggle via aria-expanded', async () => {
    renderStrip()
    const toggle = screen.getByRole('button', { name: /Zobrazit mapu|Skrýt mapu/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    await waitFor(() => expect(screen.getByTestId('ride-map-inner')).toBeInTheDocument())
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('has no axe violations when collapsed', async () => {
    const { container } = renderStrip()
    expect(await axe(container)).toHaveNoViolations()
  })
})
