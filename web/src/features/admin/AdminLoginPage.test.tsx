import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Suspense } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'
import { axe } from '../../shared/test/axe'

// Mock the api client module (rules/web-testing.md#network-mocking — never fetch stubs). Keep the
// importOriginal spread so ApiResponseError stays the REAL class: useAdminLogin narrows on
// `instanceof ApiResponseError`, so a fake would break the 401 error path.
vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return {
    ...actual,
    adminLogin: vi.fn(),
  }
})

import * as client from '../../shared/api/client'
import { AdminLoginPage } from './AdminLoginPage'
import { AdminGuard } from './AdminGuard'

const mockAdminLogin = vi.mocked(client.adminLogin)

// A tiny routed harness: /admin/login renders the login page; /admin renders the guard wrapping a
// sentinel "admin page". A successful login should navigate to /admin and the guard should open it.
function renderAdminLogin() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter
            initialEntries={['/admin/login']}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Suspense fallback={null}>
              <Routes>
                <Route path="/admin/login" element={<AdminLoginPage />} />
                <Route
                  path="/admin"
                  element={
                    <AdminGuard>
                      <h1>Správa flotil</h1>
                    </AdminGuard>
                  }
                />
              </Routes>
            </Suspense>
          </MemoryRouter>
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  localStorage.clear()
})

describe('AdminLoginPage — successful login', () => {
  it('stores the SuperAdmin token with an empty fleet slug and opens the admin page', async () => {
    const user = userEvent.setup()
    mockAdminLogin.mockResolvedValue({
      accessToken: 'admin-access-token',
      refreshToken: 'admin-refresh-token',
      user: { id: 'sa-1', email: 'superadmin@demo.local', displayName: 'Super Admin', role: 'SuperAdmin' },
    })
    renderAdminLogin()

    await user.type(screen.getByLabelText(/e-mail/i), 'superadmin@demo.local')
    await user.type(screen.getByLabelText(/heslo/i), 'Super1234!')
    await user.click(screen.getByRole('button', { name: /přihlásit/i }))

    // Guard opened the admin page after navigation.
    await screen.findByRole('heading', { level: 1, name: 'Správa flotil' })

    // mutate() forwards the variables as the first arg (TanStack Query may append a context arg).
    expect(mockAdminLogin.mock.calls[0][0]).toEqual({ email: 'superadmin@demo.local', password: 'Super1234!' })
    expect(localStorage.getItem('auth.accessToken')).toBe('admin-access-token')
    expect(localStorage.getItem('auth.refreshToken')).toBe('admin-refresh-token')
    expect(localStorage.getItem('auth.userRole')).toBe('SuperAdmin')
    // Fleetless: empty slug so no stale X-Fleet-Slug leaks onto cross-tenant /admin calls.
    expect(localStorage.getItem('auth.fleetSlug')).toBe('')
  })
})

describe('AdminLoginPage — bad credentials', () => {
  it('shows a Czech error and does NOT store a token or navigate away', async () => {
    const user = userEvent.setup()
    mockAdminLogin.mockRejectedValue(
      new client.ApiResponseError(401, {
        status: 401,
        title: 'Unauthorized',
        type: 'https://httpstatuses.com/401',
      }),
    )
    renderAdminLogin()

    await user.type(screen.getByLabelText(/e-mail/i), 'superadmin@demo.local')
    await user.type(screen.getByLabelText(/heslo/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /přihlásit/i }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Nesprávné přihlašovací údaje')
    expect(alert.textContent).not.toContain('{')
    expect(alert.textContent).not.toContain('401')
    // Stayed on the login page (guard did not open the admin heading), no token stored.
    expect(screen.queryByRole('heading', { level: 1, name: 'Správa flotil' })).not.toBeInTheDocument()
    expect(localStorage.getItem('auth.accessToken')).toBeNull()
  })

  it('blocks submit and shows field errors for empty fields without calling the client', async () => {
    const user = userEvent.setup()
    renderAdminLogin()

    await user.click(screen.getByRole('button', { name: /přihlásit/i }))

    await waitFor(() => {
      expect(screen.getByText(/e-mail je povinný/i)).toBeInTheDocument()
      expect(screen.getByText(/heslo je povinné/i)).toBeInTheDocument()
    })
    expect(mockAdminLogin).not.toHaveBeenCalled()
  })
})

describe('AdminLoginPage — e2e selector contract', () => {
  it('keeps the #admin-email / #admin-password ids and a submit button (analytics.spec.ts)', () => {
    renderAdminLogin()
    const email = document.getElementById('admin-email')
    const password = document.getElementById('admin-password')
    expect(email).toBeInTheDocument()
    expect(email).toHaveAttribute('type', 'email')
    expect(password).toBeInTheDocument()
    expect(password).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: /přihlásit/i })).toHaveAttribute('type', 'submit')
  })
})

describe('AdminLoginPage — a11y', () => {
  it('has no axe violations', async () => {
    const { container } = renderAdminLogin()
    await screen.findByRole('button', { name: /přihlásit/i })
    expect(await axe(container)).toHaveNoViolations()
  })
})
