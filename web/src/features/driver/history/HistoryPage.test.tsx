import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import { HistoryPage } from './HistoryPage'
import type { MyOrder } from '../../../shared/api/client'

vi.mock('./useMyOrders', () => ({ useMyOrders: vi.fn() }))
// DisconnectBanner reads the hub connection state — keep it connected (renders nothing).
vi.mock('../../../shared/realtime/useFleetHub', () => ({
  useHubConnectionState: () => 'connected',
  isServerActionBlocked: () => false,
}))

import { useMyOrders } from './useMyOrders'
const mockOrders = vi.mocked(useMyOrders)

function setOrders(orders: MyOrder[] | undefined, isLoading = false) {
  mockOrders.mockReturnValue({ data: orders, isLoading } as ReturnType<typeof useMyOrders>)
}

function renderPage() {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <HistoryPage />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

const completed: MyOrder = {
  id: '1', publicCode: 'A-1', status: 'Completed', pickupAddress: 'Náměstí',
  dropoffAddress: 'Nádraží', priceType: 'Fixed', finalPriceCzk: 150,
  paymentType: 'Cash', completedAt: '2026-09-12T10:00:00Z',
}

describe('HistoryPage', () => {
  beforeEach(() => { mockOrders.mockReset() })

  it('shows the empty message when there are no rides for the day', () => {
    setOrders([])
    renderPage()
    expect(screen.getByText('Žádné jízdy v tento den.')).toBeInTheDocument()
  })

  it('renders totals and the ride list from the day orders', () => {
    setOrders([completed])
    renderPage()
    // ride count chip
    expect(screen.getByText('Jízd')).toBeInTheDocument()
    // cs-CZ integer CZK formatting (non-breaking space group separator may appear for larger numbers)
    expect(screen.getAllByText('150 Kč').length).toBeGreaterThan(0)
    expect(screen.getByText(/Náměstí/)).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    setOrders([completed])
    const { container } = renderPage()
    expect(await axe(container)).toHaveNoViolations()
  })
})
