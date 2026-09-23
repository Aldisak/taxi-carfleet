import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
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

/** Advance to the code step by requesting a code for a valid phone. */
async function reachCodeStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/telefonní číslo/i), '123456789')
  await user.click(screen.getByRole('button', { name: 'Odeslat kód' }))
  return screen.findByRole('group', { name: /ověřovací kód/i })
}

/** Fill all six boxes at once by pasting into the first (drives the kit paste-distribute path). */
async function pasteCode(
  user: ReturnType<typeof userEvent.setup>,
  group: HTMLElement,
  code: string,
) {
  const boxes = within(group).getAllByRole('textbox')
  await user.click(boxes[0])
  await user.paste(code)
}

describe('CustomerLoginStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthStorage.getFleetSlug.mockReturnValue('demo')
  })

  it('shows the +420 prefix and privacy caption on the phone step', () => {
    renderStep()

    expect(screen.getByText('+420')).toBeInTheDocument()
    expect(
      screen.getByText('Vaše číslo použijeme pouze k potvrzení objednávky.'),
    ).toBeInTheDocument()
  })

  it('sends a code then shows the code field', async () => {
    const user = userEvent.setup()
    mockRequest.mockResolvedValue(undefined)
    renderStep()

    await user.type(screen.getByLabelText(/telefonní číslo/i), '123456789')
    await user.click(screen.getByRole('button', { name: 'Odeslat kód' }))

    expect(mockRequest).toHaveBeenCalledWith('+420123456789')
    expect(await screen.findByRole('group', { name: /ověřovací kód/i })).toBeInTheDocument()
  })

  it('auto-submits on the 6th digit and shows the Czech error on a wrong code', async () => {
    const user = userEvent.setup()
    mockRequest.mockResolvedValue(undefined)
    mockVerify.mockRejectedValue({ status: 401 })
    const { onAuthenticated } = renderStep()

    const group = await reachCodeStep(user)
    await pasteCode(user, group, '000000')

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

    const group = await reachCodeStep(user)
    await pasteCode(user, group, '654321')

    expect(mockVerify).toHaveBeenCalledWith('+420123456789', '654321')
    expect(mockAuthStorage.setTokens).toHaveBeenCalledWith('at', 'rt', 'demo', 'Customer')
    expect(onAuthenticated).toHaveBeenCalledTimes(1)
  })

  it('returns to the phone step via "Změnit číslo"', async () => {
    const user = userEvent.setup()
    mockRequest.mockResolvedValue(undefined)
    renderStep()

    await reachCodeStep(user)
    await user.click(screen.getByRole('button', { name: /změnit číslo/i }))

    expect(screen.getByLabelText(/telefonní číslo/i)).toBeInTheDocument()
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

  it('has no axe violations on the code step', async () => {
    const user = userEvent.setup()
    mockRequest.mockResolvedValue(undefined)
    const { container } = render(
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <CustomerLoginStep onAuthenticated={vi.fn()} />
        </I18nextProvider>
      </ThemeProvider>,
    )
    await user.type(screen.getByLabelText(/telefonní číslo/i), '123456789')
    await user.click(screen.getByRole('button', { name: 'Odeslat kód' }))
    await screen.findByRole('group', { name: /ověřovací kód/i })

    expect(await axe(container)).toHaveNoViolations()
  })
})
