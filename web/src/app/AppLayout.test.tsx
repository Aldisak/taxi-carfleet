import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { theme } from '../shared/theme/theme'
import i18n from '../shared/i18n'

// AppLayout pulls in SignalR hub + notification sound — mock them so no connection is needed.
// NOTE: useFleetHub also exports useHubConnectionState (read by the header) — stub both.
vi.mock('../shared/realtime/useFleetHub', () => ({
  useFleetHub: vi.fn(),
  useHubConnectionState: vi.fn().mockReturnValue('connected'),
  isServerActionBlocked: vi.fn().mockReturnValue(false),
}))
vi.mock('../shared/sound/useNotificationSound', () => ({
  useNotificationSound: vi.fn().mockReturnValue([false, vi.fn()]),
}))

// DisconnectBanner reads hub connection state — mock it to a no-op.
vi.mock('../features/board/DisconnectBanner', () => ({
  DisconnectBanner: () => null,
}))

// Mock authStorage so we can control the userRole in each test.
vi.mock('../shared/api/auth-storage', () => ({
  authStorage: {
    getUserRole: vi.fn(),
    clear: vi.fn(),
  },
}))

// Fleet name is now data-driven via GET public/fleet.
vi.mock('../shared/api/client', () => ({
  getPublicFleet: vi.fn().mockResolvedValue({ name: 'Taxi Praha', primaryColorHex: '#ff0000' }),
}))

import { AppLayout } from './AppLayout'
import { authStorage } from '../shared/api/auth-storage'

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        MemoryRouter,
        null,
        createElement(ThemeProvider, { theme }, createElement(I18nextProvider, { i18n }, children)),
      ),
    )
}

function renderLayout() {
  return render(createElement(AppLayout), { wrapper: makeWrapper() })
}

describe('AppLayout nav gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the Analytika nav link for FleetAdmin', () => {
    vi.mocked(authStorage.getUserRole).mockReturnValue('FleetAdmin')
    renderLayout()
    expect(screen.getByRole('link', { name: 'Analytika' })).toBeInTheDocument()
  })

  it('hides the Analytika nav link for Dispatcher', () => {
    vi.mocked(authStorage.getUserRole).mockReturnValue('Dispatcher')
    renderLayout()
    expect(screen.queryByRole('link', { name: 'Analytika' })).toBeNull()
  })

  it('hides the Analytika nav link when role is null', () => {
    vi.mocked(authStorage.getUserRole).mockReturnValue(null)
    renderLayout()
    expect(screen.queryByRole('link', { name: 'Analytika' })).toBeNull()
  })

  it('renders the language selector', () => {
    vi.mocked(authStorage.getUserRole).mockReturnValue('Dispatcher')
    renderLayout()
    expect(screen.getByRole('combobox', { name: 'Jazyk' })).toBeInTheDocument()
  })

  it('renders the fleet name from public fleet data', async () => {
    vi.mocked(authStorage.getUserRole).mockReturnValue('Dispatcher')
    renderLayout()
    expect(await screen.findByText('Taxi Praha')).toBeInTheDocument()
  })

  it('renders the mute toggle with its testid and aria-pressed', () => {
    vi.mocked(authStorage.getUserRole).mockReturnValue('Dispatcher')
    renderLayout()
    const button = screen.getByTestId('mute-toggle')
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).toHaveAccessibleName('Ztlumit zvuk')
  })

  it('renders the theme toggle', () => {
    vi.mocked(authStorage.getUserRole).mockReturnValue('Dispatcher')
    renderLayout()
    expect(screen.getByRole('button', { name: 'Přepnout vzhled' })).toBeInTheDocument()
  })
})
