import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import { RouteCard } from './RouteCard'
import type { CommonRouteDto } from '../../../shared/api/client'

const route: CommonRouteDto = { id: 'r1', name: 'Nádraží → Centrum', type: 'PointToPoint', priceCzk: 110 }

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname}</div>
}

function renderCard(r: CommonRouteDto = route) {
  return render(
    <ThemeProvider theme={theme}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={['/customer']}>
          <Routes>
            <Route path="/customer" element={<RouteCard route={r} />} />
            <Route path="/customer/order/route/:routeId" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </I18nextProvider>
    </ThemeProvider>,
  )
}

describe('RouteCard', () => {
  it('shows the route name and the cs-CZ formatted price', () => {
    renderCard()
    expect(screen.getByText('Nádraží → Centrum')).toBeInTheDocument()
    expect(screen.getByText(/110\s*Kč/)).toBeInTheDocument()
  })

  it('navigates to the preselected confirm screen on tap', async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByRole('button', { name: /Nádraží → Centrum/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/customer/order/route/r1')
  })

  it('has no axe violations', async () => {
    const { container } = renderCard()
    expect(await axe(container)).toHaveNoViolations()
  })
})
