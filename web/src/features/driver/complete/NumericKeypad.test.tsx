import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import { NumericKeypad } from './NumericKeypad'

function renderKeypad(value: number | null, onChange = vi.fn()) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider theme={theme}>
        <NumericKeypad value={value} onChange={onChange} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

describe('NumericKeypad', () => {
  it('shows the current value', () => {
    renderKeypad(250)
    expect(screen.getByText('250')).toBeInTheDocument()
  })

  it('appends a digit on tap', async () => {
    const onChange = vi.fn()
    renderKeypad(25, onChange)
    await userEvent.click(screen.getByRole('button', { name: '0' }))
    expect(onChange).toHaveBeenCalledWith(250)
  })

  it('starts from the tapped digit when value is null', async () => {
    const onChange = vi.fn()
    renderKeypad(null, onChange)
    await userEvent.click(screen.getByRole('button', { name: '7' }))
    expect(onChange).toHaveBeenCalledWith(7)
  })

  it('deletes the last digit on backspace', async () => {
    const onChange = vi.fn()
    renderKeypad(250, onChange)
    await userEvent.click(screen.getByRole('button', { name: i18n.t('driver.complete.keypad.delete') }))
    expect(onChange).toHaveBeenCalledWith(25)
  })

  it('has no axe violations', async () => {
    const { container } = renderKeypad(100)
    expect(await axe(container)).toHaveNoViolations()
  })
})
