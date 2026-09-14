import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from 'styled-components'
import { theme } from '../shared/theme/theme'

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
vi.mock('../features/driver/offer/useOfferStore', () => ({
  useOfferStore: (selector: (s: unknown) => unknown) =>
    selector({ offer: null, clearOffer: vi.fn() }),
}))

// Position reporter pulls useDriverMe (a query) + geolocation — mock it out of the boot tests.
vi.mock('../features/driver/position/DriverPositionReporter', () => ({
  DriverPositionReporter: () => null,
}))

// Queue bar pulls the hub state + IDB — mock it out of the boot tests.
vi.mock('../features/driver/queue/DriverQueueBar', () => ({
  DriverQueueBar: () => null,
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
