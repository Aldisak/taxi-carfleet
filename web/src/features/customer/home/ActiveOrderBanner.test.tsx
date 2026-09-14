import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import { ActiveOrderBanner } from './ActiveOrderBanner'
import type { MyActiveOrderDto } from '../../../shared/api/client'

const order: MyActiveOrderDto = { id: 'o1', publicCode: 'K7F2A9', status: 'Assigned' }

function renderBanner() {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <ActiveOrderBanner activeOrder={order} />
        </MemoryRouter>
      </I18nextProvider>
    </ThemeProvider>,
  )
}

describe('ActiveOrderBanner', () => {
  it('shows the active order code and links to tracking', () => {
    renderBanner()
    expect(screen.getByText(/K7F2A9/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /sledovat|K7F2A9/i })
    expect(link).toHaveAttribute('href', '/customer/t/K7F2A9')
  })

  it('has no axe violations', async () => {
    const { container } = renderBanner()
    expect(await axe(container)).toHaveNoViolations()
  })
})
