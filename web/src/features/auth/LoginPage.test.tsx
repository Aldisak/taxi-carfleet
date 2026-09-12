import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'
import { LoginPage } from './LoginPage'

function renderLoginPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter
            initialEntries={['/x/login']}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <LoginPage />
          </MemoryRouter>
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

describe('LoginPage — successful login', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        user: { id: 'user-1', email: 'dispatcher@demo.cz', displayName: 'Dispatcher', role: 'Admin' },
      }),
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('stores tokens in localStorage after successful login', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    await user.clear(screen.getByLabelText(/kód flotily/i))
    await user.type(screen.getByLabelText(/kód flotily/i), 'demo')
    await user.type(screen.getByLabelText(/e-mail/i), 'dispatcher@demo.cz')
    await user.type(screen.getByLabelText(/heslo/i), 'correct-password')

    await user.click(screen.getByRole('button', { name: /přihlásit/i }))

    await waitFor(() => {
      expect(localStorage.getItem('auth.accessToken')).toBe('test-access-token')
      expect(localStorage.getItem('auth.refreshToken')).toBe('test-refresh-token')
      expect(localStorage.getItem('auth.fleetSlug')).toBe('demo')
    })
  })
})

describe('LoginPage — bad credentials', () => {
  beforeEach(() => {
    // Mock fetch to return 401
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      statusText: 'Unauthorized',
      json: vi.fn().mockResolvedValue({
        status: 401,
        title: 'Unauthorized',
        type: 'https://httpstatuses.com/401',
      }),
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('shows Czech error message when credentials are wrong', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    // Fill in fleet slug
    await user.clear(screen.getByLabelText(/kód flotily/i))
    await user.type(screen.getByLabelText(/kód flotily/i), 'demo')

    // Fill in email
    await user.type(screen.getByLabelText(/e-mail/i), 'wrong@user.cz')

    // Fill in password
    await user.type(screen.getByLabelText(/heslo/i), 'wrongpassword')

    // Submit
    await user.click(screen.getByRole('button', { name: /přihlásit/i }))

    // Should show Czech error — never JSON or stack trace
    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert.textContent).toContain('Nesprávné přihlašovací údaje')
      expect(alert.textContent).not.toContain('{')
      expect(alert.textContent).not.toContain('401')
    })
  })

  it('shows field validation errors for empty fields without making a network call', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    // Clear fleet slug (it may be pre-filled)
    await user.clear(screen.getByLabelText(/kód flotily/i))

    // Submit with empty email and password
    await user.click(screen.getByRole('button', { name: /přihlásit/i }))

    // Validation errors should appear immediately without a network call
    await waitFor(() => {
      expect(screen.getByText(/kód flotily je povinný/i)).toBeInTheDocument()
      expect(screen.getByText(/e-mail je povinný/i)).toBeInTheDocument()
      expect(screen.getByText(/heslo je povinné/i)).toBeInTheDocument()
    })

    // fetch should NOT have been called
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })
})
