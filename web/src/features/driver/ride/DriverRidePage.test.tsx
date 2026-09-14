import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import type { OrderDetailDto } from '../../../shared/api/client'

// --- Hook mocks ---
vi.mock('./useRideRestore', () => ({ useRideRestore: vi.fn() }))
vi.mock('./useLiveClear', () => ({ useLiveClear: vi.fn() }))

const meData = { driverId: 'driver-1' }
vi.mock('../home/useDriverMe', () => ({
  useDriverMe: () => ({ data: meData }),
}))

let activeOrderResult: {
  order: OrderDetailDto | null
  arrivedAt: string | null
  noShowEnabled: boolean
  noShowCountdownSeconds: number | null
}
vi.mock('./useActiveOrder', () => ({
  useActiveOrder: () => activeOrderResult,
}))

const arriveFn = vi.fn().mockResolvedValue({ type: 'success' })
const startFn = vi.fn().mockResolvedValue({ type: 'success' })
const cancelNoShowFn = vi.fn().mockResolvedValue({ type: 'success' })
vi.mock('./useRideTransition', () => ({
  useRideTransition: () => ({
    isPending: false,
    arrive: arriveFn,
    start: startFn,
    cancelNoShow: cancelNoShowFn,
  }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

// Leaflet inner mocked (no jsdom layout)
vi.mock('./RideMapInner', () => ({ default: () => <div>map</div> }))

// Queue hook mocked — the reroute is tested in the queue suite, not here.
vi.mock('../queue/useTransitionQueue', () => ({
  useQueuePendingCount: () => 0,
}))

import { DriverRidePage } from './DriverRidePage'

function makeOrder(overrides: Partial<OrderDetailDto> = {}): OrderDetailDto {
  return {
    id: 'order-1',
    publicCode: 'ABC123',
    status: 'Accepted',
    source: 'Phone',
    customerPhone: '+420777123456',
    customerName: 'Jan',
    pickupAddress: 'Nádraží, Praha',
    pickupLat: 50.08,
    pickupLng: 14.43,
    dropoffAddress: 'Letiště',
    dropoffLat: 50.1,
    dropoffLng: 14.26,
    scheduledAt: null,
    note: 'U vchodu B',
    passengers: 1,
    priceType: 'Meter',
    estimatedPriceCzk: null,
    fixedPriceCzk: null,
    finalPriceCzk: null,
    paymentType: null,
    driverId: 'driver-1',
    vehicleId: null,
    createdAt: '2026-09-12T10:00:00.000Z',
    updatedAt: '2026-09-12T10:00:00.000Z',
    allowedActions: [],
    version: 1,
    ...overrides,
  }
}

function renderPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider theme={theme}>
        <DriverRidePage />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

describe('DriverRidePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    activeOrderResult = {
      order: makeOrder(),
      arrivedAt: null,
      noShowEnabled: false,
      noShowCountdownSeconds: null,
    }
  })

  it('shows an empty state + back-home when there is no active order', () => {
    activeOrderResult = { order: null, arrivedAt: null, noShowEnabled: false, noShowCountdownSeconds: null }
    renderPage()
    expect(screen.getByText('Žádná aktivní jízda')).toBeInTheDocument()
  })

  it('shows pickup address and a tap-to-call phone link', () => {
    renderPage()
    expect(screen.getByText('Nádraží, Praha')).toBeInTheDocument()
    const tel = screen.getByRole('link', { name: /\+420777123456/ })
    expect(tel).toHaveAttribute('href', 'tel:+420777123456')
  })

  it('Accepted: tapping "Jsem na místě" issues the arrive transition', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Jsem na místě' }))
    expect(arriveFn).toHaveBeenCalledWith('order-1')
  })

  it('InProgress: tapping "Ukončit jízdu" navigates to the complete screen', async () => {
    activeOrderResult.order = makeOrder({ status: 'InProgress' })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Ukončit jízdu' }))
    expect(mockNavigate).toHaveBeenCalledWith('/driver/ride/complete')
  })

  it('Arrived: "Zákazník nepřišel" fires the no-show cancel once enabled', async () => {
    activeOrderResult.order = makeOrder({ status: 'Arrived' })
    activeOrderResult.noShowEnabled = true
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Zákazník nepřišel' }))
    expect(cancelNoShowFn).toHaveBeenCalledWith('order-1')
  })

  it('has no axe violations', async () => {
    const { container } = renderPage()
    expect(await axe(container)).toHaveNoViolations()
  })
})
