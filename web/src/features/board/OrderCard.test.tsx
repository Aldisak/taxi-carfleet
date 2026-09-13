import { describe, it, expect, vi, beforeEach } from 'vitest'
import { axe } from '../../shared/test/axe'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'
import { OrderCard } from './OrderCard'
import type { OrderSummaryDto } from '../../shared/api/client'

// Mock the hub connection state so action buttons are not blocked in tests
vi.mock('../../shared/realtime/useFleetHub', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/realtime/useFleetHub')>()
  return {
    ...actual,
    useHubConnectionState: vi.fn(() => 'connected'),
  }
})

// Mock the client module so we can control what getDrivers/getOrder returns
vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return {
    ...actual,
    getDrivers: vi.fn(),
    getOrder: vi.fn(),
    postAssignOrder: vi.fn(),
    postReassignOrder: vi.fn(),
    postCancelOrder: vi.fn(),
  }
})

import * as client from '../../shared/api/client'

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) =>
    createElement(
      MemoryRouter,
      null,
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          ThemeProvider,
          { theme },
          createElement(I18nextProvider, { i18n }, children),
        ),
      ),
    )
}

function makeWrapperWithClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      MemoryRouter,
      null,
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          ThemeProvider,
          { theme },
          createElement(I18nextProvider, { i18n }, children),
        ),
      ),
    )
  return { queryClient, wrapper }
}

function makeOrder(overrides?: Partial<OrderSummaryDto>): OrderSummaryDto {
  return {
    id: 'order-1',
    publicCode: 'ABC123',
    status: 'New',
    source: 'Phone',
    customerPhone: '+420777123456',
    customerName: 'Jan Novák',
    pickupAddress: 'Nádraží Kolín',
    dropoffAddress: 'Nemocnice Kolín',
    scheduledAt: null,
    passengers: 2,
    priceType: 'Meter',
    estimatedPriceCzk: null,
    fixedPriceCzk: null,
    driverId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

const MOCK_ORDER_DETAIL = {
  id: 'order-1',
  publicCode: 'ABC123',
  status: 'New',
  source: 'Phone',
  customerPhone: '+420777123456',
  customerName: 'Jan Novák',
  pickupAddress: 'Nádraží Kolín',
  pickupLat: 50.027,
  pickupLng: 15.2,
  dropoffAddress: 'Nemocnice Kolín',
  dropoffLat: null,
  dropoffLng: null,
  scheduledAt: null,
  note: null,
  passengers: 2,
  priceType: 'Meter',
  estimatedPriceCzk: null,
  fixedPriceCzk: null,
  finalPriceCzk: null,
  paymentType: null,
  driverId: null,
  vehicleId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  allowedActions: [],
  version: 1,
}

describe('OrderCard — card renders fields', () => {
  beforeEach(() => {
    vi.mocked(client.getDrivers).mockResolvedValue({ items: [] })
    vi.mocked(client.getOrder).mockResolvedValue(MOCK_ORDER_DETAIL)
  })

  it('renders public code', () => {
    render(createElement(OrderCard, { order: makeOrder() }), { wrapper: makeWrapper() })
    expect(screen.getByText('ABC123')).toBeInTheDocument()
  })

  it('renders ASAP for unscheduled orders', () => {
    render(createElement(OrderCard, { order: makeOrder({ scheduledAt: null }) }), { wrapper: makeWrapper() })
    // board.order.asap = "ASAP" in both locales
    expect(screen.getByText('ASAP')).toBeInTheDocument()
  })

  it('renders phone and customer name', () => {
    render(createElement(OrderCard, { order: makeOrder() }), { wrapper: makeWrapper() })
    expect(screen.getByText('+420777123456 · Jan Novák')).toBeInTheDocument()
  })

  it('renders pickup address', () => {
    render(createElement(OrderCard, { order: makeOrder() }), { wrapper: makeWrapper() })
    expect(screen.getByLabelText('pickup-address')).toHaveTextContent('Nádraží Kolín')
  })

  it('renders dropoff address with arrow', () => {
    render(createElement(OrderCard, { order: makeOrder() }), { wrapper: makeWrapper() })
    expect(screen.getByLabelText('dropoff-address')).toHaveTextContent('→ Nemocnice Kolín')
  })

  it('renders fixed price badge for Fixed priceType', () => {
    render(
      createElement(OrderCard, {
        order: makeOrder({ priceType: 'Fixed', fixedPriceCzk: 110 }),
      }),
      { wrapper: makeWrapper() },
    )
    // Badge contains "FIXED 110 CZK" (English locale)
    expect(screen.getByText(/110/)).toBeInTheDocument()
  })

  it('renders estimate label for Estimate priceType', () => {
    render(
      createElement(OrderCard, {
        order: makeOrder({ priceType: 'Estimate', estimatedPriceCzk: 90 }),
      }),
      { wrapper: makeWrapper() },
    )
    expect(screen.getByText(/90/)).toBeInTheDocument()
  })

  it('renders status pill', () => {
    render(createElement(OrderCard, { order: makeOrder({ status: 'New' }) }), { wrapper: makeWrapper() })
    expect(screen.getByLabelText('status-New')).toBeInTheDocument()
  })
})

describe('OrderCard — Assign inline picker', () => {
  beforeEach(() => {
    vi.mocked(client.getOrder).mockResolvedValue(MOCK_ORDER_DETAIL)
    vi.mocked(client.getDrivers).mockResolvedValue({
      items: [
        {
          driverId: 'driver-1',
          displayName: 'Karel Novák',
          status: 'Free',
          currentVehiclePlate: 'KO123',
          lastPositionAt: null,
          lastLat: null,
          lastLng: null,
        },
      ],
    })
    vi.mocked(client.postAssignOrder).mockResolvedValue({
      order: {
        id: 'order-1',
        publicCode: 'ABC123',
        status: 'Assigned',
        source: 'Phone',
        customerPhone: '+420777123456',
        customerName: null,
        pickupAddress: 'Nádraží Kolín',
        pickupLat: 50.027,
        pickupLng: 15.2,
        dropoffAddress: null,
        dropoffLat: null,
        dropoffLng: null,
        scheduledAt: null,
        note: null,
        passengers: 1,
        priceType: 'Meter',
        estimatedPriceCzk: null,
        fixedPriceCzk: null,
        finalPriceCzk: null,
        paymentType: null,
        driverId: 'driver-1',
        vehicleId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        allowedActions: [],
        version: 1,
      },
    })
  })

  it('opens inline driver picker when Assign button is clicked', async () => {
    render(createElement(OrderCard, { order: makeOrder({ status: 'New' }) }), { wrapper: makeWrapper() })
    // Czech: "Přiřadit"
    const assignBtn = screen.getByLabelText('Přiřadit')
    fireEvent.click(assignBtn)
    await waitFor(() => {
      expect(screen.getByRole('listbox')).toBeInTheDocument()
    })
  })

  it('picker is not a modal (does not cover the entire page)', () => {
    render(createElement(OrderCard, { order: makeOrder({ status: 'New' }) }), { wrapper: makeWrapper() })
    // Czech: "Přiřadit"
    const assignBtn = screen.getByLabelText('Přiřadit')
    fireEvent.click(assignBtn)
    // A modal would have role="dialog"; DriverPicker uses role="listbox" inside the card
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('OrderCard — Cancel requires reason', () => {
  beforeEach(() => {
    vi.mocked(client.getDrivers).mockResolvedValue({ items: [] })
    vi.mocked(client.getOrder).mockResolvedValue(MOCK_ORDER_DETAIL)
    vi.mocked(client.postCancelOrder).mockResolvedValue({
      order: {
        id: 'order-1',
        publicCode: 'ABC123',
        status: 'Cancelled',
        source: 'Phone',
        customerPhone: '+420777123456',
        customerName: null,
        pickupAddress: 'Nádraží Kolín',
        pickupLat: 50.027,
        pickupLng: 15.2,
        dropoffAddress: null,
        dropoffLat: null,
        dropoffLng: null,
        scheduledAt: null,
        note: null,
        passengers: 1,
        priceType: 'Meter',
        estimatedPriceCzk: null,
        fixedPriceCzk: null,
        finalPriceCzk: null,
        paymentType: null,
        driverId: null,
        vehicleId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        allowedActions: [],
        version: 1,
      },
    })
  })

  it('shows cancel form when Cancel button is clicked', () => {
    render(createElement(OrderCard, { order: makeOrder({ status: 'New' }) }), { wrapper: makeWrapper() })
    // Czech: "Zrušit"
    fireEvent.click(screen.getByLabelText('Zrušit'))
    expect(screen.getByLabelText('cancel-form')).toBeInTheDocument()
  })

  it('blocks cancel submission without selecting a reason', async () => {
    render(createElement(OrderCard, { order: makeOrder({ status: 'New' }) }), { wrapper: makeWrapper() })
    // Czech: "Zrušit"
    fireEvent.click(screen.getByLabelText('Zrušit'))
    // Czech: "Potvrdit"
    fireEvent.click(screen.getByLabelText('Potvrdit'))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(client.postCancelOrder).not.toHaveBeenCalled()
  })

  it('allows cancel when a reason is selected', async () => {
    render(createElement(OrderCard, { order: makeOrder({ status: 'New' }) }), { wrapper: makeWrapper() })
    // Czech: "Zrušit"
    fireEvent.click(screen.getByLabelText('Zrušit'))
    // Czech: "Důvod zrušení"
    const select = screen.getByLabelText('Důvod zrušení')
    fireEvent.change(select, { target: { value: 'nedorazil' } })
    // Czech: "Potvrdit"
    fireEvent.click(screen.getByLabelText('Potvrdit'))
    await waitFor(() => {
      expect(client.postCancelOrder).toHaveBeenCalledWith('order-1', 'nedorazil')
    })
  })
})

describe('OrderCard — 409 conflict message', () => {
  beforeEach(() => {
    vi.mocked(client.getDrivers).mockResolvedValue({ items: [] })
    vi.mocked(client.getOrder).mockResolvedValue(MOCK_ORDER_DETAIL)
    vi.mocked(client.postCancelOrder).mockRejectedValue(
      new client.ApiResponseError(409, {
        status: 409,
        title: 'Conflict',
        type: 'https://httpstatuses.com/409',
      }),
    )
  })

  it('shows conflict message on 409 error during cancel', async () => {
    render(createElement(OrderCard, { order: makeOrder({ status: 'New' }) }), { wrapper: makeWrapper() })
    // Czech labels
    fireEvent.click(screen.getByLabelText('Zrušit'))
    const select = screen.getByLabelText('Důvod zrušení')
    fireEvent.change(select, { target: { value: 'nedorazil' } })
    fireEvent.click(screen.getByLabelText('Potvrdit'))
    await waitFor(() => {
      // The conflict message should appear (from ConflictMsg role="alert")
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('invalidates orders query on 409 during cancel (reconcile refetch)', async () => {
    const { queryClient, wrapper } = makeWrapperWithClient()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    render(createElement(OrderCard, { order: makeOrder({ status: 'New' }) }), { wrapper })
    fireEvent.click(screen.getByLabelText('Zrušit'))
    const select = screen.getByLabelText('Důvod zrušení')
    fireEvent.change(select, { target: { value: 'nedorazil' } })
    fireEvent.click(screen.getByLabelText('Potvrdit'))
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: expect.arrayContaining(['orders']) }),
      )
    })
  })
})

describe('OrderCard — Confirm button blocked when disconnected', () => {
  beforeEach(async () => {
    vi.mocked(client.postCancelOrder).mockClear()
    const { useHubConnectionState } = await import('../../shared/realtime/useFleetHub')
    vi.mocked(useHubConnectionState).mockReturnValue('connected')
    vi.mocked(client.getDrivers).mockResolvedValue({ items: [] })
    vi.mocked(client.getOrder).mockResolvedValue(MOCK_ORDER_DETAIL)
    vi.mocked(client.postCancelOrder).mockResolvedValue({
      order: {
        id: 'order-1',
        publicCode: 'ABC123',
        status: 'Cancelled',
        source: 'Phone',
        customerPhone: '+420777123456',
        customerName: null,
        pickupAddress: 'Nádraží Kolín',
        pickupLat: 50.027,
        pickupLng: 15.2,
        dropoffAddress: null,
        dropoffLat: null,
        dropoffLng: null,
        scheduledAt: null,
        note: null,
        passengers: 1,
        priceType: 'Meter',
        estimatedPriceCzk: null,
        fixedPriceCzk: null,
        finalPriceCzk: null,
        paymentType: null,
        driverId: null,
        vehicleId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        allowedActions: [],
        version: 1,
      },
    })
  })

  it('Confirm button is disabled and postCancelOrder not called when disconnected after cancel form opens', async () => {
    const { useHubConnectionState } = await import('../../shared/realtime/useFleetHub')
    // Start connected so cancel form button is enabled
    vi.mocked(useHubConnectionState).mockReturnValue('connected')
    const { rerender } = render(
      createElement(OrderCard, { order: makeOrder({ status: 'New' }) }),
      { wrapper: makeWrapper() },
    )
    // Open cancel form
    fireEvent.click(screen.getByLabelText('Zrušit'))
    expect(screen.getByLabelText('cancel-form')).toBeInTheDocument()
    // Now simulate disconnection
    vi.mocked(useHubConnectionState).mockReturnValue('disconnected')
    rerender(createElement(OrderCard, { order: makeOrder({ status: 'New' }) }))
    // Confirm button should be disabled
    expect(screen.getByLabelText('Potvrdit')).toBeDisabled()
    // Clicking it should not call postCancelOrder
    fireEvent.click(screen.getByLabelText('Potvrdit'))
    await new Promise(r => setTimeout(r, 50))
    expect(client.postCancelOrder).not.toHaveBeenCalled()
  })
})

describe('OrderCard — failed-SMS red icon (UC-005 B2)', () => {
  beforeEach(() => {
    vi.mocked(client.getDrivers).mockResolvedValue({ items: [] })
    vi.mocked(client.getOrder).mockResolvedValue(MOCK_ORDER_DETAIL)
  })

  it('shows the red icon when the cached order detail has a failed SMS', () => {
    const { queryClient, wrapper } = makeWrapperWithClient()
    // Seed the order-detail cache (the key OrderCard reads passively) with a failed SMS.
    queryClient.setQueryData(['orders', 'detail', 'order-1'], {
      ...MOCK_ORDER_DETAIL,
      notifications: [
        { event: 'DriverArrived', channel: 'Sms', recipient: '+420777123456', status: 'Failed', createdAt: '2026-09-13T09:00:00Z' },
      ],
    })
    render(createElement(OrderCard, { order: makeOrder() }), { wrapper })
    expect(screen.getByLabelText(/SMS se nepodařila odeslat/i)).toBeInTheDocument()
  })

  it('does not show the icon when the cached detail has only a sent SMS', () => {
    const { queryClient, wrapper } = makeWrapperWithClient()
    queryClient.setQueryData(['orders', 'detail', 'order-1'], {
      ...MOCK_ORDER_DETAIL,
      notifications: [
        { event: 'DriverArrived', channel: 'Sms', recipient: '+420777123456', status: 'Sent', createdAt: '2026-09-13T09:00:00Z' },
      ],
    })
    render(createElement(OrderCard, { order: makeOrder() }), { wrapper })
    expect(screen.queryByLabelText(/SMS se nepodařila odeslat/i)).not.toBeInTheDocument()
  })

  it('does not show the icon when the detail is not cached', () => {
    render(createElement(OrderCard, { order: makeOrder() }), { wrapper: makeWrapper() })
    expect(screen.queryByLabelText(/SMS se nepodařila odeslat/i)).not.toBeInTheDocument()
  })

  it('reacts when a failed SMS lands in the detail cache AFTER mount', async () => {
    const { queryClient, wrapper } = makeWrapperWithClient()
    render(createElement(OrderCard, { order: makeOrder() }), { wrapper })
    // Initially no cached detail → no icon.
    expect(screen.queryByLabelText(/SMS se nepodařila odeslat/i)).not.toBeInTheDocument()
    // Detail lands later (e.g. drawer/assign-picker populates it) → the card must re-render.
    queryClient.setQueryData(['orders', 'detail', 'order-1'], {
      ...MOCK_ORDER_DETAIL,
      notifications: [
        { event: 'DriverArrived', channel: 'Sms', recipient: '+420777123456', status: 'Failed', createdAt: '2026-09-13T09:00:00Z' },
      ],
    })
    expect(await screen.findByLabelText(/SMS se nepodařila odeslat/i)).toBeInTheDocument()
  })
})

describe('OrderCard — at-a-glance failed-SMS red icon (list flag, laneB5b)', () => {
  beforeEach(() => {
    vi.mocked(client.getDrivers).mockResolvedValue({ items: [] })
    vi.mocked(client.getOrder).mockResolvedValue(MOCK_ORDER_DETAIL)
  })

  it('shows the red icon when the list item hasFailedSms=true (no detail cached)', () => {
    render(createElement(OrderCard, { order: makeOrder({ hasFailedSms: true }) }), {
      wrapper: makeWrapper(),
    })
    expect(screen.getByLabelText(/SMS se nepodařila odeslat/i)).toBeInTheDocument()
  })

  it('does not show the icon when the list item hasFailedSms=false (no detail cached)', () => {
    render(createElement(OrderCard, { order: makeOrder({ hasFailedSms: false }) }), {
      wrapper: makeWrapper(),
    })
    expect(screen.queryByLabelText(/SMS se nepodařila odeslat/i)).not.toBeInTheDocument()
  })

  it('still shows the icon from the detail cache even when the list flag is false (detail is authoritative when present)', () => {
    const { queryClient, wrapper } = makeWrapperWithClient()
    queryClient.setQueryData(['orders', 'detail', 'order-1'], {
      ...MOCK_ORDER_DETAIL,
      notifications: [
        { event: 'DriverArrived', channel: 'Sms', recipient: '+420777123456', status: 'Failed', createdAt: '2026-09-13T09:00:00Z' },
      ],
    })
    render(createElement(OrderCard, { order: makeOrder({ hasFailedSms: false }) }), { wrapper })
    expect(screen.getByLabelText(/SMS se nepodařila odeslat/i)).toBeInTheDocument()
  })
})

describe('OrderCard — accessibility', () => {
  beforeEach(() => {
    vi.mocked(client.getDrivers).mockResolvedValue({ items: [] })
    vi.mocked(client.getOrder).mockResolvedValue(MOCK_ORDER_DETAIL)
  })

  it('has no axe violations', async () => {
    const { container } = render(createElement(OrderCard, { order: makeOrder() }), {
      wrapper: makeWrapper(),
    })
    expect(await axe(container)).toHaveNoViolations()
  })
})
