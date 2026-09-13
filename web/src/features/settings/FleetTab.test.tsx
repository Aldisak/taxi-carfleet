import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'

vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return { ...actual, getFleetSettings: vi.fn() }
})

import * as client from '../../shared/api/client'
import { FleetTab } from './FleetTab'

const mockGetFleetSettings = vi.mocked(client.getFleetSettings)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ThemeProvider, { theme }, createElement(I18nextProvider, { i18n }, children)),
    )
}

function settings(overrides?: Partial<client.FleetSettingsDto>): client.FleetSettingsDto {
  return {
    name: 'Taxi Kolín',
    phone: '+420321123456',
    offerTimeoutSeconds: 30,
    autoDispatchEnabled: false,
    ...overrides,
  }
}

async function renderTab() {
  render(createElement(FleetTab), { wrapper: makeWrapper() })
  // Wait for the query to resolve (loading → content).
  await screen.findByTestId('fleet-name')
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('FleetTab — SMS cost/cap panel (UC-005 B2)', () => {
  it('hides the SMS panel when the backend omits the cap fields', async () => {
    mockGetFleetSettings.mockResolvedValue(settings())
    await renderTab()
    expect(screen.queryByTestId('sms-month-count')).not.toBeInTheDocument()
  })

  it('shows count, estimated cost, and cap when present', async () => {
    mockGetFleetSettings.mockResolvedValue(
      settings({ smsSentThisMonth: 40, smsUnitCostCzk: 1, smsMonthlyCapCzk: 500 }),
    )
    await renderTab()
    expect(screen.getByTestId('sms-month-count')).toHaveTextContent('40')
    expect(screen.getByTestId('sms-estimated-cost')).toHaveTextContent(/40/)
    expect(screen.getByTestId('sms-cap')).toHaveTextContent(/500/)
    // Well below cap → no warning.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an over-cap warning when the estimated cost reaches the cap', async () => {
    mockGetFleetSettings.mockResolvedValue(
      settings({ smsSentThisMonth: 500, smsUnitCostCzk: 1, smsMonthlyCapCzk: 500 }),
    )
    await renderTab()
    expect(screen.getByRole('alert')).toHaveTextContent(/vyčerpán/i)
  })
})
