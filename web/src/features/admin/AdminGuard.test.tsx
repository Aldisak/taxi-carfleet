import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'
import { axe } from '../../shared/test/axe'
import { authStorage } from '../../shared/api/auth-storage'
import { AdminGuard } from './AdminGuard'

function renderGuard(initialEntry = '/admin') {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/admin/login" element={<h1>Přihlášení správce systému</h1>} />
            <Route
              path="/admin"
              element={
                <AdminGuard>
                  <h1>Obsah</h1>
                </AdminGuard>
              }
            />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </ThemeProvider>,
  )
}

afterEach(() => {
  localStorage.clear()
})

describe('AdminGuard — auth gating (unchanged behaviour)', () => {
  it('redirects a logged-out visitor to /admin/login', () => {
    renderGuard()
    expect(screen.getByRole('heading', { name: 'Přihlášení správce systému' })).toBeInTheDocument()
    expect(screen.queryByText('Obsah')).not.toBeInTheDocument()
  })

  it('renders the guarded content for a SuperAdmin', () => {
    authStorage.setTokens('t', 'r', '', 'SuperAdmin')
    renderGuard()
    expect(screen.getByText('Obsah')).toBeInTheDocument()
  })
})

describe('AdminGuard — unbranded desk shell chrome', () => {
  beforeEach(() => {
    authStorage.setTokens('t', 'r', '', 'SuperAdmin')
  })

  it('renders the unbranded AppHeader with fleets + platform nav', () => {
    renderGuard()
    expect(screen.getByRole('link', { name: 'Flotily' })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('link', { name: 'Přehled platformy' })).toHaveAttribute(
      'href',
      '/admin/platform',
    )
  })

  it('shows the ink-dot brand and the superadmin role label', () => {
    renderGuard()
    expect(screen.getByText('Carfleet · Správa systému')).toBeInTheDocument()
    expect(screen.getByText('superadmin')).toBeInTheDocument()
  })

  it('does NOT render fleet-hub chrome (connection status, mute)', () => {
    renderGuard()
    expect(screen.queryByTestId('mute-toggle')).not.toBeInTheDocument()
  })

  it('logs out — clears auth and navigates to /admin/login', async () => {
    const user = userEvent.setup()
    renderGuard()
    await user.click(screen.getByRole('button', { name: 'Odhlásit se' }))
    expect(
      await screen.findByRole('heading', { name: 'Přihlášení správce systému' }),
    ).toBeInTheDocument()
    expect(authStorage.getAccessToken()).toBeNull()
  })

  it('has no axe violations', async () => {
    const { container } = renderGuard()
    expect(await axe(container)).toHaveNoViolations()
  })
})
