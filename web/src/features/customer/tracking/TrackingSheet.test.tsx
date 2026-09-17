import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../../../shared/i18n'
import { theme } from '../../../shared/theme/theme'
import { axe } from '../../../shared/test/axe'
import { deriveHeadline, type TrackVm } from './headlineRules'
import type { UseCancelOrderResult } from './useCancelOrder'
import { TrackingSheet } from './TrackingSheet'

const BASE_VM: TrackVm = {
  status: 'New',
  driverFirstName: null,
  etaMinutes: null,
  vehiclePlate: null,
  vehicleColor: null,
  dropoffAddress: null,
  priceCzk: null,
}

function noopCancel(overrides: Partial<UseCancelOrderResult> = {}): UseCancelOrderResult {
  return { cancel: vi.fn().mockResolvedValue(true), isPending: false, errorKey: null, ...overrides }
}

interface RenderArgs {
  vm?: Partial<TrackVm>
  orderId?: string | null
  cancel?: UseCancelOrderResult
  ratingSlot?: React.ReactNode
}

function renderSheet(args: RenderArgs = {}) {
  const vm: TrackVm = { ...BASE_VM, ...args.vm }
  const descriptor = deriveHeadline(vm)
  const cancel = args.cancel ?? noopCancel()
  const utils = render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <I18nextProvider i18n={i18n}>
          <TrackingSheet
            vm={vm}
            descriptor={descriptor}
            orderId={args.orderId === undefined ? 'o1' : args.orderId}
            cancel={cancel}
            ratingSlot={args.ratingSlot}
          />
        </I18nextProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
  return { ...utils, cancel }
}

describe('TrackingSheet', () => {
  it('renders inside a role=dialog sheet with the i18n aria-label', () => {
    renderSheet()
    expect(screen.getByRole('dialog', { name: 'Stav jízdy' })).toBeInTheDocument()
  })

  describe('searching phase (New/Assigned)', () => {
    it('renders the exact e2e heading, the SearchingLoader adornment, and Cancel', () => {
      renderSheet({ vm: { status: 'New' } })
      expect(screen.getByRole('heading', { name: 'Hledáme řidiče…' })).toBeInTheDocument()
      // The loader is an adornment alongside the heading, not a replacement.
      expect(screen.getByRole('status')).toHaveTextContent('Hledám řidiče...')
      expect(screen.getByRole('button', { name: 'Zrušit objednávku' })).toBeInTheDocument()
    })

    it('Assigned status collapses to the same searching heading', () => {
      renderSheet({ vm: { status: 'Assigned' } })
      expect(screen.getByRole('heading', { name: 'Hledáme řidiče…' })).toBeInTheDocument()
    })
  })

  describe('assigned phase (Accepted)', () => {
    it('renders the e2e headline (no-ETA variant), driver + vehicle, and Cancel', () => {
      renderSheet({
        vm: {
          status: 'Accepted',
          driverFirstName: 'Petr',
          etaMinutes: null,
          vehiclePlate: '1AB 2345',
          vehicleColor: 'černá',
        },
      })
      expect(screen.getByRole('heading', { name: /Řidič.*je na cestě/ })).toBeInTheDocument()
      expect(screen.getByText(/1AB 2345/)).toBeInTheDocument()
      expect(screen.getByText(/černá/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Zrušit objednávku' })).toBeInTheDocument()
    })

    it('renders the ETA variant heading when etaMinutes is present without a duplicate ETA line', () => {
      renderSheet({ vm: { status: 'Accepted', driverFirstName: 'Petr', etaMinutes: 5 } })
      expect(screen.getByRole('heading', { name: /přijede za ~5 min/ })).toBeInTheDocument()
    })
  })

  describe('arrived phase', () => {
    it('renders the arrived heading and the vehicle', () => {
      renderSheet({ vm: { status: 'Arrived', vehiclePlate: '1AB 2345', vehicleColor: 'černá' } })
      expect(screen.getByRole('heading', { name: 'Řidič je na místě' })).toBeInTheDocument()
      expect(screen.getByText(/1AB 2345/)).toBeInTheDocument()
    })
  })

  describe('inProgress phase', () => {
    it('renders the "Jedete" heading and the destination', () => {
      renderSheet({ vm: { status: 'InProgress', dropoffAddress: 'Náměstí 5, Praha' } })
      expect(screen.getByRole('heading', { name: 'Jedete' })).toBeInTheDocument()
      expect(screen.getByText(/Náměstí 5, Praha/)).toBeInTheDocument()
    })
  })

  describe('completed phase', () => {
    it('renders the /Hotovo/ heading with cs-CZ grouped price and no double Kč', () => {
      renderSheet({ vm: { status: 'Completed', priceCzk: 1200 } })
      // Template supplies " Kč"; price is a cs-CZ grouped number (NBSP separator), not formatCzk.
      // The regex asserts a single " Kč" (grouped "1 200"), guarding against a double-Kč regression.
      expect(screen.getByRole('heading', { name: /^Hotovo – 1\s200 Kč$/ })).toBeInTheDocument()
    })

    it('renders the injected ratingSlot when provided', () => {
      renderSheet({
        vm: { status: 'Completed', priceCzk: 1200 },
        ratingSlot: <div data-testid="rating-form">rating</div>,
      })
      expect(screen.getByTestId('rating-form')).toBeInTheDocument()
    })

    it('renders the ratingSeam default when no ratingSlot is provided', () => {
      renderSheet({ vm: { status: 'Completed', priceCzk: 1200 }, ratingSlot: undefined })
      expect(screen.getByText('Ohodnoťte prosím svoji jízdu.')).toBeInTheDocument()
      expect(screen.queryByTestId('rating-form')).not.toBeInTheDocument()
    })
  })

  describe('cancelled phase', () => {
    it('renders the cancelled heading and a re-order CTA linking to /customer', () => {
      renderSheet({ vm: { status: 'Cancelled' } })
      expect(screen.getByRole('heading', { name: 'Objednávka byla zrušena' })).toBeInTheDocument()
      const reorder = screen.getByRole('link', { name: 'Objednat znovu' })
      expect(reorder).toHaveAttribute('href', '/customer')
    })
  })

  describe('cancel visibility', () => {
    it('hides Cancel when there is no orderId (public mode)', () => {
      renderSheet({ vm: { status: 'New' }, orderId: null })
      expect(screen.queryByRole('button', { name: 'Zrušit objednávku' })).not.toBeInTheDocument()
    })

    it('hides Cancel in phases where cancel is not allowed', () => {
      renderSheet({ vm: { status: 'Arrived' } })
      expect(screen.queryByRole('button', { name: 'Zrušit objednávku' })).not.toBeInTheDocument()
    })
  })

  describe('cancel dialog flow', () => {
    it('opens the CancelDialog on Cancel and fires confirm', async () => {
      const user = userEvent.setup()
      const cancel = noopCancel()
      renderSheet({ vm: { status: 'Accepted', driverFirstName: 'Petr', etaMinutes: null }, cancel })
      await user.click(screen.getByRole('button', { name: 'Zrušit objednávku' }))
      expect(screen.getByRole('dialog', { name: 'Zrušit objednávku?' })).toBeInTheDocument()
      // Post-Accepted hint shows.
      expect(screen.getByText(/Řidič už jede/)).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Ano, zrušit' }))
      expect(cancel.cancel).toHaveBeenCalled()
    })

    it('keeps the dialog open when cancel fails (stale-close avoidance)', async () => {
      const user = userEvent.setup()
      const cancel = noopCancel({ cancel: vi.fn().mockResolvedValue(false), errorKey: 'customer.tracking.cancelTooLate' })
      renderSheet({ vm: { status: 'Accepted', driverFirstName: 'Petr', etaMinutes: null }, cancel })
      await user.click(screen.getByRole('button', { name: 'Zrušit objednávku' }))
      await user.click(screen.getByRole('button', { name: 'Ano, zrušit' }))
      // Dialog remains present on failure.
      expect(screen.getByRole('dialog', { name: 'Zrušit objednávku?' })).toBeInTheDocument()
    })

    it('dismisses the dialog', async () => {
      const user = userEvent.setup()
      renderSheet({ vm: { status: 'Accepted', driverFirstName: 'Petr', etaMinutes: null } })
      await user.click(screen.getByRole('button', { name: 'Zrušit objednávku' }))
      await user.click(screen.getByRole('button', { name: 'Ne, ponechat' }))
      expect(screen.queryByRole('dialog', { name: 'Zrušit objednávku?' })).not.toBeInTheDocument()
    })
  })

  describe('escape', () => {
    it('closes the sheet on Escape', async () => {
      const user = userEvent.setup()
      renderSheet({ vm: { status: 'New' } })
      expect(screen.getByRole('dialog', { name: 'Stav jízdy' })).toBeInTheDocument()
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog', { name: 'Stav jízdy' })).not.toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('marks the status headline aria-live polite', () => {
      renderSheet({ vm: { status: 'New' } })
      const heading = screen.getByRole('heading', { name: 'Hledáme řidiče…' })
      // The headline lives inside an aria-live=polite region.
      expect(heading.closest('[aria-live="polite"]')).not.toBeNull()
    })

    it('has no axe violations in the searching phase', async () => {
      const { container } = renderSheet({ vm: { status: 'New' } })
      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no axe violations in the assigned phase', async () => {
      const { container } = renderSheet({
        vm: { status: 'Accepted', driverFirstName: 'Petr', etaMinutes: 5, vehiclePlate: '1AB 2345', vehicleColor: 'černá' },
      })
      expect(await axe(container)).toHaveNoViolations()
    })
  })
})
