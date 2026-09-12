import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import { PassengerStepper } from './PassengerStepper'

function renderStepper(value = 2) {
  const onChange = (): void => undefined
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <PassengerStepper value={value} onChange={onChange} />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

describe('PassengerStepper', () => {
  it('disables decrease at the minimum and increase at the maximum', () => {
    const { rerender } = renderStepper(1)
    expect(screen.getByRole('button', { name: /ubrat cestujícího/i })).toBeDisabled()

    rerender(
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <PassengerStepper value={4} onChange={() => undefined} />
        </I18nextProvider>
      </ThemeProvider>,
    )
    expect(screen.getByRole('button', { name: /přidat cestujícího/i })).toBeDisabled()
  })

  it('emits a clamped count when a step button is pressed', async () => {
    const user = userEvent.setup()
    const calls: number[] = []
    render(
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <PassengerStepper value={2} onChange={v => calls.push(v)} />
        </I18nextProvider>
      </ThemeProvider>,
    )
    await user.click(screen.getByRole('button', { name: /přidat cestujícího/i }))
    expect(calls).toEqual([3])
  })

  it('has no axe violations', async () => {
    const { container } = renderStepper(2)
    expect(await axe(container)).toHaveNoViolations()
  })
})
