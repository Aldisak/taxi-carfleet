import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import { Diagnostika } from './Diagnostika'
import { useOwnPositionStore } from '../position/useOwnPositionStore'

function renderPanel() {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <Diagnostika />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

describe('Diagnostika', () => {
  beforeEach(() => {
    useOwnPositionStore.setState({ position: null, lastSentAt: null })
  })

  it('shows "Nikdy" when no position has been sent yet', () => {
    renderPanel()
    expect(screen.getByText('Poslední odeslaná poloha')).toBeInTheDocument()
    expect(screen.getByText('Nikdy')).toBeInTheDocument()
  })

  it('renders the connection state and permission rows (jsdom → unknown fallback does not throw)', async () => {
    renderPanel()
    expect(screen.getByText('Oprávnění polohy')).toBeInTheDocument()
    expect(screen.getByText('Oprávnění oznámení')).toBeInTheDocument()
    expect(screen.getByText('Stav připojení')).toBeInTheDocument()
    // push permission: jsdom has no Notification → "Neznámo"
    await waitFor(() => expect(screen.getAllByText('Neznámo').length).toBeGreaterThan(0))
  })

  it('shows the last sent position when present', () => {
    useOwnPositionStore.setState({ lastSentAt: '2026-09-12T08:30:00Z' })
    renderPanel()
    expect(screen.queryByText('Nikdy')).not.toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderPanel()
    expect(await axe(container)).toHaveNoViolations()
  })
})
