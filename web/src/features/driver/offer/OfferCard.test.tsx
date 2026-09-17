import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import type { OrderDetailDto } from '../../../shared/api/client'

// --- Hook mocks ---
// Sound loop would fight fake timers; no-op it.
vi.mock('./useOfferSound', () => ({ useOfferSound: vi.fn() }))

// CountdownRing runs a real setInterval that fights userEvent's real-timer delays
// and the fake clock; stub it, exposing a manual expiry trigger for the expiry test.
let lastOnExpired: (() => void) | undefined
vi.mock('./CountdownRing', () => ({
  CountdownRing: ({ onExpired }: { onExpired?: () => void }) => {
    lastOnExpired = onExpired
    return <span>30</span>
  },
}))

// Route/ETA — deterministic, no real geolocation.
vi.mock('./useOfferRoute', () => ({
  useOfferRoute: () => ({ distanceMeters: 3200, durationSeconds: 480, isLoading: false }),
}))

const acceptFn = vi.fn<(id: string) => Promise<{ type: string }>>()
let acceptPending = false
vi.mock('./useOfferAccept', () => ({
  useOfferAccept: () => ({ isPending: acceptPending, accept: acceptFn }),
}))

const declineFn = vi.fn<(id: string, reason: string) => Promise<{ type: string }>>()
vi.mock('./useOfferDecline', () => ({
  useOfferDecline: () => ({ isPending: false, decline: declineFn }),
}))

// Accept-success hydrates the active-ride store via reconcileActiveRide (WI-5 defect fix).
// Mock it so these tests don't hit the real GET /drivers/me network path — the
// accept→hydration contract itself is pinned by acceptHydration.test.tsx. Default to a
// non-active outcome so nothing is written to the shared store during these cases.
const reconcileMock = vi.fn().mockResolvedValue({ outcome: 'none' })
vi.mock('../ride/useRideRestore', () => ({
  reconcileActiveRide: (id: string) => reconcileMock(id),
}))

// Pin the no-navigation behavior change: a navigate spy must have 0 calls.
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import { OfferCard } from './OfferCard'

function makeOrder(overrides: Partial<OrderDetailDto> = {}): OrderDetailDto {
  return {
    id: 'order-1',
    publicCode: 'ABC123',
    status: 'New',
    source: 'Phone',
    customerPhone: '+420777123456',
    customerName: 'Jan Novák',
    pickupAddress: 'Nádražní 1, Kutná Hora',
    pickupLat: 49.95,
    pickupLng: 15.26,
    dropoffAddress: 'Centrum Kutná Hora',
    dropoffLat: 49.94,
    dropoffLng: 15.27,
    scheduledAt: null,
    note: null,
    passengers: 1,
    priceType: 'Fixed',
    estimatedPriceCzk: null,
    fixedPriceCzk: 180,
    finalPriceCzk: null,
    paymentType: null,
    driverId: null,
    vehicleId: null,
    createdAt: '2026-09-17T10:00:00Z',
    updatedAt: '2026-09-17T10:00:00Z',
    allowedActions: [],
    version: 1,
    ...overrides,
  }
}

function renderCard(opts: { dto?: OrderDetailDto; onDismiss?: () => void; expiresAt?: string } = {}) {
  const onDismiss = opts.onDismiss ?? vi.fn()
  const expiresAt = opts.expiresAt ?? new Date(Date.now() + 30_000).toISOString()
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider theme={theme}>
        <OfferCard dto={opts.dto ?? makeOrder()} expiresAt={expiresAt} onDismiss={onDismiss} />
      </ThemeProvider>
    </I18nextProvider>,
  )
  return { ...utils, onDismiss }
}

describe('OfferCard', () => {
  beforeEach(() => {
    acceptFn.mockReset().mockResolvedValue({ type: 'success' })
    declineFn.mockReset().mockResolvedValue({ type: 'success' })
    mockNavigate.mockReset()
    acceptPending = false
  })

  // Structural guard: a test that leaks a fake clock (e.g. on timeout) must not
  // hang the next real-timer test.
  afterEach(() => { vi.useRealTimers() })

  it('renders as a region (not a dialog) with pickup, dropoff, price and a countdown', () => {
    renderCard()
    expect(screen.getByRole('region', { name: 'Nová objednávka' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Nádražní 1, Kutná Hora')).toBeInTheDocument()
    expect(screen.getByText('Centrum Kutná Hora')).toBeInTheDocument()
    // PriceBadge (fixed 180 Kč)
    expect(screen.getByText(/180 Kč/)).toBeInTheDocument()
    // Countdown ring renders the remaining seconds
    expect(screen.getByText(/^\d+$/)).toBeInTheDocument()
    // Distance + ETA to pickup via useOfferRoute (3200 m / 480 s -> 3.2 km / 8 min)
    expect(screen.getByText('3.2 km / 8 min')).toBeInTheDocument()
  })

  it('on Accept success calls accept + onDismiss and NEVER navigates', async () => {
    const { onDismiss } = renderCard()
    await userEvent.click(screen.getByRole('button', { name: 'Přijmout' }))
    expect(acceptFn).toHaveBeenCalledWith('order-1')
    expect(onDismiss).toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('on Accept stale shows the stale banner and dismisses after 2000ms', async () => {
    vi.useFakeTimers()
    acceptFn.mockResolvedValue({ type: 'stale' })
    const onDismiss = vi.fn()
    render(
      <I18nextProvider i18n={i18n}>
        <ThemeProvider theme={theme}>
          <OfferCard
            dto={makeOrder()}
            expiresAt={new Date(Date.now() + 30_000).toISOString()}
            onDismiss={onDismiss}
          />
        </ThemeProvider>
      </I18nextProvider>,
    )
    // async act flushes the awaited accept() microtask so the stale banner paints
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Přijmout' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Nabídka již není dostupná')
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onDismiss).toHaveBeenCalled()
  })

  it('on Accept offline shows the offline hint and stays open', async () => {
    acceptFn.mockResolvedValue({ type: 'offline' })
    const { onDismiss } = renderCard()
    await userEvent.click(screen.getByRole('button', { name: 'Přijmout' }))
    expect(screen.getByText('Bez připojení, zkuste znovu')).toBeInTheDocument()
    expect(onDismiss).not.toHaveBeenCalled()
    expect(screen.getByRole('region', { name: 'Nová objednávka' })).toBeInTheDocument()
  })

  it('Decline without a reason shows the reason error and does not call decline; then picking one declines', async () => {
    const { onDismiss } = renderCard()
    await userEvent.click(screen.getByRole('button', { name: 'Odmítnout' }))
    // declining phase — confirm without a reason
    await userEvent.click(screen.getByRole('button', { name: 'Odmítnout' }))
    expect(screen.getByText('Vyberte důvod odmítnutí')).toBeInTheDocument()
    expect(declineFn).not.toHaveBeenCalled()
    // pick a reason then confirm
    await userEvent.click(screen.getByRole('button', { name: 'Daleko' }))
    await userEvent.click(screen.getByRole('button', { name: 'Odmítnout' }))
    expect(declineFn).toHaveBeenCalledWith('order-1', 'Daleko')
    expect(onDismiss).toHaveBeenCalled()
  })

  it('disables the Accept button while pending (double-tap guard)', () => {
    acceptPending = true
    renderCard()
    expect(screen.getByRole('button', { name: 'Přijímám...' })).toBeDisabled()
  })

  it('on expiry shows the expired message then dismisses after 2000ms', () => {
    vi.useFakeTimers()
    try {
      const onDismiss = vi.fn()
      const expiresAt = new Date(Date.now() + 5000).toISOString()
      render(
        <I18nextProvider i18n={i18n}>
          <ThemeProvider theme={theme}>
            <OfferCard dto={makeOrder()} expiresAt={expiresAt} onDismiss={onDismiss} />
          </ThemeProvider>
        </I18nextProvider>,
      )
      // Trigger the countdown's onExpired (CountdownRing is stubbed)
      act(() => { lastOnExpired?.() })
      expect(screen.getByText('Nabídka vypršela')).toBeInTheDocument()
      expect(onDismiss).not.toHaveBeenCalled()
      act(() => { vi.advanceTimersByTime(2000) })
      expect(onDismiss).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('has no axe violations', async () => {
    const { container } = renderCard()
    expect(await axe(container)).toHaveNoViolations()
  })
})
