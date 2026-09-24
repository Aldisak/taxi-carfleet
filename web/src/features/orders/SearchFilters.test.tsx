import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import type { ReactNode } from 'react'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'
import { axe } from '../../shared/test/axe'
import { SearchFilters } from './SearchFilters'
import type { OrderFilterState } from './orderFilters'

vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return {
    ...actual,
    getDrivers: vi.fn(),
  }
})

import * as client from '../../shared/api/client'

const mockGetDrivers = vi.mocked(client.getDrivers)

function wrap(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

function renderFilters(
  filters: OrderFilterState = { page: 1, pageSize: 50 },
  onFiltersChange = vi.fn(),
) {
  return {
    onFiltersChange,
    ...render(
      wrap(<SearchFilters filters={filters} onFiltersChange={onFiltersChange} />),
    ),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetDrivers.mockResolvedValue({
    items: [
      { driverId: 'd1', displayName: 'Karel Šimek' } as never,
      { driverId: 'd2', displayName: 'Petra Nová' } as never,
    ],
  } as never)
})

describe('SearchFilters — status chip buckets', () => {
  it('renders the coarse bucket chips (Vše · Nová · Probíhá · Dokončená · Zrušená)', () => {
    renderFilters()
    expect(screen.getByRole('button', { name: 'Vše' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nová' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Probíhá' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dokončená' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zrušená' })).toBeInTheDocument()
  })

  it('marks "Vše" as pressed when no status filter is set', () => {
    renderFilters({ page: 1, pageSize: 50 })
    expect(screen.getByRole('button', { name: 'Vše' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Probíhá' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('maps the "Probíhá" bucket onto the folded status set', async () => {
    const user = userEvent.setup()
    const { onFiltersChange } = renderFilters()
    await user.click(screen.getByRole('button', { name: 'Probíhá' }))
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ['Assigned', 'Accepted', 'Arrived', 'InProgress'],
        page: 1,
      }),
    )
  })

  it('maps the "Nová" bucket onto ["New"]', async () => {
    const user = userEvent.setup()
    const { onFiltersChange } = renderFilters()
    await user.click(screen.getByRole('button', { name: 'Nová' }))
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: ['New'], page: 1 }),
    )
  })

  it('clears the status filter when "Vše" is chosen', async () => {
    const user = userEvent.setup()
    const { onFiltersChange } = renderFilters({ page: 1, pageSize: 50, status: ['New'] })
    await user.click(screen.getByRole('button', { name: 'Vše' }))
    expect(onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: [], page: 1 }),
    )
  })

  it('marks the "Probíhá" chip pressed when the folded set is the active status', () => {
    renderFilters({
      page: 1,
      pageSize: 50,
      status: ['Assigned', 'Accepted', 'Arrived', 'InProgress'],
    })
    expect(screen.getByRole('button', { name: 'Probíhá' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Vše' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('SearchFilters — search and driver', () => {
  it('keeps the labelled search field with placeholder', () => {
    renderFilters()
    const search = screen.getByLabelText(i18n.t('search.filters.search'))
    expect(search).toHaveAttribute('placeholder', i18n.t('search.filters.searchPlaceholder'))
  })

  it('renders the driver select with the default all-drivers option', async () => {
    renderFilters()
    const select = screen.getByLabelText(i18n.t('search.filters.driver'))
    expect(select).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Karel Šimek' })).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderFilters()
    expect(await axe(container)).toHaveNoViolations()
  })
})
