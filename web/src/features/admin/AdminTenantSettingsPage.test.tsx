import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'
import { axe } from '../../shared/test/axe'

vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return {
    ...actual,
    getAdminTenantSettings: vi.fn(),
    putAdminTenantSettings: vi.fn(),
  }
})

import * as client from '../../shared/api/client'
import { AdminTenantSettingsPage } from './AdminTenantSettingsPage'

const mockGet = vi.mocked(client.getAdminTenantSettings)
const mockPut = vi.mocked(client.putAdminTenantSettings)

const FLEET_ID = '11111111-1111-1111-1111-111111111111'

function dto(overrides?: Partial<client.AdminTenantSettingsDto>): client.AdminTenantSettingsDto {
  return {
    name: 'Taxi Demo',
    phone: '+420321700100',
    currency: 'CZK',
    timeZone: 'Europe/Prague',
    primaryColorHex: '#1e88e5',
    isActive: true,
    offerTimeoutSeconds: 45,
    autoDispatchEnabled: false,
    autoDispatchAfterSeconds: 0,
    maxOfferRadiusKm: 10,
    smsSenderName: 'TaxiDemo',
    welcomeText: 'Vítejte',
    smsMonthlyCapCzk: 500,
    smsUnitCostCzk: 2,
    mapyBrowserKey: 'browser-key-abc',
    mapyServerKeyConfigured: true,
    mapCenterLat: 50.02,
    mapCenterLng: 15.27,
    mapZoom: 12,
    geoMonthlyCreditBudget: 250000,
    ...overrides,
  }
}

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(
      MemoryRouter,
      { initialEntries: [`/admin/fleets/${FLEET_ID}/settings`] },
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          ThemeProvider,
          { theme },
          createElement(
            I18nextProvider,
            { i18n },
            createElement(
              Routes,
              null,
              createElement(Route, {
                path: '/admin/fleets/:fleetId/settings',
                element: children,
              }),
            ),
          ),
        ),
      ),
    )
}

async function renderPage() {
  render(createElement(AdminTenantSettingsPage), { wrapper: makeWrapper() })
  // Wait for the form to seed (name input gets the loaded value).
  await screen.findByDisplayValue('Taxi Demo')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGet.mockResolvedValue(dto())
})

describe('AdminTenantSettingsPage (UC-012)', () => {
  it('seeds the form fields from the fetched settings', async () => {
    await renderPage()
    expect(screen.getByLabelText('Telefon')).toHaveValue('+420321700100')
    expect(screen.getByLabelText('Časové pásmo')).toHaveValue('Europe/Prague')
    expect(screen.getByLabelText('Časový limit nabídky (s)')).toHaveValue(45)
    expect(screen.getByLabelText('Přiblížení mapy')).toHaveValue(12)
  })

  it('renders the desk title row: fleet name, an Aktivní pill, and one Uložit vše save', async () => {
    await renderPage()
    // The tenant name shows in the title row (26/800), not only as the field value.
    expect(screen.getAllByText('Taxi Demo').length).toBeGreaterThan(0)
    // "Aktivní" appears both as the title-row status pill and the toggle label.
    expect(screen.getAllByText('Aktivní').length).toBeGreaterThan(0)
    // Exactly ONE page-level save (not a per-section save).
    expect(screen.getAllByRole('button', { name: 'Uložit vše' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Deaktivovat' })).toBeInTheDocument()
  })

  it('renders the four desk section panels', async () => {
    await renderPage()
    for (const heading of ['Flotila', 'Dispečink', 'SMS', 'Mapa a Mapy.com']) {
      expect(screen.getByText(heading)).toBeInTheDocument()
    }
  })

  it('Deaktivovat flips the Aktivní toggle off (committed via the single save)', async () => {
    const user = userEvent.setup()
    await renderPage()
    const activeToggle = screen.getByLabelText('Aktivní') as HTMLInputElement
    expect(activeToggle.checked).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Deaktivovat' }))
    expect(activeToggle.checked).toBe(false)
  })

  it('loads the server-key field blank and shows the configured hint', async () => {
    await renderPage()
    const serverKey = screen.getByLabelText('Serverový klíč Mapy') as HTMLInputElement
    expect(serverKey).toHaveValue('')
    expect(serverKey).toHaveAttribute('type', 'password')
    // configured hint present (mapyServerKeyConfigured=true)
    expect(screen.getByText(/klíč je nastaven/i)).toBeInTheDocument()
  })

  it('shows the not-set hint when no server key is configured', async () => {
    mockGet.mockResolvedValue(dto({ mapyServerKeyConfigured: false }))
    await renderPage()
    expect(screen.getByText(/klíč není nastaven/i)).toBeInTheDocument()
  })

  it('submits the mapped request and shows the success banner', async () => {
    const user = userEvent.setup()
    mockPut.mockResolvedValue(undefined)
    await renderPage()

    await user.click(screen.getByRole('button', { name: 'Uložit vše' }))

    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1))
    expect(mockPut).toHaveBeenCalledWith(
      FLEET_ID,
      expect.objectContaining({
        name: 'Taxi Demo',
        phone: '+420321700100',
        currency: 'CZK',
        timeZone: 'Europe/Prague',
        offerTimeoutSeconds: 45,
        mapZoom: 12,
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(/uloženo/i)
  })

  it('SECURITY: blank server-key submit sends mapyServerKey null (keep)', async () => {
    const user = userEvent.setup()
    mockPut.mockResolvedValue(undefined)
    await renderPage()

    await user.click(screen.getByRole('button', { name: 'Uložit vše' }))

    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1))
    expect(mockPut).toHaveBeenCalledWith(FLEET_ID, expect.objectContaining({ mapyServerKey: null }))
  })

  it('SECURITY: typed server-key submit sends that value', async () => {
    const user = userEvent.setup()
    mockPut.mockResolvedValue(undefined)
    await renderPage()

    await user.type(screen.getByLabelText('Serverový klíč Mapy'), 'new-secret-key')
    await user.click(screen.getByRole('button', { name: 'Uložit vše' }))

    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1))
    expect(mockPut).toHaveBeenCalledWith(
      FLEET_ID,
      expect.objectContaining({ mapyServerKey: 'new-secret-key' }),
    )
  })

  it('blank browser-key submit sends mapyBrowserKey null; typed sends the value', async () => {
    const user = userEvent.setup()
    mockPut.mockResolvedValue(undefined)
    // seed with a blank browser key so the field loads empty
    mockGet.mockResolvedValue(dto({ mapyBrowserKey: null }))
    await renderPage()

    await user.click(screen.getByRole('button', { name: 'Uložit vše' }))
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1))
    expect(mockPut).toHaveBeenCalledWith(
      FLEET_ID,
      expect.objectContaining({ mapyBrowserKey: null }),
    )

    mockPut.mockClear()
    await user.type(screen.getByLabelText('Klíč Mapy pro prohlížeč'), 'pub-key')
    await user.click(screen.getByRole('button', { name: 'Uložit vše' }))
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1))
    expect(mockPut).toHaveBeenCalledWith(
      FLEET_ID,
      expect.objectContaining({ mapyBrowserKey: 'pub-key' }),
    )
  })

  it('blocks submit and shows an inline error when the color hex is malformed', async () => {
    const user = userEvent.setup()
    await renderPage()

    const hex = screen.getByLabelText('Barevný kód')
    await user.clear(hex)
    await user.type(hex, 'notacolor')
    await user.click(screen.getByRole('button', { name: 'Uložit vše' }))

    expect(mockPut).not.toHaveBeenCalled()
    expect(hex).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/platný barevný kód/i)).toBeInTheDocument()
  })

  it('shows the error banner when the mutation fails', async () => {
    const user = userEvent.setup()
    mockPut.mockRejectedValue(new Error('boom'))
    await renderPage()

    await user.click(screen.getByRole('button', { name: 'Uložit vše' }))

    expect(await screen.findByText(/nepodařilo uložit/i)).toBeInTheDocument()
  })

  it('shows a load-error state when the query fails', async () => {
    mockGet.mockRejectedValue(new Error('nope'))
    render(createElement(AdminTenantSettingsPage), { wrapper: makeWrapper() })
    expect(await screen.findByRole('alert')).toHaveTextContent(/nepodařilo načíst/i)
  })

  it('has no axe violations', async () => {
    const { container } = render(createElement(AdminTenantSettingsPage), { wrapper: makeWrapper() })
    await screen.findByDisplayValue('Taxi Demo')
    expect(await axe(container)).toHaveNoViolations()
  })
})
