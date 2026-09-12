import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'

vi.mock('../../../shared/api/client', () => ({
  requestCustomerCode: vi.fn(),
  verifyCustomerCode: vi.fn(),
}))
vi.mock('../../../shared/api/auth-storage', () => ({
  authStorage: { getFleetSlug: vi.fn().mockReturnValue('demo'), setTokens: vi.fn(), clear: vi.fn() },
}))
vi.mock('../../../shared/api/idbAuthStore', () => ({
  idbAuthStore: { setRefreshToken: vi.fn(), clear: vi.fn() },
}))
vi.mock('../../../shared/api/refresh', () => ({
  enableSilentRefresh: vi.fn(),
  scheduleProactiveRefresh: vi.fn(),
}))

import { CustomerLoginStep } from './CustomerLoginStep'
import { requestCustomerCode, verifyCustomerCode } from '../../../shared/api/client'
import { authStorage } from '../../../shared/api/auth-storage'

const mockRequest = vi.mocked(requestCustomerCode)
const mockVerify = vi.mocked(verifyCustomerCode)
const mockAuthStorage = authStorage as unknown as Record<string, ReturnType<typeof vi.fn>>

function renderStep(onAuthenticated = vi.fn()) {
  render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <CustomerLoginStep onAuthenticated={onAuthenticated} />
      </I18nextProvider>
    </ThemeProvider>,
  )
  return { onAuthenticated }
}

describe('CustomerLoginStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthStorage.getFleetSlug.mockReturnValue('demo')
  })

  it('sends a code then shows the code field', async () => {
    const user = userEvent.setup()
    mockRequest.mockResolvedValue(undefined)
    renderStep()

    await user.type(screen.getByLabelText(/telefonní číslo/i), '123456789')
    await user.click(screen.getByRole('button', { name: /odeslat kód/i }))

    expect(mockRequest).toHaveBeenCalledWith('+420123456789')
    expect(await screen.findByLabelText(/ověřovací kód/i)).toBeInTheDocument()
  })

  it('auto-submits a 6-digit code and shows the Czech error on a wrong code', async () => {
    const user = userEvent.setup()
    mockRequest.mockResolvedValue(undefined)
    mockVerify.mockRejectedValue({ status: 401 })
    const { onAuthenticated } = renderStep()

    await user.type(screen.getByLabelText(/telefonní číslo/i), '123456789')
    await user.click(screen.getByRole('button', { name: /odeslat kód/i }))

    const codeField = await screen.findByLabelText(/ověřovací kód/i)
    await user.type(codeField, '000000')

    expect(mockVerify).toHaveBeenCalledWith('+420123456789', '000000')
    expect(await screen.findByText('Kód nesouhlasí, zkuste to znovu.')).toBeInTheDocument()
    expect(onAuthenticated).not.toHaveBeenCalled()
  })

  it('stores tokens and calls onAuthenticated on a correct code', async () => {
    const user = userEvent.setup()
    mockRequest.mockResolvedValue(undefined)
    mockVerify.mockResolvedValue({
      accessToken: 'at', refreshToken: 'rt',
      user: { id: 'u1', phone: '+420123456789', displayName: '+420123456789', role: 'Customer' },
    })
    const { onAuthenticated } = renderStep()

    await user.type(screen.getByLabelText(/telefonní číslo/i), '123456789')
    await user.click(screen.getByRole('button', { name: /odeslat kód/i }))
    const codeField = await screen.findByLabelText(/ověřovací kód/i)
    await user.type(codeField, '654321')

    expect(mockAuthStorage.setTokens).toHaveBeenCalledWith('at', 'rt', 'demo', 'Customer')
    expect(onAuthenticated).toHaveBeenCalledTimes(1)
  })

  it('has no axe violations on the phone step', async () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <CustomerLoginStep onAuthenticated={vi.fn()} />
        </I18nextProvider>
      </ThemeProvider>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
