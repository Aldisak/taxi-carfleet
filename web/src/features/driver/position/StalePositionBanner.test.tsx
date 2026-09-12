import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import { StalePositionBanner } from './StalePositionBanner'

function renderBanner(stale: boolean) {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <StalePositionBanner stale={stale} />
      </I18nextProvider>
    </ThemeProvider>,
  )
}

describe('StalePositionBanner', () => {
  it('renders nothing when not stale', () => {
    const { container } = renderBanner(false)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the Czech stale message when stale', () => {
    renderBanner(true)
    expect(screen.getByRole('alert')).toHaveTextContent('Poloha se neodesílá')
  })

  it('has no axe violations', async () => {
    const { container } = renderBanner(true)
    expect(await axe(container)).toHaveNoViolations()
  })
})
