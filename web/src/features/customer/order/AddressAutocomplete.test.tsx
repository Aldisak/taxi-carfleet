import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'

vi.mock('../../../shared/api/client', () => ({
  getGeoSuggest: vi.fn(),
}))

import { getGeoSuggest } from '../../../shared/api/client'
import { AddressAutocomplete, type AddressValue } from './AddressAutocomplete'

const mockSuggest = vi.mocked(getGeoSuggest)

function renderAc(overrides: Partial<Parameters<typeof AddressAutocomplete>[0]> = {}) {
  const onChange = overrides.onChange ?? vi.fn()
  const value: AddressValue = overrides.value ?? { address: '', lat: null, lng: null }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <AddressAutocomplete
            label="customer.custom.pickupLabel"
            placeholder="customer.custom.pickupPlaceholder"
            value={value}
            onChange={onChange}
            showUseMyLocation={overrides.showUseMyLocation ?? true}
          />
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
  return { ...utils, onChange }
}

describe('AddressAutocomplete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('auth.accessToken', 'customer-token')
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('debounces typing and shows suggestions; picking one sets the coords', async () => {
    const user = userEvent.setup()
    mockSuggest.mockResolvedValue({ items: [{ label: 'Hlavní 1, Praha', lat: 50.0875, lng: 14.4213 }] })
    const { onChange } = renderAc()

    await user.type(screen.getByLabelText(/odkud vás vyzvedneme/i), 'Hlavní')
    const option = await screen.findByRole('option', { name: /hlavní 1, praha/i })
    await user.click(option)

    expect(onChange).toHaveBeenLastCalledWith<[AddressValue]>({
      address: 'Hlavní 1, Praha',
      lat: 50.0875,
      lng: 14.4213,
    })
  })

  it('shows street + municipality on each suggestion so two same-named places are distinguishable (AC#2)', async () => {
    const user = userEvent.setup()
    mockSuggest.mockResolvedValue({
      items: [
        { label: 'Náměstí 1', street: 'Náměstí', municipality: 'Kolín', lat: 50.028, lng: 15.2 },
        { label: 'Náměstí 1', street: 'Náměstí', municipality: 'Kutná Hora', lat: 49.948, lng: 15.268 },
      ],
    })
    renderAc()

    await user.type(screen.getByLabelText(/odkud vás vyzvedneme/i), 'Náměstí')

    // Both options carry the town in their accessible name (rendered as plain text, not
    // aria-hidden) so a screen-reader user can tell Kolín from Kutná Hora.
    const kolin = await screen.findByRole('option', { name: /kolín/i })
    const kutna = await screen.findByRole('option', { name: /kutná hora/i })
    expect(kolin).toHaveTextContent('Náměstí')
    expect(kolin).toHaveTextContent('Kolín')
    expect(kutna).toHaveTextContent('Kutná Hora')
  })

  it('shows "Žádné návrhy" when the server returns an empty list', async () => {
    const user = userEvent.setup()
    mockSuggest.mockResolvedValue({ items: [] })
    renderAc()
    await user.type(screen.getByLabelText(/odkud vás vyzvedneme/i), 'xyzzy')
    expect(await screen.findByText(/žádné návrhy/i)).toBeInTheDocument()
  })

  it('drops a GPS pin via "Použít moji polohu" (no reverse geocode — client stub)', async () => {
    const user = userEvent.setup()
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({ coords: { latitude: 50.1, longitude: 14.3 } } as GeolocationPosition),
    )
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })

    const { onChange } = renderAc()
    await user.click(screen.getByRole('button', { name: /použít moji polohu/i }))

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith<[AddressValue]>({
        address: 'Moje poloha (GPS)',
        lat: 50.1,
        lng: 14.3,
      }),
    )
  })

  it('shows a friendly message when location permission is denied (form still usable)', async () => {
    const user = userEvent.setup()
    const getCurrentPosition = vi.fn((_success: PositionCallback, error?: PositionErrorCallback | null) =>
      error?.({ code: 1, message: 'denied' } as GeolocationPositionError),
    )
    vi.stubGlobal('navigator', { ...navigator, geolocation: { getCurrentPosition } })

    renderAc()
    await user.click(screen.getByRole('button', { name: /použít moji polohu/i }))
    expect(await screen.findByText(/polohu se nepodařilo zjistit/i)).toBeInTheDocument()
    // The input is still there — typing/drag still function.
    expect(screen.getByLabelText(/odkud vás vyzvedneme/i)).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderAc()
    expect(await axe(container)).toHaveNoViolations()
  })
})
