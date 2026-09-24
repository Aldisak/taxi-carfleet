import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { axe } from '../../shared/test/axe'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { I18nextProvider } from 'react-i18next'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'
import { OrderDrawer } from './OrderDrawer'

vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return {
    ...actual,
    getOrder: vi.fn(),
    getOrderEvents: vi.fn(),
    patchOrder: vi.fn(),
    postAssignOrder: vi.fn(),
    postReassignOrder: vi.fn(),
    postCancelOrder: vi.fn(),
    getDrivers: vi.fn(),
    getGeoSuggest: vi.fn().mockResolvedValue({ items: [] }),
  }
})

import * as client from '../../shared/api/client'

const mockGetOrder = vi.mocked(client.getOrder)
const mockGetOrderEvents = vi.mocked(client.getOrderEvents)
const mockPatchOrder = vi.mocked(client.patchOrder)

function makeOrder(overrides?: Partial<client.OrderDetailDto>): client.OrderDetailDto {
  return {
    id: 'order-abc',
    publicCode: 'KH-001',
    status: 'New',
    source: 'Dispatcher',
    customerPhone: '+420600111222',
    customerName: 'Jan Novák',
    pickupAddress: 'Náměstí Republiky 1, Kolín',
    pickupLat: 50.03,
    pickupLng: 15.2,
    dropoffAddress: 'Kutná Hora',
    dropoffLat: 49.95,
    dropoffLng: 15.26,
    scheduledAt: null,
    note: 'Pozn.',
    passengers: 1,
    priceType: 'Estimate',
    estimatedPriceCzk: 150,
    fixedPriceCzk: null,
    finalPriceCzk: null,
    paymentType: null,
    driverId: null,
    vehicleId: null,
    createdAt: '2026-09-10T10:00:00Z',
    updatedAt: '2026-09-10T10:00:00Z',
    allowedActions: ['assign', 'cancel'],
    version: 1,
    ...overrides,
  }
}

function makeWrapper(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        ThemeProvider,
        { theme },
        createElement(
          I18nextProvider,
          { i18n },
          createElement(
            MemoryRouter,
            { initialEntries: [initialPath] },
            createElement(
              Routes,
              null,
              createElement(Route, { path: '/dispatcher', element: createElement('div', { 'data-testid': 'board' }, 'Board') }),
              createElement(Route, { path: '/dispatcher/orders/:id', element: children }),
            ),
          ),
        ),
      ),
    )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetOrderEvents.mockResolvedValue([])
})

describe('OrderDrawer — route open/close', () => {
  it('renders the drawer when navigated to /dispatcher/orders/:id', async () => {
    mockGetOrder.mockResolvedValue(makeOrder())

    render(createElement(OrderDrawer), {
      wrapper: makeWrapper('/dispatcher/orders/order-abc'),
    })

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(await screen.findByText(/KH-001/i)).toBeInTheDocument()
  })

  it('shows a "bez souřadnic" warning for an order with no pickup coordinates (0,0 sentinel, AC#2)', async () => {
    mockGetOrder.mockResolvedValue(makeOrder({ pickupLat: 0, pickupLng: 0 }))

    render(createElement(OrderDrawer), {
      wrapper: makeWrapper('/dispatcher/orders/order-abc'),
    })

    await screen.findByRole('dialog')
    expect(await screen.findByText(/bez souřadnic/i)).toBeInTheDocument()
  })

  it('does NOT show "bez souřadnic" for an order with real pickup coordinates', async () => {
    mockGetOrder.mockResolvedValue(makeOrder({ pickupLat: 50.03, pickupLng: 15.2 }))

    render(createElement(OrderDrawer), {
      wrapper: makeWrapper('/dispatcher/orders/order-abc'),
    })

    await screen.findByRole('dialog')
    expect(screen.queryByText(/bez souřadnic/i)).not.toBeInTheDocument()
  })

  it('navigates back to /x when the overlay is clicked', async () => {
    mockGetOrder.mockResolvedValue(makeOrder())

    render(createElement(OrderDrawer), {
      wrapper: makeWrapper('/dispatcher/orders/order-abc'),
    })

    // Wait for drawer to render
    const dialog = await screen.findByRole('dialog')

    // Click the overlay (not the panel itself)
    fireEvent.click(dialog)

    // Board page should show (we rendered a mock board at /x)
    await waitFor(() => {
      expect(screen.getByTestId('board')).toBeInTheDocument()
    })
  })
})

describe('OrderDrawer — PATCH diff payload', () => {
  it('omits pickupAddress from PATCH payload when not changed in edit', async () => {
    const order = makeOrder({ status: 'New', note: 'Původní poznámka' })
    mockGetOrder.mockResolvedValue(order)
    const updated = { ...order, note: 'Nová poznámka', version: 2 }
    mockPatchOrder.mockResolvedValue(updated)

    render(createElement(OrderDrawer), {
      wrapper: makeWrapper('/dispatcher/orders/order-abc'),
    })

    // Wait for drawer to load
    await screen.findByText(/KH-001/i)

    // Start edit
    const editBtn = await screen.findByRole('button', { name: /edit|upravit/i })
    fireEvent.click(editBtn)

    // Change only the note field — clear it and type new value
    const noteArea = screen.getByRole('textbox', { name: /note|poznámka/i })
    fireEvent.change(noteArea, { target: { value: 'Nová poznámka' } })

    // Save
    const saveBtn = screen.getByRole('button', { name: /save|uložit/i })
    fireEvent.click(saveBtn)

    await waitFor(() => expect(mockPatchOrder).toHaveBeenCalled())

    // pickupAddress should NOT be in the payload since it wasn't changed
    const [, payload] = mockPatchOrder.mock.calls[0]
    expect(payload).not.toHaveProperty('pickupAddress')
    expect(payload).toMatchObject({ note: 'Nová poznámka', version: 1 })
  })

  it('includes scheduledAt in PATCH payload when changed', async () => {
    const order = makeOrder({ status: 'New', scheduledAt: null })
    mockGetOrder.mockResolvedValue(order)
    mockPatchOrder.mockResolvedValue({ ...order, scheduledAt: '2026-09-10T14:00:00Z', version: 2 })

    render(createElement(OrderDrawer), {
      wrapper: makeWrapper('/dispatcher/orders/order-abc'),
    })

    await screen.findByText(/KH-001/i)

    // Start edit
    const editBtn = await screen.findByRole('button', { name: /edit|upravit/i })
    fireEvent.click(editBtn)

    // Change scheduledAt via datetime-local input
    const scheduledInput = screen.getByLabelText(/plánovaný čas|scheduledAt/i)
    fireEvent.change(scheduledInput, { target: { value: '2026-09-10T14:00' } })

    // Save
    const saveBtn = screen.getByRole('button', { name: /save|uložit/i })
    fireEvent.click(saveBtn)

    await waitFor(() => expect(mockPatchOrder).toHaveBeenCalled())

    const [, payload] = mockPatchOrder.mock.calls[0]
    expect(payload).toHaveProperty('scheduledAt')
    expect(payload.version).toBe(1)
  })
})

describe('OrderDrawer — address autocomplete edit', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('selecting a pickup suggestion sets coords; unchanged dropoff sends no coords in PATCH', async () => {
    const { getGeoSuggest } = await import('../../shared/api/client')
    const mockGeoSuggest = vi.mocked(getGeoSuggest)
    mockGeoSuggest.mockResolvedValue({
      items: [{ name: 'Kolín nádraží', label: 'Adresa', lat: 50.027, lng: 15.2005 }],
    })

    const order = makeOrder({
      status: 'New',
      pickupAddress: 'Původní nástupní adresa',
      pickupLat: 50.03,
      pickupLng: 15.2,
      dropoffAddress: 'Kutná Hora',
      dropoffLat: 49.95,
      dropoffLng: 15.26,
    })
    mockGetOrder.mockResolvedValue(order)
    mockPatchOrder.mockResolvedValue({ ...order, pickupAddress: 'Kolín nádraží', version: 2 })

    render(createElement(OrderDrawer), {
      wrapper: makeWrapper('/dispatcher/orders/order-abc'),
    })

    // Wait for drawer to load
    await waitFor(() => expect(screen.queryByText(/KH-001/i)).toBeInTheDocument())

    // Start editing
    const editBtn = await screen.findByRole('button', { name: /edit|upravit/i })
    fireEvent.click(editBtn)

    // Type into the pickup address field (≥3 chars to trigger debounce)
    const pickupInput = screen.getByRole('textbox', { name: /pickup|nástup/i })
    fireEvent.change(pickupInput, { target: { value: 'Kolín' } })

    // Advance debounce timer (350ms + buffer)
    await act(async () => {
      vi.advanceTimersByTime(400)
      await Promise.resolve()
      await Promise.resolve()
    })

    // Suggestion should appear in the listbox — pick the first match (pickup field)
    const suggestions = await screen.findAllByRole('option', { name: /Kolín nádraží/i })
    const suggestion = suggestions[0]!

    // Select the suggestion via mouseDown (as in OrderForm)
    fireEvent.mouseDown(suggestion)

    // Save
    const saveBtn = screen.getByRole('button', { name: /save|uložit/i })
    fireEvent.click(saveBtn)

    await waitFor(() => expect(mockPatchOrder).toHaveBeenCalled())

    const [, payload] = mockPatchOrder.mock.calls[0]
    // Pickup was changed via suggestion — should include new coords
    expect(payload).toHaveProperty('pickupAddress', 'Kolín nádraží')
    expect(payload).toHaveProperty('pickupLat', 50.027)
    expect(payload).toHaveProperty('pickupLng', 15.2005)
    // Dropoff was NOT changed — must NOT be in the PATCH payload
    expect(payload).not.toHaveProperty('dropoffAddress')
    expect(payload).not.toHaveProperty('dropoffLat')
    expect(payload).not.toHaveProperty('dropoffLng')
    expect(payload).toHaveProperty('version', 1)
  })
})

describe('OrderDrawer — desk kit restyle (WI-5)', () => {
  it('keeps the dialog accessible name as the plain title (aria-label), header shows #code', async () => {
    mockGetOrder.mockResolvedValue(makeOrder())
    render(createElement(OrderDrawer), { wrapper: makeWrapper('/dispatcher/orders/order-abc') })

    const dialog = await screen.findByRole('dialog', { name: i18n.t('orders.drawer.title') })
    expect(dialog).toBeInTheDocument()
    expect(await screen.findByText(/KH-001/)).toBeInTheDocument()
  })

  it('shows a Zákazník Stat card with phone, name and passengers', async () => {
    mockGetOrder.mockResolvedValue(makeOrder({ customerPhone: '+420600111222', customerName: 'Jan Novák', passengers: 3 }))
    render(createElement(OrderDrawer), { wrapper: makeWrapper('/dispatcher/orders/order-abc') })

    await screen.findByText(/KH-001/)
    expect(screen.getByText(i18n.t('orders.drawer.customer'))).toBeInTheDocument()
    expect(screen.getByText('+420600111222')).toBeInTheDocument()
    expect(screen.getByText('Jan Novák')).toBeInTheDocument()
    // passengers value 3 appears in the customer card (rendered as "Cestující: 3")
    expect(screen.getByText(/Cestující:\s*3/)).toBeInTheDocument()
  })

  it('shows a Cena Stat card with the estimated amount formatted as CZK', async () => {
    mockGetOrder.mockResolvedValue(makeOrder({ priceType: 'Estimate', estimatedPriceCzk: 150, fixedPriceCzk: null }))
    render(createElement(OrderDrawer), { wrapper: makeWrapper('/dispatcher/orders/order-abc') })

    await screen.findByText(/KH-001/)
    expect(screen.getByText(i18n.t('orders.drawer.priceCard'))).toBeInTheDocument()
    // 150 Kč (cs-CZ groups thousands with a NBSP; 150 has no separator)
    expect(screen.getByText(/150\s*Kč/)).toBeInTheDocument()
    expect(screen.getByText(i18n.t('orders.drawer.priceEstimated'))).toBeInTheDocument()
  })

  it('shows the fixed price label when priceType is Fixed', async () => {
    mockGetOrder.mockResolvedValue(makeOrder({ priceType: 'Fixed', fixedPriceCzk: 300, estimatedPriceCzk: null }))
    render(createElement(OrderDrawer), { wrapper: makeWrapper('/dispatcher/orders/order-abc') })

    await screen.findByText(/KH-001/)
    expect(screen.getByText(/300\s*Kč/)).toBeInTheDocument()
    expect(screen.getByText(i18n.t('orders.drawer.priceFixed'))).toBeInTheDocument()
  })

  it('renders transition action labels from i18n (assign → Přiřadit)', async () => {
    mockGetOrder.mockResolvedValue(makeOrder({ allowedActions: ['assign'] }))
    render(createElement(OrderDrawer), { wrapper: makeWrapper('/dispatcher/orders/order-abc') })

    await screen.findByText(/KH-001/)
    expect(screen.getByRole('button', { name: i18n.t('orders.actions.assign') })).toBeInTheDocument()
  })

  it('splits history and notifications into tabs with tabpanel roles', async () => {
    mockGetOrder.mockResolvedValue(makeOrder())
    render(createElement(OrderDrawer), { wrapper: makeWrapper('/dispatcher/orders/order-abc') })

    await screen.findByText(/KH-001/)
    const historyTab = screen.getByRole('tab', { name: i18n.t('orders.drawer.tabs.history') })
    const notifTab = screen.getByRole('tab', { name: i18n.t('orders.drawer.tabs.notifications') })
    expect(historyTab).toBeInTheDocument()
    expect(notifTab).toBeInTheDocument()
    // History active by default → a tabpanel is present
    expect(screen.getByRole('tabpanel')).toBeInTheDocument()

    // Switching to Notifikace surfaces the notifications panel
    fireEvent.click(notifTab)
    expect(notifTab).toHaveAttribute('aria-selected', 'true')
  })

  it('shows the scheduled time (Kdy) in read mode without entering edit', async () => {
    mockGetOrder.mockResolvedValue(makeOrder({ scheduledAt: '2026-09-10T14:00:00Z' }))
    render(createElement(OrderDrawer), { wrapper: makeWrapper('/dispatcher/orders/order-abc') })

    await screen.findByText(/KH-001/)
    // 14:00 UTC is 16:00 Europe/Prague (CEST); assert the field label + a formatted time appears
    expect(screen.getByText(i18n.t('orders.drawer.fields.scheduledAt'))).toBeInTheDocument()
    expect(screen.getByText(/16:00/)).toBeInTheDocument()
  })

  it('shows ASAP for an order with no scheduled time in read mode', async () => {
    mockGetOrder.mockResolvedValue(makeOrder({ scheduledAt: null }))
    render(createElement(OrderDrawer), { wrapper: makeWrapper('/dispatcher/orders/order-abc') })

    await screen.findByText(/KH-001/)
    expect(screen.getByText(i18n.t('board.order.asap'))).toBeInTheDocument()
  })

  it('shows the editable-status reason as a caption when the order is not editable', async () => {
    mockGetOrder.mockResolvedValue(makeOrder({ status: 'Completed', allowedActions: [] }))
    render(createElement(OrderDrawer), { wrapper: makeWrapper('/dispatcher/orders/order-abc') })

    await screen.findByText(/KH-001/)
    expect(screen.getByText(i18n.t('orders.drawer.editableStatuses'))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: i18n.t('orders.drawer.edit') })).not.toBeInTheDocument()
  })

  it('renders the conflict callout with role=alert and a reload button on a 409 save', async () => {
    const order = makeOrder({ status: 'New', note: 'Původní' })
    mockGetOrder.mockResolvedValue(order)
    mockPatchOrder.mockRejectedValue(
      new client.ApiResponseError(409, { status: 409, title: 'Conflict', type: 'Order.StaleVersion' }),
    )
    render(createElement(OrderDrawer), { wrapper: makeWrapper('/dispatcher/orders/order-abc') })

    await screen.findByText(/KH-001/)
    fireEvent.click(await screen.findByRole('button', { name: i18n.t('orders.drawer.edit') }))
    fireEvent.change(screen.getByRole('textbox', { name: /note|poznámka/i }), { target: { value: 'Změna' } })
    fireEvent.click(screen.getByRole('button', { name: i18n.t('orders.drawer.save') }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain(i18n.t('orders.drawer.conflict'))
    expect(screen.getByRole('button', { name: i18n.t('orders.drawer.reload') })).toBeInTheDocument()
  })

  it('has no axe violations on the restyled drawer', async () => {
    mockGetOrder.mockResolvedValue(makeOrder())
    const { container } = render(createElement(OrderDrawer), { wrapper: makeWrapper('/dispatcher/orders/order-abc') })
    await screen.findByText(/KH-001/)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('OrderDrawer — cancel form inline', () => {
  it('shows inline cancel form when cancel button clicked (no window.prompt)', async () => {
    const order = makeOrder({ status: 'New', allowedActions: ['cancel'] })
    mockGetOrder.mockResolvedValue(order)

    const promptSpy = vi.spyOn(window, 'prompt')

    render(createElement(OrderDrawer), {
      wrapper: makeWrapper('/dispatcher/orders/order-abc'),
    })

    await screen.findByText(/KH-001/i)

    // Find cancel button and click it
    const cancelBtn = await screen.findByRole('button', { name: /cancel|zrušit/i })
    fireEvent.click(cancelBtn)

    // window.prompt should NOT be called — inline form should appear
    expect(promptSpy).not.toHaveBeenCalled()

    // There should be a reason selector visible
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})
