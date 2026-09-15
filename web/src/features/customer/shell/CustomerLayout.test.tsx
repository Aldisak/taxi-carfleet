import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'

vi.mock('../../../shared/api/auth-storage', () => ({
  authStorage: {
    setFleetSlug: vi.fn(),
    getAccessToken: vi.fn().mockReturnValue(null),
    // CallButton (in the header) reads the persisted fallback phone (F1).
    getFleetPhone: vi.fn().mockReturnValue(null),
  },
}))
vi.mock('../../../shared/api/refresh', () => ({
  enableSilentRefresh: vi.fn(),
  scheduleProactiveRefresh: vi.fn(),
}))
// Branding query is exercised elsewhere; here we only assert the slug is persisted.
vi.mock('./useFleetBranding', () => ({
  useFleetBranding: () => ({ theme, fleet: undefined, isLoading: true }),
}))

import { CustomerLayout } from './CustomerLayout'
import { authStorage } from '../../../shared/api/auth-storage'
import { enableSilentRefresh } from '../../../shared/api/refresh'

const mockAuthStorage = authStorage as unknown as Record<string, ReturnType<typeof vi.fn>>

function renderLayout() {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/customer']}>
          <Routes>
            <Route path="/customer" element={<CustomerLayout />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </ThemeProvider>,
  )
}

describe('CustomerLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persists the resolved fleet slug on mount (F-05)', () => {
    renderLayout()
    // jsdom host is localhost → resolves to the 'demo' default.
    expect(mockAuthStorage.setFleetSlug).toHaveBeenCalledWith('demo')
  })

  it('enables customer silent refresh on mount', () => {
    renderLayout()
    expect(enableSilentRefresh).toHaveBeenCalledWith('/customer/login')
  })

  it('renders the language selector in the header', () => {
    renderLayout()
    expect(screen.getByRole('combobox', { name: 'Jazyk' })).toBeInTheDocument()
  })
})
