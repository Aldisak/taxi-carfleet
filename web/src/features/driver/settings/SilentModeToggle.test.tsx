import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import { SilentModeToggle } from './SilentModeToggle'

function renderToggle(value: boolean, onChange = vi.fn()) {
  const utils = render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <SilentModeToggle value={value} onChange={onChange} />
      </I18nextProvider>
    </ThemeProvider>,
  )
  return { ...utils, onChange }
}

describe('SilentModeToggle', () => {
  it('reflects the on/off state in the checkbox', () => {
    renderToggle(true)
    expect(screen.getByRole('checkbox', { name: 'Tichý režim' })).toBeChecked()
  })

  it('calls onChange with the toggled value on click', async () => {
    const { onChange } = renderToggle(false)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Tichý režim' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('has no axe violations', async () => {
    const { container } = renderToggle(false)
    expect(await axe(container)).toHaveNoViolations()
  })
})
