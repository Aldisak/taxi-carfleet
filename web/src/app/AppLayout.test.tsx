import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { theme } from '../shared/theme/theme'
import i18n from '../shared/i18n'

// AppLayout pulls in SignalR hub + notification sound — mock them so no connection is needed.
vi.mock('../shared/realtime/useFleetHub', () => ({ useFleetHub: vi.fn() }))
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

import { AppLayout } from './AppLayout'
import { authStorage } from '../shared/api/auth-storage'

function makeWrapper() {
  return ({ children }: { children: ReactNode }) =>
    createElement(
      MemoryRouter,
      null,
      createElement(ThemeProvider, { theme }, createElement(I18nextProvider, { i18n }, children)),
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
})
