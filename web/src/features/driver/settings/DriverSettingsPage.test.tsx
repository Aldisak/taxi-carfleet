import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import { DriverSettingsPage } from './DriverSettingsPage'

const navigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}))

const authClear = vi.fn()
vi.mock('../../../shared/api/auth-storage', () => ({
  authStorage: { clear: () => authClear() },
}))

const idbAuthClear = vi.fn(() => Promise.resolve())
vi.mock('../../../shared/api/idbAuthStore', () => ({
  idbAuthStore: { clear: () => idbAuthClear() },
}))

const queueClear = vi.fn(() => Promise.resolve())
vi.mock('../queue/transitionQueue', () => ({
  transitionQueue: { clear: () => queueClear() },
}))

const rideClear = vi.fn(() => Promise.resolve())
vi.mock('../ride/idbRideStore', () => ({
  idbRideStore: { clear: () => rideClear() },
}))

function renderPage() {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <DriverSettingsPage />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

describe('DriverSettingsPage', () => {
  beforeEach(() => {
    localStorage.clear()
    navigate.mockReset()
    authClear.mockReset()
    idbAuthClear.mockReset()
    queueClear.mockReset()
    rideClear.mockReset()
  })

  it('shows the app version', () => {
    renderPage()
    expect(screen.getByText('0.0.1-test')).toBeInTheDocument()
  })

  it('logout clears every session store and routes to /driver/login', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Odhlásit se' }))

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/driver/login'))
    expect(authClear).toHaveBeenCalled()
    expect(idbAuthClear).toHaveBeenCalled()
    expect(queueClear).toHaveBeenCalled()
    expect(rideClear).toHaveBeenCalled()
  })

  it('has no axe violations', async () => {
    const { container } = renderPage()
    expect(await axe(container)).toHaveNoViolations()
  })
})
