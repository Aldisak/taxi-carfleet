import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import type { UsePriceQuoteResult } from './usePriceQuote'
import type { PriceQuoteView } from './priceQuote'
import type { SelectedPlace } from './orderFlowState'

vi.mock('../../../shared/api/client', () => ({
  postCreateOrder: vi.fn(),
  requestCustomerCode: vi.fn(),
  verifyCustomerCode: vi.fn(),
}))

import { postCreateOrder, requestCustomerCode, verifyCustomerCode } from '../../../shared/api/client'
import { PriceSheet } from './PriceSheet'

const mockCreate = vi.mocked(postCreateOrder)
const mockRequestCode = vi.mocked(requestCustomerCode)
const mockVerifyCode = vi.mocked(verifyCustomerCode)

const PICKUP: SelectedPlace = { label: 'Hlavní 1, Praha', lat: 50.0875, lng: 14.4213 }
const DESTINATION: SelectedPlace = { label: 'Náměstí 5, Praha', lat: 50.09, lng: 14.43 }

function quoteResult(view: PriceQuoteView | null, errorKey: string | null = null): UsePriceQuoteResult {
  return { view, isLoading: false, errorKey }
}

function createdOrder(publicCode: string) {
  return {
    order: {
      id: 'o1', publicCode, status: 'New', source: 'App', customerPhone: '+420111222333',
      customerName: null, pickupAddress: PICKUP.label, pickupLat: PICKUP.lat, pickupLng: PICKUP.lng,
      dropoffAddress: DESTINATION.label, dropoffLat: DESTINATION.lat, dropoffLng: DESTINATION.lng,
      scheduledAt: null, note: null, passengers: 1, priceType: 'Fixed', estimatedPriceCzk: null,
      fixedPriceCzk: 250, finalPriceCzk: null, paymentType: null, driverId: null, vehicleId: null,
      createdAt: '2026-09-15T12:00:00Z', updatedAt: '2026-09-15T12:00:00Z', allowedActions: [], version: 0,
    },
  }
}

interface RenderArgs {
  quote?: UsePriceQuoteResult
  pickup?: SelectedPlace | null
  destination?: SelectedPlace | null
  onCancel?: () => void
  onOrdered?: (publicCode: string) => void
}

function renderSheet(args: RenderArgs = {}) {
  const onCancel = args.onCancel ?? vi.fn()
  const onOrdered = args.onOrdered ?? vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <PriceSheet
            pickup={args.pickup ?? PICKUP}
            destination={args.destination ?? DESTINATION}
            quote={args.quote ?? quoteResult({ kind: 'fixed', priceCzk: 250, routeId: 'r1' })}
            onCancel={onCancel}
            onOrdered={onOrdered}
          />
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
  return { ...utils, onCancel, onOrdered }
}

describe('PriceSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
    localStorage.clear()
    localStorage.setItem('auth.accessToken', 'customer-token')
    localStorage.setItem('auth.fleetSlug', 'demo')
  })

  it('shows a Fixed exact price', () => {
    renderSheet({ quote: quoteResult({ kind: 'fixed', priceCzk: 250, routeId: 'r1' }) })
    // Fixed shows the price in the PriceCard AND the Order button price slot — both are legitimate,
    // so at least one "250 Kč" is present (getAllByText avoids the strict single-match throw).
    expect(screen.getAllByText(/250\s*Kč/).length).toBeGreaterThan(0)
  })

  it('the Order button accessible name stays exactly "Objednat" even with a price slot', () => {
    renderSheet({ quote: quoteResult({ kind: 'fixed', priceCzk: 250, routeId: 'r1' }) })
    // The price is aria-hidden in the slot so the accessible name is not "Objednat 250 Kč"
    // (the e2e binds getByRole('button', { name: /^Objednat$/ })).
    expect(screen.getByRole('button', { name: /^objednat$/i })).toBeInTheDocument()
  })

  it('an Estimate shows the range ONCE (button carries no price slot for estimate)', () => {
    renderSheet({
      quote: quoteResult({ kind: 'estimate', lowCzk: 140, highCzk: 180, distanceKm: 6, durationMin: 12, degraded: false }),
    })
    // The binding e2e assertion: exactly one "140 Kč" on the sheet (PriceCard only, not the button).
    expect(screen.getAllByText(/140\s*Kč/)).toHaveLength(1)
    expect(screen.getByRole('button', { name: /^objednat$/i })).toBeInTheDocument()
  })

  it('shows an Estimate RANGE (low–high, never a single value)', () => {
    renderSheet({
      quote: quoteResult({ kind: 'estimate', lowCzk: 180, highCzk: 220, distanceKm: 12, durationMin: 18, degraded: false }),
    })
    const badge = screen.getByText(/odhad/i)
    expect(badge).toHaveTextContent(/180\s*Kč/)
    expect(badge).toHaveTextContent(/220\s*Kč/)
    expect(badge.textContent).not.toMatch(/^Odhad\s+\d+\s*Kč$/)
  })

  it('disables Order and shows the fallback for a Meter view', () => {
    renderSheet({ quote: quoteResult({ kind: 'meter' }) })
    expect(screen.getByRole('button', { name: /^objednat$/i })).toBeDisabled()
    expect(screen.getByText(/cenu nelze spočítat/i)).toBeInTheDocument()
  })

  it('disables Order and shows the fallback for an unknown view', () => {
    renderSheet({ quote: quoteResult({ kind: 'unknown' }) })
    expect(screen.getByRole('button', { name: /^objednat$/i })).toBeDisabled()
    expect(screen.getByText(/cenu nelze spočítat/i)).toBeInTheDocument()
  })

  it('disables Order and shows the fallback on a quote error', () => {
    renderSheet({ quote: quoteResult(null, 'customer.custom.quoteUnavailable') })
    expect(screen.getByRole('button', { name: /^objednat$/i })).toBeDisabled()
  })

  it('Cancel fires onCancel', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderSheet()
    await user.click(screen.getByRole('button', { name: /^zrušit$/i }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('opens the options sheet when the when chip is tapped', async () => {
    const user = userEvent.setup()
    renderSheet()
    // The options sheet (the "Kdy vás vyzvednout" section) is not present until a chip is tapped.
    expect(screen.queryByText(/kdy vás vyzvednout/i)).not.toBeInTheDocument()
    // The "Hned" chip on the price sheet (the options sheet is not yet mounted).
    await user.click(screen.getByRole('button', { name: /^hned$/i }))
    expect(screen.getByText(/kdy vás vyzvednout/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^hotovo$/i })).toBeInTheDocument()
  })

  it('the note chip also opens the options sheet', async () => {
    const user = userEvent.setup()
    renderSheet()
    await user.click(screen.getByRole('button', { name: /^poznámka$/i }))
    expect(screen.getByText(/kdy vás vyzvednout/i)).toBeInTheDocument()
  })

  it('the passengers chip reflects the current count and opens the options sheet', async () => {
    const user = userEvent.setup()
    renderSheet()
    expect(screen.getByRole('button', { name: /1 cestující/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /1 cestující/i }))
    expect(screen.getByText(/kdy vás vyzvednout/i)).toBeInTheDocument()
  })

  it('Hotovo closes the options sheet, back to the price sheet', async () => {
    const user = userEvent.setup()
    renderSheet()
    await user.click(screen.getByRole('button', { name: /^poznámka$/i }))
    await user.click(screen.getByRole('button', { name: /^hotovo$/i }))
    expect(screen.queryByText(/kdy vás vyzvednout/i)).not.toBeInTheDocument()
    // The price sheet is still shown (its Order button is present).
    expect(screen.getByRole('button', { name: /^objednat$/i })).toBeInTheDocument()
  })

  it('blocks Order while offline with a visible reason and does not create', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    renderSheet()
    // The offline reason is visible and Order is disabled — no create can be triggered.
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^objednat$/i })).toBeDisabled()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('logged in: Order builds a Fixed request and calls onOrdered(publicCode)', async () => {
    const user = userEvent.setup()
    mockCreate.mockResolvedValue(createdOrder('K7F2A9'))
    const { onOrdered } = renderSheet({
      quote: quoteResult({ kind: 'fixed', priceCzk: 250, routeId: 'r1' }),
    })
    await user.click(screen.getByRole('button', { name: /^objednat$/i }))
    await waitFor(() => expect(onOrdered).toHaveBeenCalledWith('K7F2A9'))
    const payload = mockCreate.mock.calls[0][0]
    expect(payload.priceType).toBe('Fixed')
    expect(payload.fixedPriceCzk).toBe(250)
    expect(payload.routeId).toBe('r1')
    expect(payload.pickupLat).toBe(PICKUP.lat)
    expect(payload.dropoffLat).toBe(DESTINATION.lat)
  })

  it('logged out: Order shows inline login without losing state, then creates on auth', async () => {
    const user = userEvent.setup()
    localStorage.removeItem('auth.accessToken')
    mockRequestCode.mockResolvedValue(undefined)
    mockVerifyCode.mockResolvedValue({
      accessToken: 'at', refreshToken: 'rt',
      user: { id: 'u1', phone: '+420777111222', displayName: 'Zákazník', role: 'Customer' },
    })
    mockCreate.mockResolvedValue(createdOrder('Z9Z9Z9'))
    const { onOrdered } = renderSheet({
      quote: quoteResult({ kind: 'fixed', priceCzk: 250, routeId: 'r1' }),
    })

    await user.click(screen.getByRole('button', { name: /^objednat$/i }))
    // Inline login surfaces; the price badge (order state) is still present.
    expect(await screen.findByRole('button', { name: /odeslat kód/i })).toBeInTheDocument()
    expect(screen.getByText(/250\s*Kč/)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/telefonní číslo/i), '777111222')
    await user.click(screen.getByRole('button', { name: /odeslat kód/i }))
    // The kit CodeInput is a group of six single-digit boxes; paste into the first to distribute
    // the 6-digit code (mirrors CustomerLoginStep.test's pasteCode helper). Auto-submits on the
    // 6th digit → verify-code → create order.
    const codeGroup = await screen.findByRole('group', { name: /ověřovací kód/i })
    await user.click(within(codeGroup).getAllByRole('textbox')[0])
    await user.paste('123456')

    await waitFor(() => expect(onOrdered).toHaveBeenCalledWith('Z9Z9Z9'))
    expect(mockCreate.mock.calls[0][0].priceType).toBe('Fixed')
  })

  it('shows an error and stays on the sheet when create fails', async () => {
    const user = userEvent.setup()
    mockCreate.mockRejectedValue(new Error('boom'))
    renderSheet({ quote: quoteResult({ kind: 'fixed', priceCzk: 250, routeId: 'r1' }) })
    await user.click(screen.getByRole('button', { name: /^objednat$/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/nepodařilo|chyba|zkuste/i)
  })

  it('Escape on the collapsed sheet closes it (fires onCancel)', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderSheet()
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Escape closes the options sheet first when it is open, without cancelling the order', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderSheet()
    await user.click(screen.getByRole('button', { name: /^poznámka$/i }))
    expect(screen.getByText(/kdy vás vyzvednout/i)).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByText(/kdy vás vyzvednout/i)).not.toBeInTheDocument()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('has no axe violations', async () => {
    const { container } = renderSheet()
    expect(await axe(container)).toHaveNoViolations()
  })
})
