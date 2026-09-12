import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import type { OrderDetailDto } from '../../../shared/api/client'

let order: OrderDetailDto | null
vi.mock('../ride/useActiveOrder', () => ({
  useActiveOrder: () => ({ order, arrivedAt: null, noShowEnabled: false, noShowCountdownSeconds: null }),
}))

const completeFn = vi.fn().mockResolvedValue({ type: 'success' })
vi.mock('./useCompleteRide', () => ({
  useCompleteRide: () => ({ isPending: false, complete: completeFn }),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import { CompletePage } from './CompletePage'

function makeOrder(overrides: Partial<OrderDetailDto> = {}): OrderDetailDto {
  return {
    id: 'order-1',
    publicCode: 'ABC',
    status: 'InProgress',
    source: 'Phone',
    customerPhone: '+420777000000',
    customerName: null,
    pickupAddress: 'A',
    pickupLat: 50,
    pickupLng: 14,
    dropoffAddress: 'B',
    dropoffLat: 50.1,
    dropoffLng: 14.1,
    scheduledAt: null,
    note: null,
    passengers: 1,
    priceType: 'Estimate',
    estimatedPriceCzk: 200,
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
        <CompletePage />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

describe('CompletePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    order = makeOrder()
  })

  it('Estimate: prefills the keypad with the estimate and shows payment toggles', () => {
    renderPage()
    expect(screen.getByText('200')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hotově' })).toBeInTheDocument()
  })

  it('blocks complete until a payment type is chosen', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Dokončit' }))
    expect(completeFn).not.toHaveBeenCalled()
    expect(screen.getByText('Vyberte způsob platby.')).toBeInTheDocument()
  })

  it('completes with finalPriceCzk + paymentType and navigates Home with a toast', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Kartou' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dokončit' }))
    expect(completeFn).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({ finalPriceCzk: 200, paymentType: 'Card' }),
    )
    expect(mockNavigate).toHaveBeenCalledWith(
      '/d',
      expect.objectContaining({ state: { toast: 'driver.complete.successOverlay' } }),
    )
  })

  it('Fixed: price is locked and the keypad is not shown until "Změnit cenu"', async () => {
    order = makeOrder({ priceType: 'Fixed', fixedPriceCzk: 150, estimatedPriceCzk: null })
    renderPage()
    // keypad digit buttons are not present while locked
    expect(screen.queryByRole('button', { name: '7' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Změnit cenu' }))
    expect(screen.getByRole('button', { name: '7' })).toBeInTheDocument()
  })

  it('Fixed changed price requires a >=5-char reason before completing', async () => {
    order = makeOrder({ priceType: 'Fixed', fixedPriceCzk: 150, estimatedPriceCzk: null })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Hotově' }))
    await userEvent.click(screen.getByRole('button', { name: 'Změnit cenu' }))
    // change price 150 -> 1509 via appending a digit
    await userEvent.click(screen.getByRole('button', { name: '9' }))
    await userEvent.click(screen.getByRole('button', { name: 'Dokončit' }))
    expect(completeFn).not.toHaveBeenCalled()
    expect(screen.getByText('Důvod změny musí mít alespoň 5 znaků.')).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderPage()
    expect(await axe(container)).toHaveNoViolations()
  })
})
