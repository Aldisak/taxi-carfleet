import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import { NavAppPreference } from './NavAppPreference'
import type { NavApp } from './driverSettings'

function renderPref(value: NavApp, onChange = vi.fn()) {
  const utils = render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <NavAppPreference value={value} onChange={onChange} />
      </I18nextProvider>
    </ThemeProvider>,
  )
  return { ...utils, onChange }
}

describe('NavAppPreference', () => {
  it('marks the selected nav app as checked', () => {
    renderPref('waze')
    expect(screen.getByRole('radio', { name: 'Waze' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Google Maps' })).toHaveAttribute('aria-checked', 'false')
  })

  it('calls onChange with the chosen nav app', async () => {
    const { onChange } = renderPref('geo')
    await userEvent.click(screen.getByRole('radio', { name: 'Mapy.cz' }))
    expect(onChange).toHaveBeenCalledWith('mapy')
  })

  it('has no axe violations', async () => {
    const { container } = renderPref('geo')
    expect(await axe(container)).toHaveNoViolations()
  })
})
