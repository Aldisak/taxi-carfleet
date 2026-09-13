import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'
import { EventTimeline } from './OrderEventTimeline'
import type { OrderEventDto } from '../../shared/api/client'

function renderTimeline(events: OrderEventDto[]) {
  return render(
    createElement(
      ThemeProvider,
      { theme },
      createElement(I18nextProvider, { i18n }, createElement(EventTimeline, { events })),
    ),
  )
}

function event(overrides: Partial<OrderEventDto>): OrderEventDto {
  return {
    type: 'Created',
    fromStatus: null,
    toStatus: 'New',
    actorRole: 'Dispatcher',
    at: '2026-09-13T10:00:00Z',
    payload: null,
    ...overrides,
  }
}

describe('OrderEventTimeline — shared Czech labels (B2 regression)', () => {
  it('renders the PriceOverridden event with its Czech label (via the shared map)', () => {
    renderTimeline([event({ type: 'PriceOverridden', toStatus: 'Completed' })])
    expect(screen.getByText('Cena upravena')).toBeInTheDocument()
  })

  it('labels a standard event from the shared map', () => {
    renderTimeline([event({ type: 'Cancelled', toStatus: 'Cancelled' })])
    expect(screen.getByText('Objednávka zrušena')).toBeInTheDocument()
  })

  it('shows the empty message when there are no events', () => {
    renderTimeline([])
    expect(screen.getByText('Žádné události')).toBeInTheDocument()
  })
})
