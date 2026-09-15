import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from './index'
import { theme } from '../theme/theme'
import { axe } from '../test/axe'
import { LanguageSelector } from './LanguageSelector'

function renderSelector() {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <LanguageSelector />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

describe('LanguageSelector', () => {
  afterEach(async () => {
    // Restore the Czech baseline for every other suite (setLanguage may have switched
    // the shared i18n singleton and persisted a non-cs choice).
    await i18n.changeLanguage('cs-CZ')
    localStorage.clear()
  })

  it('renders one option per supported locale showing the native name', () => {
    renderSelector()
    for (const nativeName of ['Čeština', 'English', 'Русский', 'Українська', 'Filipino', 'Deutsch']) {
      expect(screen.getByRole('option', { name: nativeName })).toBeInTheDocument()
    }
  })

  it('exposes the accessible name from common.language', () => {
    renderSelector()
    expect(screen.getByRole('combobox', { name: 'Jazyk' })).toBeInTheDocument()
  })

  it('reflects the current i18n language as the selected value', () => {
    renderSelector()
    const select = screen.getByRole('combobox', { name: 'Jazyk' }) as HTMLSelectElement
    expect(select.value).toBe('cs-CZ')
  })

  it('switches i18n and persists on select', async () => {
    renderSelector()
    const select = screen.getByRole('combobox', { name: 'Jazyk' })
    await userEvent.selectOptions(select, 'de-DE')

    await waitFor(() => expect(i18n.language).toBe('de-DE'))
    expect(localStorage.getItem('app.language')).toBe('de-DE')
  })

  it('has no axe violations', async () => {
    const { container } = renderSelector()
    expect(await axe(container)).toHaveNoViolations()
  })
})
