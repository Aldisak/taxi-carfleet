import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../i18n'
import { theme } from '../theme/theme'
import { axe } from '../test/axe'
import { MapUnavailableBanner } from './MapUnavailableBanner'

function renderBanner() {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <MapUnavailableBanner />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

describe('MapUnavailableBanner', () => {
  it('renders a role=alert message "Mapa dočasně nedostupná" (AC#5)', () => {
    renderBanner()
    const banner = screen.getByRole('alert')
    expect(banner).toHaveTextContent(/mapa dočasně nedostupná/i)
  })

  it('is announced politely (aria-live)', () => {
    renderBanner()
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite')
  })

  it('has no axe violations', async () => {
    const { container } = renderBanner()
    expect(await axe(container)).toHaveNoViolations()
  })
})
