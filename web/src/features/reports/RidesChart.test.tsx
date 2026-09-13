import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { axe } from '../../shared/test/axe'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'
import { RidesChart } from './RidesChart'

function renderChart(data: { date: string; count: number }[]) {
  return render(
    createElement(
      ThemeProvider,
      { theme },
      createElement(I18nextProvider, { i18n }, createElement(RidesChart, { data })),
    ),
  )
}

describe('RidesChart', () => {
  it('renders an SVG with one bar per day', () => {
    const { container } = renderChart([
      { date: '2026-09-01', count: 4 },
      { date: '2026-09-02', count: 8 },
    ])
    expect(screen.getByRole('img', { name: /jízdy po dnech/i })).toBeInTheDocument()
    expect(container.querySelectorAll('rect')).toHaveLength(2)
  })

  it('shows the empty message when there is no data', () => {
    renderChart([])
    expect(screen.getByText(/žádné jízdy/i)).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = renderChart([{ date: '2026-09-01', count: 4 }])
    expect(await axe(container)).toHaveNoViolations()
  })
})
