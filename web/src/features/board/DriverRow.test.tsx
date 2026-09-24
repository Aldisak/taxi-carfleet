import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the hub connection state so the override button is not blocked in tests
vi.mock('../../shared/realtime/useFleetHub', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/realtime/useFleetHub')>()
  return {
    ...actual,
    useHubConnectionState: vi.fn(() => 'connected'),
  }
})
import { render, screen, waitFor } from '@testing-library/react'
import { axe } from '../../shared/test/axe'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'
import { DriverRow } from './DriverRow'
import type { DriverSummaryDto } from '../../shared/api/client'
import * as client from '../../shared/api/client'

function makeDriver(overrides: Partial<DriverSummaryDto> = {}): DriverSummaryDto {
  return {
    driverId: 'driver-1',
    displayName: 'Jan Novák',
    status: 'Free',
    currentVehiclePlate: '1AB 2345',
    lastPositionAt: new Date(Date.now() - 5000).toISOString(),
    lastLat: 50.0,
    lastLng: 15.0,
    ...overrides,
  }
}

function renderRow(driver: DriverSummaryDto = makeDriver()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <DriverRow driver={driver} />
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

describe('DriverRow — renders fields', () => {
  it('renders driver display name', () => {
    renderRow()
    expect(screen.getByText('Jan Novák')).toBeInTheDocument()
  })

  it('renders vehicle plate', () => {
    renderRow()
    expect(screen.getByLabelText('vehicle-plate')).toHaveTextContent('1AB 2345')
  })

  it('renders Czech status pill for Free', () => {
    renderRow()
    expect(screen.getByLabelText('driver-status-Free')).toHaveTextContent('Volný')
  })

  it('renders Czech status pill for Offline', () => {
    renderRow(makeDriver({ status: 'Offline' }))
    expect(screen.getByLabelText('driver-status-Offline')).toHaveTextContent('Offline')
  })

  it('renders position age in Czech', () => {
    renderRow(makeDriver({ lastPositionAt: new Date(Date.now() - 12000).toISOString() }))
    // Should show "před N s" format
    const posAgeEl = screen.getByLabelText('position-age')
    expect(posAgeEl.textContent).toMatch(/před \d+ s/)
  })

  it('renders em dash when lastPositionAt is null', () => {
    renderRow(makeDriver({ lastPositionAt: null }))
    expect(screen.getByLabelText('position-age')).toHaveTextContent('—')
  })
})

describe('DriverRow — override status', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows override popover when "Nastavit stav" is clicked', async () => {
    renderRow()
    const user = userEvent.setup()
    const btn = screen.getByLabelText('Možnosti řidiče')
    await user.click(btn)
    expect(screen.getByRole('menu', { name: 'status-override-menu' })).toBeInTheDocument()
  })

  it('calls postOverrideDriverStatus with Free when Free is clicked', async () => {
    const spy = vi.spyOn(client, 'postOverrideDriverStatus').mockResolvedValue(undefined)
    renderRow()
    const user = userEvent.setup()

    await user.click(screen.getByLabelText('Možnosti řidiče'))
    await user.click(screen.getByLabelText('set-status-Free'))

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith('driver-1', { status: 'Free' })
    })
  })

  it('calls postOverrideDriverStatus with Busy when Busy is clicked', async () => {
    const spy = vi.spyOn(client, 'postOverrideDriverStatus').mockResolvedValue(undefined)
    renderRow()
    const user = userEvent.setup()

    await user.click(screen.getByLabelText('Možnosti řidiče'))
    await user.click(screen.getByLabelText('set-status-Busy'))

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith('driver-1', { status: 'Busy' })
    })
  })

  it('calls postOverrideDriverStatus with Offline when Offline is clicked', async () => {
    const spy = vi.spyOn(client, 'postOverrideDriverStatus').mockResolvedValue(undefined)
    renderRow()
    const user = userEvent.setup()

    await user.click(screen.getByLabelText('Možnosti řidiče'))
    await user.click(screen.getByLabelText('set-status-Offline'))

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith('driver-1', { status: 'Offline' })
    })
  })
})

describe('DriverRow — accessibility', () => {
  it('has no axe violations', async () => {
    const { container } = renderRow()
    expect(await axe(container)).toHaveNoViolations()
  })
})
