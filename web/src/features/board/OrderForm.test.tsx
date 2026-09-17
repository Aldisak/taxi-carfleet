import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'
import { OrderForm } from './OrderForm'

// Mock the hub connection state so forms are not blocked by default in tests
vi.mock('../../shared/realtime/useFleetHub', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/realtime/useFleetHub')>()
  return {
    ...actual,
    useHubConnectionState: vi.fn(() => 'connected'),
  }
})

// Mock api client
vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return {
    ...actual,
    getGeoSuggest: vi.fn().mockResolvedValue({ items: [] }),
    getGeoRoute: vi.fn().mockResolvedValue({ distanceMeters: 0, durationSeconds: 0, estimatedPriceCzk: null }),
    postCreateOrder: vi.fn().mockResolvedValue({ id: 'new-order-id' }),
  }
})

function renderForm(onSuccess?: () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <OrderForm onOrderCreated={onSuccess} />
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

describe('OrderForm — field order and tab stops', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders all required fields in order', () => {
    renderForm()
    // Verify fields exist
    expect(screen.getByRole('textbox', { name: /telefon/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /jméno/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /nástup/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /cíl/i })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /cestující/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /poznámka/i })).toBeInTheDocument()
  })

  it('renders the submit button "Vytvořit objednávku"', () => {
    renderForm()
    expect(screen.getByRole('button', { name: /vytvořit objednávku/i })).toBeInTheDocument()
  })
})

describe('OrderForm — quick chip fill', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('clicking a quick chip fills pickup address and coordinates without geo call', async () => {
    const user = userEvent.setup()
    const { getGeoSuggest } = await import('../../shared/api/client')

    renderForm()

    // Click the first chip (train station Kolín)
    const chips = screen.getAllByRole('button', { name: /nádraží/i })
    await user.click(chips[0])

    // Pickup field should be filled
    const pickupField = screen.getByRole('textbox', { name: /nástup/i })
    expect(pickupField).toHaveValue()
    expect((pickupField as HTMLInputElement).value.length).toBeGreaterThan(0)

    // No geo/suggest call should have been made (chip provides coords directly)
    expect(getGeoSuggest).not.toHaveBeenCalled()
  })
})

describe('OrderForm — enriched suggestions (AC#2)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders street + municipality under each suggestion so same-named places differ', async () => {
    const user = userEvent.setup()
    const { getGeoSuggest } = await import('../../shared/api/client')
    vi.mocked(getGeoSuggest).mockResolvedValue({
      items: [
        { name: 'Náměstí 1', label: 'Adresa', street: 'Náměstí', municipality: 'Kolín', lat: 50.028, lng: 15.2 },
        { name: 'Náměstí 1', label: 'Adresa', street: 'Náměstí', municipality: 'Kutná Hora', lat: 49.948, lng: 15.268 },
      ],
    })

    renderForm()

    await user.type(screen.getByRole('textbox', { name: /nástup/i }), 'Náměstí')

    // The town is part of each option's accessible name (plain text, not aria-hidden).
    const kolin = await screen.findByRole('option', { name: /kolín/i })
    const kutna = await screen.findByRole('option', { name: /kutná hora/i })
    expect(kolin).toHaveTextContent('Náměstí')
    expect(kutna).toHaveTextContent('Kutná Hora')
  })
})

describe('OrderForm — F2 focus shortcut', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pressing F2 focuses the Phone field from anywhere', async () => {
    renderForm()

    // Focus another field first
    const nameField = screen.getByRole('textbox', { name: /jméno/i })
    nameField.focus()
    expect(document.activeElement).toBe(nameField)

    // Press F2
    fireEvent.keyDown(window, { key: 'F2', code: 'F2' })

    // Phone field should now be focused
    const phoneField = screen.getByRole('textbox', { name: /telefon/i })
    expect(document.activeElement).toBe(phoneField)
  })
})

describe('OrderForm — Enter key submit', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows validation errors when Enter is pressed with an empty form', async () => {
    const user = userEvent.setup()
    renderForm()

    const phoneField = screen.getByRole('textbox', { name: /telefon/i })
    await user.click(phoneField)

    // Trigger Enter via fireEvent to avoid userEvent timer issues
    fireEvent.keyDown(phoneField, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(screen.getByText(/telefonní číslo je povinné/i)).toBeInTheDocument()
    })
  })
})

describe('OrderForm — form clear and refocus after submit', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('clears form and focuses Phone field after successful submit', async () => {
    const { postCreateOrder } = await import('../../shared/api/client')
    vi.mocked(postCreateOrder).mockResolvedValueOnce({ order: { id: 'order-abc' } } as never)

    const user = userEvent.setup()
    renderForm()

    // Fill in minimum required fields
    await user.type(screen.getByRole('textbox', { name: /telefon/i }), '777123456')

    // Click a chip to fill pickup with coords
    const chips = screen.getAllByRole('button', { name: /nádraží/i })
    await user.click(chips[0])

    // Submit
    await user.click(screen.getByRole('button', { name: /vytvořit objednávku/i }))

    await waitFor(() => {
      // Phone field should be cleared
      const phoneField = screen.getByRole('textbox', { name: /telefon/i })
      expect((phoneField as HTMLInputElement).value).toBe('')
      // Phone should be focused
      expect(document.activeElement).toBe(phoneField)
    })
  })
})

describe('OrderForm — Enter key single-submit', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('calls postCreateOrder exactly once when Enter pressed in a valid filled form', async () => {
    const { postCreateOrder } = await import('../../shared/api/client')
    vi.mocked(postCreateOrder).mockResolvedValueOnce({ order: { id: 'enter-order-id' } } as never)

    const user = userEvent.setup()
    renderForm()

    // Fill required fields
    await user.type(screen.getByRole('textbox', { name: /telefon/i }), '777123456')
    const chips = screen.getAllByRole('button', { name: /nádraží/i })
    await user.click(chips[0])

    // Press Enter in the Phone field
    const phoneField = screen.getByRole('textbox', { name: /telefon/i })
    fireEvent.keyDown(phoneField, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(postCreateOrder).toHaveBeenCalledTimes(1)
    })
  })
})
