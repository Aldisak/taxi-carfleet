import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../../../../shared/i18n'
import { theme } from '../../../../shared/theme/theme'
import { axe } from '../../../../shared/test/axe'
import type { PlaceDto } from '../../../../shared/api/client'
import type { PinPickerMapProps } from '../PinPickerMap'

// Stub the lazy Leaflet pin so jsdom never loads react-leaflet. The stub exposes a button
// that drops a pin, so the editor can resolve coordinates without a real map.
vi.mock('../PinPickerMap', () => ({
  default: ({ onPick }: PinPickerMapProps) => (
    <button type="button" onClick={() => onPick({ lat: 49.95, lng: 15.27 })}>
      fake-drop-pin
    </button>
  ),
}))

vi.mock('../../../../shared/api/client', () => ({
  getPlaces: vi.fn(),
  createPlace: vi.fn(),
  updatePlace: vi.fn(),
  deletePlace: vi.fn(),
}))

import { getPlaces, createPlace, deletePlace } from '../../../../shared/api/client'
import { PlacesTab } from './PlacesTab'

const mockGetPlaces = vi.mocked(getPlaces)
const mockCreatePlace = vi.mocked(createPlace)
const mockDeletePlace = vi.mocked(deletePlace)

const seedPlaces: PlaceDto[] = [
  { id: 'p1', name: 'Nádraží KH', lat: 49.95, lng: 15.27, address: 'Nádražní 1', sortOrder: 0, isEnabled: true },
  { id: 'p2', name: 'Nemocnice', lat: 49.96, lng: 15.28, address: 'Kutnohorská 5', sortOrder: 1, isEnabled: false },
]

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <PlacesTab />
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

describe('PlacesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPlaces.mockResolvedValue(seedPlaces)
  })

  it('lists places ordered by sort order with address + disabled state', async () => {
    renderTab()
    expect(await screen.findByText('Nádraží KH')).toBeInTheDocument()
    expect(screen.getByText(/Nádražní 1/)).toBeInTheDocument()
    expect(screen.getByText(/Kutnohorská 5 · vypnuto/)).toBeInTheDocument()
  })

  it('creates a place via the editor (pin resolves coordinates)', async () => {
    const user = userEvent.setup()
    mockCreatePlace.mockResolvedValue(seedPlaces[0]!)
    renderTab()
    await screen.findByText('Nádraží KH')

    await user.click(screen.getByRole('button', { name: /přidat místo/i }))
    await user.type(screen.getByLabelText(/název místa/i), 'Pošta')
    await user.type(screen.getByLabelText(/adresa/i), 'Husova 10')
    await user.click(screen.getByRole('button', { name: /fake-drop-pin/i }))
    await user.click(screen.getByRole('button', { name: /uložit/i }))

    await waitFor(() => expect(mockCreatePlace).toHaveBeenCalledTimes(1))
    const req = mockCreatePlace.mock.calls[0]![0]
    expect(req.name).toBe('Pošta')
    expect(req.address).toBe('Husova 10')
    expect(req.lat).toBe(49.95)
    expect(req.lng).toBe(15.27)
  })

  it('blocks save without a dropped pin (coords required)', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findByText('Nádraží KH')

    await user.click(screen.getByRole('button', { name: /přidat místo/i }))
    await user.type(screen.getByLabelText(/název místa/i), 'Pošta')
    await user.type(screen.getByLabelText(/adresa/i), 'Husova 10')
    await user.click(screen.getByRole('button', { name: /uložit/i }))

    expect(mockCreatePlace).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/určete polohu v mapě/i)
  })

  it('deletes a place', async () => {
    const user = userEvent.setup()
    mockDeletePlace.mockResolvedValue(undefined)
    renderTab()
    await screen.findByText('Nádraží KH')

    await user.click(screen.getByRole('button', { name: /smazat místo nádraží kh/i }))
    await waitFor(() => expect(mockDeletePlace).toHaveBeenCalledWith('p1'))
  })

  it('has no axe violations', async () => {
    const { container } = renderTab()
    await screen.findByText('Nádraží KH')
    expect(await axe(container)).toHaveNoViolations()
  })
})
