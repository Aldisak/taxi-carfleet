import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'
import { axe } from '../../shared/test/axe'

vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return {
    ...actual,
    getFleetSettings: vi.fn(),
    getPublicFleet: vi.fn(),
    putFleetSettings: vi.fn(),
    postFleetLogo: vi.fn(),
    getGeoUsage: vi.fn(),
  }
})

import * as client from '../../shared/api/client'
import { FleetTab } from './FleetTab'

const mockGetFleetSettings = vi.mocked(client.getFleetSettings)
const mockGetPublicFleet = vi.mocked(client.getPublicFleet)
const mockPutFleetSettings = vi.mocked(client.putFleetSettings)
const mockPostFleetLogo = vi.mocked(client.postFleetLogo)

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
    // UC-007 A7b: GET /fleet/settings now returns the full editable set, so the form prefills
    // color/welcome/smsCap from here directly (no public/fleet workaround).
    primaryColorHex: '#1e88e5',
    welcomeText: 'Vítejte',
    smsMonthlyCapCzk: 500,
    ...overrides,
  }
}

function publicFleet(overrides?: Partial<client.PublicFleetResponse>): client.PublicFleetResponse {
  return {
    name: 'Taxi Kolín',
    phone: '+420321123456',
    primaryColorHex: '#1e88e5',
    currency: 'CZK',
    timeZone: 'Europe/Prague',
    welcomeText: 'Vítejte',
    logoUrl: null,
    ...overrides,
  }
}

async function renderTab() {
  render(createElement(FleetTab), { wrapper: makeWrapper() })
  // Wait for the form to seed (name input gets the loaded value).
  await screen.findByDisplayValue('Taxi Kolín')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetFleetSettings.mockResolvedValue(settings())
  mockGetPublicFleet.mockResolvedValue(publicFleet())
  vi.mocked(client.getGeoUsage).mockResolvedValue({
    creditsUsedThisMonth: 40000,
    creditBudget: 250000,
    usagePercent: 16,
    year: 2026,
    month: 9,
  })
})

describe('FleetTab — self-service form (UC-007 A6)', () => {
  it('pre-fills name/phone/color/welcome from GET /fleet/settings (full editable set, A7b)', async () => {
    await renderTab()
    expect(screen.getByLabelText('Telefon flotily')).toHaveValue('+420321123456')
    expect(screen.getByLabelText('Barevný kód')).toHaveValue('#1e88e5')
    expect(screen.getByLabelText('Uvítací text')).toHaveValue('Vítejte')
    expect(screen.getByLabelText('Měsíční limit SMS (Kč)')).toHaveValue(500)
  })

  it('renders the auto-dispatch toggle disabled (v1.1)', async () => {
    await renderTab()
    expect(screen.getByTestId('auto-dispatch-toggle')).toBeDisabled()
  })

  it('PUTs the settings on save with empty color/welcome mapped to null', async () => {
    const user = userEvent.setup()
    mockGetFleetSettings.mockResolvedValue(settings({ primaryColorHex: null, welcomeText: null }))
    mockPutFleetSettings.mockResolvedValue(undefined)
    await renderTab()

    await user.click(screen.getByRole('button', { name: 'Uložit' }))

    await waitFor(() => expect(mockPutFleetSettings).toHaveBeenCalledTimes(1))
    expect(mockPutFleetSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Taxi Kolín',
        phone: '+420321123456',
        primaryColorHex: null,
        welcomeText: null,
        offerTimeoutSeconds: 30,
        autoDispatchEnabled: false,
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(/uloženo/i)
  })

  it('blocks save and shows an error when the color hex is malformed', async () => {
    const user = userEvent.setup()
    await renderTab()

    const hex = screen.getByLabelText('Barevný kód')
    await user.clear(hex)
    await user.type(hex, 'notacolor')
    await user.click(screen.getByRole('button', { name: 'Uložit' }))

    expect(mockPutFleetSettings).not.toHaveBeenCalled()
    expect(screen.getByText(/platný barevný kód/i)).toBeInTheDocument()
  })

  it('rejects a non-PNG logo client-side without calling the upload', async () => {
    const user = userEvent.setup()
    await renderTab()

    const input = screen.getByLabelText('Logo flotily') as HTMLInputElement
    const jpg = new File([new Uint8Array([1, 2, 3])], 'logo.jpg', { type: 'image/jpeg' })
    await user.upload(input, jpg)

    expect(mockPostFleetLogo).not.toHaveBeenCalled()
    expect(screen.getByText(/PNG/i)).toBeInTheDocument()
  })

  it('uploads a valid PNG logo', async () => {
    const user = userEvent.setup()
    mockPostFleetLogo.mockResolvedValue(undefined)
    await renderTab()

    const input = screen.getByLabelText('Logo flotily') as HTMLInputElement
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'logo.png', { type: 'image/png' })
    await user.upload(input, png)

    await waitFor(() => expect(mockPostFleetLogo).toHaveBeenCalledTimes(1))
  })

  it('has no axe violations', async () => {
    const { container } = render(createElement(FleetTab), { wrapper: makeWrapper() })
    await screen.findByDisplayValue('Taxi Kolín')
    expect(await axe(container)).toHaveNoViolations()
  })
})
