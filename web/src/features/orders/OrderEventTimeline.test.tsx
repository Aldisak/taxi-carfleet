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

describe('OrderEventTimeline — desk Timeline restyle (WI-5)', () => {
  it('renders newest event first', () => {
    renderTimeline([
      event({ type: 'Created', toStatus: 'New', at: '2026-09-13T10:00:00Z' }),
      event({ type: 'Cancelled', toStatus: 'Cancelled', at: '2026-09-13T11:00:00Z' }),
    ])
    const items = screen.getAllByRole('listitem')
    expect(items[0].textContent).toContain('Objednávka zrušena')
    expect(items[1].textContent).toContain('Objednávka vytvořena')
  })

  it('folds actor and relative time into one caption', () => {
    renderTimeline([event({ type: 'Created', toStatus: 'New', actorRole: 'Dispatcher' })])
    // caption = "Dispečer · před … d" (actor · relative)
    expect(screen.getByText(/Dispečer\s·/)).toBeInTheDocument()
  })

  it('appends the cancel reason to the caption when present', () => {
    renderTimeline([
      event({ type: 'Cancelled', toStatus: 'Cancelled', payload: { reason: 'zákazník zrušil' } }),
    ])
    expect(screen.getByText(/zákazník zrušil/)).toBeInTheDocument()
  })
})
