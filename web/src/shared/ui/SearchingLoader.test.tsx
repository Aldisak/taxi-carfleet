import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../i18n'
import { theme } from '../theme/theme'
import { axe } from '../test/axe'
import { SearchingLoader } from './SearchingLoader'

function wrap(ui: React.ReactNode) {
  return (
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
    </ThemeProvider>
  )
}

describe('SearchingLoader', () => {
  it('renders a role=status with the default i18n searching label (Czech)', () => {
    render(wrap(<SearchingLoader />))

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(i18n.t('customer.loader.searching'))
  })

  it('renders a custom i18n label when a labelKey is provided', () => {
    render(wrap(<SearchingLoader labelKey="customer.loader.searching" />))

    expect(screen.getByRole('status')).toHaveTextContent(
      i18n.t('customer.loader.searching'),
    )
  })

  it('has no axe violations', async () => {
    const { container } = render(wrap(<SearchingLoader />))

    expect(await axe(container)).toHaveNoViolations()
  })
})
