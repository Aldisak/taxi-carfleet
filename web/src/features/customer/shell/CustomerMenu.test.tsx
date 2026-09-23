import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'

const navigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

const authStore = { token: null as string | null }
vi.mock('../../../shared/api/auth-storage', () => ({
  authStorage: {
    getAccessToken: () => authStore.token,
    getFleetPhone: () => null,
    clear: vi.fn(),
  },
}))
vi.mock('../../../shared/api/idbAuthStore', () => ({
  idbAuthStore: { clear: vi.fn().mockResolvedValue(undefined) },
}))

import { CustomerMenu } from './CustomerMenu'
import { authStorage } from '../../../shared/api/auth-storage'

function renderMenu(
  props: Partial<React.ComponentProps<typeof CustomerMenu>> = {},
  authed = false,
) {
  authStore.token = authed ? 'token' : null
  const onClose = props.onClose ?? vi.fn()
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <CustomerMenu
            open
            onClose={onClose}
            fleet={{ name: 'Demo Taxi', phone: '+420123456789', logoUrl: null }}
            {...props}
          />
        </MemoryRouter>
      </I18nextProvider>
    </ThemeProvider>,
  )
}

describe('CustomerMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })
  afterEach(() => {
    authStore.token = null
  })

  it('renders the fleet identity and primary rows', () => {
    renderMenu()
    expect(screen.getByText('Demo Taxi')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: i18n.t('customer.menu.history') })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: i18n.t('customer.menu.privacy') })).toBeInTheDocument()
  })

  it('navigates to history and closes on the history row', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderMenu({ onClose })
    await user.click(screen.getByRole('button', { name: i18n.t('customer.menu.history') }))
    expect(onClose).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/customer/history')
  })

  it('changes the theme mode via the appearance segmented control', async () => {
    const user = userEvent.setup()
    renderMenu()
    await user.click(screen.getByRole('button', { name: i18n.t('customer.menu.themeDark') }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('hides sign-out when logged out and shows it when authenticated', () => {
    const { rerender } = renderMenu({}, false)
    expect(screen.queryByRole('button', { name: i18n.t('customer.menu.logout') })).not.toBeInTheDocument()

    authStore.token = 'token'
    rerender(
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter>
            <CustomerMenu open onClose={vi.fn()} fleet={{ name: 'Demo Taxi', phone: '+420123456789' }} />
          </MemoryRouter>
        </I18nextProvider>
      </ThemeProvider>,
    )
    expect(screen.getByRole('button', { name: i18n.t('customer.menu.logout') })).toBeInTheDocument()
  })

  it('signs out: clears auth and navigates to login', async () => {
    const user = userEvent.setup()
    renderMenu({}, true)
    await user.click(screen.getByRole('button', { name: i18n.t('customer.menu.logout') }))
    expect(authStorage.clear).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('/customer/login')
  })

  it('has no axe violations', async () => {
    const { container } = renderMenu({}, true)
    expect(await axe(container)).toHaveNoViolations()
  })
})
