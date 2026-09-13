import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { axe } from '../../shared/test/axe'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'

vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return { ...actual, getAudit: vi.fn() }
})

import * as client from '../../shared/api/client'
import { AuditPage } from './AuditPage'

const mockGetAudit = vi.mocked(client.getAudit)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ThemeProvider, { theme }, createElement(I18nextProvider, { i18n }, children)),
    )
}

function entry(overrides?: Partial<client.AuditEntryDto>): client.AuditEntryDto {
  return {
    source: 'OrderEvent',
    actorUserId: 'u1',
    entity: 'Order',
    action: 'Completed',
    orderCode: 'AAA111',
    at: '2026-09-13T10:00:00Z',
    ...overrides,
  }
}

function page(items: client.AuditEntryDto[], total: number, pageNo = 1): client.AuditResponse {
  return { items, total, page: pageNo, pageSize: 50 }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  localStorage.setItem('auth.userRole', 'FleetAdmin')
})

afterEach(() => {
  localStorage.clear()
})

describe('AuditPage', () => {
  it('denies access for non-FleetAdmin roles', () => {
    mockGetAudit.mockResolvedValue(page([], 0))
    localStorage.setItem('auth.userRole', 'Dispatcher')
    render(createElement(AuditPage), { wrapper: makeWrapper() })
    expect(screen.getByRole('alert')).toHaveTextContent(/nemáte přístup/i)
  })

  it('renders the timeline with Czech event labels from the shared map', async () => {
    mockGetAudit.mockResolvedValue(
      page([entry({ action: 'Completed' }), entry({ action: 'PriceOverridden', orderCode: 'BBB222' })], 2),
    )
    render(createElement(AuditPage), { wrapper: makeWrapper() })
    expect(await screen.findByText('Jízda dokončena')).toBeInTheDocument()
    expect(screen.getByText('Cena upravena')).toBeInTheDocument()
  })

  it('labels the real manual status-override audit action in Czech', async () => {
    mockGetAudit.mockResolvedValue(
      page([entry({ source: 'AuditLog', action: 'StatusOverride', entity: 'Driver', orderCode: null })], 1),
    )
    render(createElement(AuditPage), { wrapper: makeWrapper() })
    expect(await screen.findByText('Ruční změna stavu')).toBeInTheDocument()
  })

  it('applies filters and passes them to the query (1-based page)', async () => {
    mockGetAudit.mockResolvedValue(page([entry()], 1))
    render(createElement(AuditPage), { wrapper: makeWrapper() })
    await screen.findByText('Jízda dokončena')

    await userEvent.type(screen.getByLabelText(/kód objednávky/i), 'AAA111')
    await userEvent.click(screen.getByRole('button', { name: /^filtrovat$/i }))

    expect(mockGetAudit).toHaveBeenLastCalledWith(
      expect.objectContaining({ orderCode: 'AAA111', page: 1 }),
    )
  })

  it('pages forward to page 2 when there are more results (hasNext from server page/pageSize)', async () => {
    // total 120 > page 1 * pageSize 50 → hasNext true.
    mockGetAudit.mockResolvedValue(page([entry()], 120, 1))
    render(createElement(AuditPage), { wrapper: makeWrapper() })
    await screen.findByText('Jízda dokončena')

    await userEvent.click(screen.getByRole('button', { name: /^další$/i }))
    expect(mockGetAudit).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
  })

  it('shows the empty message when there are no records', async () => {
    mockGetAudit.mockResolvedValue(page([], 0))
    render(createElement(AuditPage), { wrapper: makeWrapper() })
    expect(await screen.findByText('Žádné záznamy')).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    mockGetAudit.mockResolvedValue(page([entry()], 1))
    const { container } = render(createElement(AuditPage), { wrapper: makeWrapper() })
    await screen.findByText('Jízda dokončena')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('renders a header row with column labels', async () => {
    mockGetAudit.mockResolvedValue(page([entry()], 1))
    render(createElement(AuditPage), { wrapper: makeWrapper() })
    const table = await screen.findByRole('table')
    expect(within(table).getByText(/událost/i)).toBeInTheDocument()
  })
})
