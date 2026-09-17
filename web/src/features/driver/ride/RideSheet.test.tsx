import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import type { OrderDetailDto } from '../../../shared/api/client'
import { RideSheet, type RideSheetProps } from './RideSheet'

const BASE_ORDER: OrderDetailDto = {
  id: 'o1',
  publicCode: 'ABC123',
  status: 'Accepted',
  source: 'Phone',
  customerPhone: '+420777123456',
  customerName: 'Jan Novák',
  pickupAddress: 'Nádražní 1, Kutná Hora',
  pickupLat: 49.95,
  pickupLng: 15.27,
  dropoffAddress: 'Centrum Kutná Hora',
  dropoffLat: 49.96,
  dropoffLng: 15.28,
  scheduledAt: null,
  note: null,
  passengers: 1,
  priceType: 'Estimated',
  estimatedPriceCzk: 150,
  fixedPriceCzk: null,
  finalPriceCzk: null,
  paymentType: 'Cash',
  driverId: 'd1',
  vehicleId: 'v1',
  createdAt: '2026-09-17T10:00:00Z',
  updatedAt: '2026-09-17T10:00:00Z',
  allowedActions: [],
  version: 1,
}

function makeProps(overrides: Partial<RideSheetProps> = {}): RideSheetProps {
  return {
    order: BASE_ORDER,
    noShowEnabled: false,
    noShowCountdownSeconds: null,
    etaMinutes: null,
    onArrive: vi.fn(),
    onStart: vi.fn(),
    onComplete: vi.fn(),
    onNoShow: vi.fn(),
    isPending: false,
    pendingCount: 0,
    reconciledNote: false,
    ...overrides,
  }
}

function renderSheet(overrides: Partial<RideSheetProps> = {}) {
  const props = makeProps(overrides)
  const utils = render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <RideSheet {...props} />
        </I18nextProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
  return { ...utils, props }
}

describe('RideSheet', () => {
  it('shows Arrive primary + Navigate toward pickup and calls onArrive when Accepted', async () => {
    const { props } = renderSheet({ order: { ...BASE_ORDER, status: 'Accepted' } })

    const arrive = screen.getByRole('button', { name: 'Jsem na místě' })
    expect(arrive).toBeInTheDocument()

    const nav = screen.getByRole('link', { name: 'Navigovat' })
    expect(nav.getAttribute('href')).toContain('49.95')
    // Exactly one Navigate control — guards the duplicate-nav trap (RideButton's internal nav
    // must stay suppressed while NavHandoff renders the real <a>).
    expect(screen.getAllByText('Navigovat')).toHaveLength(1)

    await userEvent.click(arrive)
    expect(props.onArrive).toHaveBeenCalledTimes(1)
  })

  it('shows Start primary + disabled No-show with countdown and calls onStart when Arrived', async () => {
    const { props } = renderSheet({
      order: { ...BASE_ORDER, status: 'Arrived' },
      noShowEnabled: false,
      noShowCountdownSeconds: 42,
    })

    const start = screen.getByRole('button', { name: 'Zahájit jízdu' })
    expect(start).toBeInTheDocument()

    const noShow = screen.getByRole('button', { name: /Dostupné za 42 s/ })
    expect(noShow).toBeDisabled()

    await userEvent.click(start)
    expect(props.onStart).toHaveBeenCalledTimes(1)
  })

  it('shows Complete primary + Navigate toward dropoff and calls onComplete when InProgress with dropoff', async () => {
    const { props } = renderSheet({ order: { ...BASE_ORDER, status: 'InProgress' } })

    const complete = screen.getByRole('button', { name: 'Ukončit jízdu' })
    expect(complete).toBeInTheDocument()

    const nav = screen.getByRole('link', { name: 'Navigovat k cíli' })
    expect(nav.getAttribute('href')).toContain('49.96')

    await userEvent.click(complete)
    expect(props.onComplete).toHaveBeenCalledTimes(1)
  })

  it('renders no Navigate button when InProgress without a dropoff', () => {
    renderSheet({
      order: { ...BASE_ORDER, status: 'InProgress', dropoffAddress: null, dropoffLat: null, dropoffLng: null },
    })
    expect(screen.queryByRole('link', { name: /Navigovat/ })).not.toBeInTheDocument()
  })

  it('shows the pickup ETA line when etaMinutes is set on an Accepted ride', () => {
    renderSheet({ order: { ...BASE_ORDER, status: 'Accepted' }, etaMinutes: 7 })
    expect(screen.getByText('Příjezd za 7 min')).toBeInTheDocument()
  })

  it('omits the ETA line when etaMinutes is null', () => {
    renderSheet({ order: { ...BASE_ORDER, status: 'Accepted' }, etaMinutes: null })
    expect(screen.queryByText(/Příjezd za/)).not.toBeInTheDocument()
  })

  it('shows the reassigned alert and the pending badge when flagged', () => {
    renderSheet({ reconciledNote: true, pendingCount: 1 })
    expect(screen.getByRole('alert')).toHaveTextContent('Objednávka byla přeřazena')
    expect(screen.getByText('čeká na odeslání')).toBeInTheDocument()
  })

  it('is a role=dialog sheet, closes on Escape, and has no axe violations', async () => {
    const { container } = renderSheet()
    const dialog = screen.getByRole('dialog', { name: 'Aktivní jízda' })
    expect(dialog).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    // Escape is wired to BottomSheet's onClose (collapse) — the ride controls persist.
    expect(screen.getByRole('dialog', { name: 'Aktivní jízda' })).toBeInTheDocument()

    expect(await axe(container)).toHaveNoViolations()
  })
})
