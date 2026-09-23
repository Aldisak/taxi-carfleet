import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'

vi.mock('../../../shared/api/client', async () => {
  const actual = await vi.importActual<typeof import('../../../shared/api/client')>(
    '../../../shared/api/client',
  )
  return { ...actual, getMyOrderHistory: vi.fn(), rateOrder: vi.fn() }
})

vi.mock('../../../shared/api/auth-storage', () => ({
  authStorage: { getAccessToken: vi.fn(() => 'tok') },
}))

import { getMyOrderHistory, rateOrder, ApiResponseError, type MyOrderHistoryResponse } from '../../../shared/api/client'
import { RatingForm } from './RatingForm'

const mockHistory = vi.mocked(getMyOrderHistory)
const mockRate = vi.mocked(rateOrder)

function historyWith(stars: number | null): MyOrderHistoryResponse {
  return {
    items: [
      {
        id: 'order-9',
        publicCode: 'ABC123',
        status: 'Completed',
        pickupAddress: 'Hlavní 1',
        dropoffAddress: 'Náměstí 5',
        priceType: 'Fixed',
        fixedPriceCzk: 150,
        finalPriceCzk: 150,
        ratingStars: stars,
        createdAt: '2026-09-10T10:00:00Z',
        completedAt: '2026-09-10T10:20:00Z',
      },
    ],
    total: 1,
    page: 1,
    pageSize: 20,
  }
}

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <RatingForm publicCode="ABC123" />
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

describe('RatingForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('selects stars and submits, then shows thanks', async () => {
    mockHistory.mockResolvedValue(historyWith(null))
    mockRate.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderForm()

    const fourStars = await screen.findByRole('radio', { name: /4/ })
    await user.click(fourStars)
    await user.click(screen.getByRole('button', { name: /Odeslat hodnocení/ }))

    expect(mockRate).toHaveBeenCalledWith('order-9', { stars: 4, comment: null })
    await waitFor(() => expect(screen.getByText(/Děkujeme za hodnocení/)).toBeInTheDocument())
  })

  it('submit is disabled until a star is chosen', async () => {
    mockHistory.mockResolvedValue(historyWith(null))
    renderForm()
    await screen.findByRole('radio', { name: /4/ })
    expect(screen.getByRole('button', { name: /Odeslat hodnocení/ })).toBeDisabled()
  })

  it('sends the optional comment when typed', async () => {
    mockHistory.mockResolvedValue(historyWith(null))
    mockRate.mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderForm()

    await user.click(await screen.findByRole('radio', { name: /5/ }))
    await user.type(screen.getByLabelText(/Komentář/), 'Super')
    await user.click(screen.getByRole('button', { name: /Odeslat hodnocení/ }))

    expect(mockRate).toHaveBeenCalledWith('order-9', { stars: 5, comment: 'Super' })
  })

  it('shows the read-only thanks state for an already-rated order', async () => {
    mockHistory.mockResolvedValue(historyWith(3))
    renderForm()
    await waitFor(() => expect(screen.getByText(/Děkujeme za hodnocení/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Odeslat hodnocení/ })).not.toBeInTheDocument()
  })

  it('treats a 409 as already-rated (thanks, not an error)', async () => {
    mockHistory.mockResolvedValue(historyWith(null))
    mockRate.mockRejectedValueOnce(new ApiResponseError(409, { status: 409, title: 'x', type: 'x' }))
    const user = userEvent.setup()
    renderForm()

    await user.click(await screen.findByRole('radio', { name: /2/ }))
    await user.click(screen.getByRole('button', { name: /Odeslat hodnocení/ }))

    await waitFor(() => expect(screen.getByText(/Děkujeme za hodnocení/)).toBeInTheDocument())
  })

  it('has no axe violations', async () => {
    mockHistory.mockResolvedValue(historyWith(null))
    const { container } = renderForm()
    await screen.findByRole('radio', { name: /4/ })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe violations in the read-only thanks (already-rated) state', async () => {
    mockHistory.mockResolvedValue(historyWith(3))
    const { container } = renderForm()
    await waitFor(() => expect(screen.getByText(/Děkujeme za hodnocení/)).toBeInTheDocument())
    expect(await axe(container)).toHaveNoViolations()
  })
})
