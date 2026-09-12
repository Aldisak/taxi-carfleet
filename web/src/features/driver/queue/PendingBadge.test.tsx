import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import { PendingBadge } from './PendingBadge'

function renderBadge(count: number) {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <PendingBadge count={count} />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

describe('PendingBadge', () => {
  it('renders nothing when count is 0', () => {
    const { container } = renderBadge(0)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the Czech waiting-to-send label when items are pending', () => {
    renderBadge(2)
    expect(screen.getByRole('status')).toHaveTextContent('čeká na odeslání')
  })

  it('has no axe violations', async () => {
    const { container } = renderBadge(1)
    expect(await axe(container)).toHaveNoViolations()
  })
})
