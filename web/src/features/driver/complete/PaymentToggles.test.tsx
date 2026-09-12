import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import { PaymentToggles } from './PaymentToggles'

function renderToggles(selected: string | null, onSelect = vi.fn()) {
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider theme={theme}>
        <PaymentToggles selected={selected} onSelect={onSelect} />
      </ThemeProvider>
    </I18nextProvider>,
  )
}

describe('PaymentToggles', () => {
  it('renders three payment options in Czech', () => {
    renderToggles(null)
    expect(screen.getByRole('button', { name: 'Hotově' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kartou' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Faktura' })).toBeInTheDocument()
  })

  it('calls onSelect with the PaymentType when a toggle is tapped', async () => {
    const onSelect = vi.fn()
    renderToggles(null, onSelect)
    await userEvent.click(screen.getByRole('button', { name: 'Kartou' }))
    expect(onSelect).toHaveBeenCalledWith('Card')
  })

  it('marks the selected toggle with aria-pressed', () => {
    renderToggles('Cash')
    expect(screen.getByRole('button', { name: 'Hotově' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Kartou' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('has no axe violations', async () => {
    const { container } = renderToggles('Cash')
    expect(await axe(container)).toHaveNoViolations()
  })
})
