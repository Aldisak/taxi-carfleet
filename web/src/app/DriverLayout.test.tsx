import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from 'styled-components'
import { theme } from '../shared/theme/theme'
import i18n from '../shared/i18n'
import type { OrderDetailDto } from '../shared/api/client'

// All vi.mock() factories are hoisted to the top of the module by Vitest.
// Variables defined at module scope are NOT yet initialized when the factory runs.
// Solution: define the mock functions INSIDE the factory so they are stable at factory-call time,
// then retrieve them via vi.mocked() after the module imports complete.

vi.mock('../shared/api/refresh', () => ({
  enableSilentRefresh: vi.fn(),
  scheduleProactiveRefresh: vi.fn(),
}))

vi.mock('../shared/api/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn().mockReturnValue(null),
  },
}))

// Hub + offer wiring is hosted by DriverLayout (D12) but is not the subject of these
// boot tests — mock them so no SignalR connection / QueryClient is required.
vi.mock('../shared/realtime/useFleetHub', () => ({ useFleetHub: vi.fn() }))
vi.mock('../features/driver/offer/useOfferListener', () => ({ useOfferListener: vi.fn() }))

// State-driven offer store: mutate `mockOffer` per test.
let mockOffer: { dto: OrderDetailDto; expiresAt: string } | null = null
vi.mock('../features/driver/offer/useOfferStore', () => ({
  useOfferStore: (selector: (s: { offer: unknown; clearOffer: unknown }) => unknown) =>
    selector({ offer: mockOffer, clearOffer: vi.fn() }),
}))

// State-driven active-order store: mutate `mockActiveOrder` to toggle BottomNav visibility.
let mockActiveOrder: OrderDetailDto | null = null
vi.mock('../features/driver/ride/useActiveOrderStore', () => ({
  useActiveOrderStore: (selector: (s: { order: unknown }) => unknown) =>
    selector({ order: mockActiveOrder }),
}))

// OfferCard stub so we can assert it renders (and OfferTakeover no longer does).
vi.mock('../features/driver/offer/OfferCard', () => ({
  OfferCard: () => <div data-testid="offer-card" />,
}))

// Position reporter pulls useDriverMe (a query) + geolocation — mock it out.
vi.mock('../features/driver/position/DriverPositionReporter', () => ({
  DriverPositionReporter: () => <div data-testid="position-reporter" />,
}))

// Queue bar pulls the hub state + IDB — mock it out.
vi.mock('../features/driver/queue/DriverQueueBar', () => ({
  DriverQueueBar: () => <div data-testid="queue-bar" />,
}))

import { DriverLayout } from './DriverLayout'
import { enableSilentRefresh, scheduleProactiveRefresh } from '../shared/api/refresh'
import { authStorage } from '../shared/api/auth-storage'

function renderDriverLayout() {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={['/driver']}>
        <Routes>
          <Route path="/driver" element={<DriverLayout />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('DriverLayout boot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authStorage.getAccessToken).mockReturnValue(null)
  })

  it('calls enableSilentRefresh("/driver/login") on mount', () => {
    renderDriverLayout()

    expect(vi.mocked(enableSilentRefresh)).toHaveBeenCalledWith('/driver/login')
  })

  it('schedules proactive refresh when access token is present on mount', () => {
    const fakeToken = 'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjk5OTk5OTk5OTl9.sig'
    vi.mocked(authStorage.getAccessToken).mockReturnValue(fakeToken)

    renderDriverLayout()

    expect(vi.mocked(scheduleProactiveRefresh)).toHaveBeenCalledWith(fakeToken)
  })

  it('does NOT call scheduleProactiveRefresh when no access token is present', () => {
    vi.mocked(authStorage.getAccessToken).mockReturnValue(null)

    renderDriverLayout()

    expect(vi.mocked(scheduleProactiveRefresh)).not.toHaveBeenCalled()
  })
})

const ORDER = { id: 'o1' } as OrderDetailDto

function renderWithChild() {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter initialEntries={['/driver']}>
        <Routes>
          <Route path="/driver" element={<DriverLayout />}>
            <Route index element={<div data-testid="child" />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('DriverLayout offer + BottomNav (UC-019 WI-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authStorage.getAccessToken).mockReturnValue(null)
    mockOffer = null
    mockActiveOrder = null
  })

  it('renders OfferCard (not OfferTakeover) when the offer store has an offer', () => {
    mockOffer = { dto: ORDER, expiresAt: '2026-09-17T10:05:00Z' }
    renderWithChild()
    expect(screen.getByTestId('offer-card')).toBeInTheDocument()
  })

  it('mounts the session position reporter + queue bar', () => {
    renderWithChild()
    expect(screen.getByTestId('position-reporter')).toBeInTheDocument()
    expect(screen.getByTestId('queue-bar')).toBeInTheDocument()
  })

  it('shows the BottomNav (Domů/Historie/Nastavení) when there is no active ride', () => {
    mockActiveOrder = null
    renderWithChild()
    expect(screen.getByRole('navigation', { name: i18n.t('driver.nav.label') })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: i18n.t('driver.nav.home') })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: i18n.t('driver.nav.history') })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: i18n.t('driver.nav.settings') })).toBeInTheDocument()
  })

  it('hides the BottomNav while an active ride is in progress', () => {
    mockActiveOrder = ORDER
    renderWithChild()
    expect(
      screen.queryByRole('navigation', { name: i18n.t('driver.nav.label') }),
    ).not.toBeInTheDocument()
  })
})
