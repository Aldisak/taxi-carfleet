import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
import { DestinationSearch } from './DestinationSearch'
import type { SelectedPlace } from './orderFlowState'

const mockSuggest = vi.mocked(getGeoSuggest)

function renderSearch(
  onSelectDestination: (place: SelectedPlace) => void = vi.fn(),
  near: { lat: number; lng: number } | null = null,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const utils = render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <DestinationSearch onSelectDestination={onSelectDestination} near={near} />
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
  return { ...utils, onSelectDestination }
}

describe('DestinationSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('typing >= 3 chars shows suggestions (works logged-out, anonymous-by-slug)', async () => {
    const user = userEvent.setup()
    mockSuggest.mockResolvedValue({
      items: [{ label: 'Nádraží', street: 'Nádražní', municipality: 'Kutná Hora', lat: 49.95, lng: 15.27 }],
    })
    renderSearch()

    // No token in localStorage — logged-out visitor still gets the dropdown.
    await user.type(screen.getByRole('combobox', { name: /kam to bude/i }), 'Nádr')

    const option = await screen.findByRole('option', { name: /nádraží/i })
    expect(option).toHaveTextContent('Nádraží')
    expect(option).toHaveTextContent('Kutná Hora')
  })

  it('ArrowDown + Enter selects the active option and fires onSelectDestination with coords', async () => {
    const user = userEvent.setup()
    mockSuggest.mockResolvedValue({
      items: [
        { label: 'Náměstí', street: 'Náměstí', municipality: 'Kolín', lat: 50.028, lng: 15.2 },
        { label: 'Nádraží', street: 'Nádražní', municipality: 'Kutná Hora', lat: 49.95, lng: 15.27 },
      ],
    })
    const { onSelectDestination } = renderSearch()

    const input = screen.getByRole('combobox', { name: /kam to bude/i })
    await user.type(input, 'Ná')
    await user.type(input, 'd')
    await screen.findByRole('option', { name: /náměstí/i })

    // Move to the second option and select it.
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    expect(onSelectDestination).toHaveBeenCalledWith<[SelectedPlace]>({
      label: 'Nádraží',
      lat: 49.95,
      lng: 15.27,
    })
  })

  it('clicking a suggestion fires onSelectDestination with a SelectedPlace', async () => {
    const user = userEvent.setup()
    mockSuggest.mockResolvedValue({
      items: [{ label: 'Nádraží', street: 'Nádražní', municipality: 'Kutná Hora', lat: 49.95, lng: 15.27 }],
    })
    const { onSelectDestination } = renderSearch()

    await user.type(screen.getByRole('combobox', { name: /kam to bude/i }), 'Nádr')
    await user.click(await screen.findByRole('option', { name: /nádraží/i }))

    expect(onSelectDestination).toHaveBeenCalledWith<[SelectedPlace]>({
      label: 'Nádraží',
      lat: 49.95,
      lng: 15.27,
    })
  })

  it('Escape collapses the overlay', async () => {
    const user = userEvent.setup()
    mockSuggest.mockResolvedValue({
      items: [{ label: 'Nádraží', lat: 49.95, lng: 15.27 }],
    })
    renderSearch()

    const input = screen.getByRole('combobox', { name: /kam to bude/i })
    await user.type(input, 'Nádr')
    await screen.findByRole('option', { name: /nádraží/i })

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders the no-results message when the server returns an empty list', async () => {
    const user = userEvent.setup()
    mockSuggest.mockResolvedValue({ items: [] })
    renderSearch()

    await user.type(screen.getByRole('combobox', { name: /kam to bude/i }), 'xyzzy')

    expect(await screen.findByText(/žádné návrhy/i)).toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('renders the SearchingLoader while suggestions are pending', async () => {
    const user = userEvent.setup()
    // Never-resolving promise keeps useSuggest in the loading state.
    mockSuggest.mockReturnValue(new Promise(() => {}))
    renderSearch()

    await user.type(screen.getByRole('combobox', { name: /kam to bude/i }), 'Nádr')

    expect(await screen.findByRole('status')).toBeInTheDocument()
  })

  it('threads the near prop into the suggest call (UC-018 WI-2)', async () => {
    const user = userEvent.setup()
    mockSuggest.mockResolvedValue({ items: [] })
    const near = { lat: 50.09, lng: 14.43 }
    renderSearch(vi.fn(), near)

    await user.type(screen.getByRole('combobox', { name: /kam to bude/i }), 'Nádr')

    await vi.waitFor(() => expect(mockSuggest).toHaveBeenCalledWith('Nádr', near))
  })

  it('has no axe violations when collapsed', async () => {
    const { container } = renderSearch()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations with the suggestion list open', async () => {
    const user = userEvent.setup()
    mockSuggest.mockResolvedValue({
      items: [{ label: 'Nádraží', street: 'Nádražní', municipality: 'Kutná Hora', lat: 49.95, lng: 15.27 }],
    })
    const { container } = renderSearch()

    await user.type(screen.getByRole('combobox', { name: /kam to bude/i }), 'Nádr')
    await screen.findByRole('option', { name: /nádraží/i })

    expect(await axe(container)).toHaveNoViolations()
  })
})
