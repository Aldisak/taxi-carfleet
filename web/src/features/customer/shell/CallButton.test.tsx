import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { beforeEach } from 'vitest'
import { axe } from '../../../shared/test/axe'
import { authStorage } from '../../../shared/api/auth-storage'
import { CallButton } from './CallButton'

function renderButton(phone: string | null | undefined) {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <CallButton phone={phone} />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

describe('CallButton', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders a tel: link to the fleet phone', () => {
    renderButton('+420111222333')
    const link = screen.getByRole('link', { name: /zavolat/i })
    expect(link).toHaveAttribute('href', 'tel:+420111222333')
  })

  it('exposes an i18n aria-label including the number', () => {
    renderButton('+420111222333')
    expect(screen.getByRole('link', { name: /\+420111222333/ })).toBeInTheDocument()
  })

  it('falls back to the persisted fleet phone when the prop is not yet known (F1)', () => {
    // public/fleet succeeded earlier this session and persisted the number; on a later
    // cold/offline mount the prop is undefined but the button must still dial.
    authStorage.setFleetPhone('+420999888777')
    renderButton(undefined)
    const link = screen.getByRole('link', { name: /zavolat/i })
    expect(link).toHaveAttribute('href', 'tel:+420999888777')
  })

  it('renders a visible disabled state when the phone is truly never known (F1)', () => {
    // No prop, nothing persisted — must NOT render nothing (breaks the phone-everywhere
    // guarantee on the offline banner). Shows a visible, non-actionable label instead.
    renderButton(null)
    const button = screen.getByRole('button')
    expect(button).toHaveTextContent(/zavolat/i)
    expect(button).toBeDisabled()
  })

  it('has no axe violations', async () => {
    const { container } = renderButton('+420111222333')
    expect(await axe(container)).toHaveNoViolations()
  })
})
