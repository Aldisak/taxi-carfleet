import { describe, it, expect, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import { OfflineGate } from './OfflineGate'

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
}

function renderGate(phone: string | null = '+420111222333') {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <OfflineGate phone={phone}>
          <button type="button">Objednat</button>
        </OfflineGate>
      </I18nextProvider>
    </ThemeProvider>,
  )
}

describe('OfflineGate', () => {
  afterEach(() => {
    setOnline(true)
  })

  it('renders children (ordering enabled) while online', () => {
    setOnline(true)
    renderGate()
    expect(screen.getByRole('button', { name: 'Objednat' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the Czech offline message and the phone while offline', () => {
    setOnline(false)
    renderGate()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Jste offline')
    expect(screen.getByRole('link', { name: /zavolat/i })).toHaveAttribute('href', 'tel:+420111222333')
  })

  it('disables the ordering children while offline', () => {
    setOnline(false)
    renderGate()
    expect(screen.queryByRole('button', { name: 'Objednat' })).not.toBeInTheDocument()
  })

  it('has no axe violations while offline', async () => {
    setOnline(false)
    const { container } = renderGate()
    expect(await axe(container)).toHaveNoViolations()
  })
})
