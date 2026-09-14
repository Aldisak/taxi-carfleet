import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'
import { axe } from '../../shared/test/axe'

vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return {
    ...actual,
    getAdminFleets: vi.fn(),
    postCreateFleet: vi.fn(),
    postDeactivateFleet: vi.fn(),
  }
})

import * as client from '../../shared/api/client'
import { AdminFleetsPage } from './AdminFleetsPage'

const mockGetAdminFleets = vi.mocked(client.getAdminFleets)
const mockPostCreateFleet = vi.mocked(client.postCreateFleet)

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(
      MemoryRouter,
      null,
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(ThemeProvider, { theme }, createElement(I18nextProvider, { i18n }, children)),
      ),
    )
}

function fleet(overrides?: Partial<client.AdminFleetDto>): client.AdminFleetDto {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'demo',
    name: 'Taxi Demo',
    phone: '+420321700100',
    isActive: true,
    createdAt: '2026-09-01T12:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAdminFleets.mockResolvedValue({ items: [fleet()] })
})

describe('AdminFleetsPage (UC-007 B3)', () => {
  it('lists existing fleets', async () => {
    render(createElement(AdminFleetsPage), { wrapper: makeWrapper() })
    expect(await screen.findByText('Taxi Demo')).toBeInTheDocument()
    expect(screen.getByText('demo')).toBeInTheDocument()
  })

  it('creates a fleet and shows the one-time password once', async () => {
    const user = userEvent.setup()
    mockPostCreateFleet.mockResolvedValue({
      fleetId: '22222222-2222-2222-2222-222222222222',
      slug: 'kolin',
      adminEmail: 'admin@kolin.local',
      oneTimePassword: 'Zx7Kp9Qw2Rt4Vb6',
    })
    render(createElement(AdminFleetsPage), { wrapper: makeWrapper() })
    await screen.findByText('Taxi Demo')

    await user.type(screen.getByLabelText('Identifikátor (slug)'), 'kolin')
    await user.type(screen.getByLabelText('Název'), 'Taxi Kolín')
    await user.type(screen.getByLabelText('Telefon'), '+420321123456')
    await user.type(screen.getByLabelText('E-mail správce'), 'admin@kolin.local')
    await user.click(screen.getByRole('button', { name: 'Vytvořit flotilu' }))

    await waitFor(() => expect(mockPostCreateFleet).toHaveBeenCalledTimes(1))
    expect(mockPostCreateFleet).toHaveBeenCalledWith({
      slug: 'kolin',
      name: 'Taxi Kolín',
      phone: '+420321123456',
      adminEmail: 'admin@kolin.local',
    })
    expect(await screen.findByTestId('one-time-password')).toHaveTextContent('Zx7Kp9Qw2Rt4Vb6')
  })

  it('blocks submit and shows errors when the form is invalid', async () => {
    const user = userEvent.setup()
    render(createElement(AdminFleetsPage), { wrapper: makeWrapper() })
    await screen.findByText('Taxi Demo')

    await user.type(screen.getByLabelText('Identifikátor (slug)'), 'NOT VALID')
    await user.click(screen.getByRole('button', { name: 'Vytvořit flotilu' }))

    expect(mockPostCreateFleet).not.toHaveBeenCalled()
    // Slug charset error + required name/phone/email errors present.
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
  })

  it('has no axe violations', async () => {
    const { container } = render(createElement(AdminFleetsPage), { wrapper: makeWrapper() })
    await screen.findByText('Taxi Demo')
    expect(await axe(container)).toHaveNoViolations()
  })
})
