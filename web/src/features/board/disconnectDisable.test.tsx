/**
 * Tests for disconnect-disable behavior.
 * When connectionState is 'disconnected' or 'reconnecting' (NOT 'connecting'),
 * server-mutating actions must be disabled in:
 *  - OrderForm: submit button + Enter-key path
 *  - OrderCard: Assign / Cancel buttons (Reassign analogous to Assign)
 *  - DriverRow: override button
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'styled-components'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import { theme } from '../../shared/theme/theme'
import i18n from '../../shared/i18n'
import { OrderForm } from './OrderForm'
import { OrderCard } from './OrderCard'
import { DriverRow } from './DriverRow'
import type { OrderSummaryDto } from '../../shared/api/client'
import type { DriverSummaryDto } from '../../shared/api/client'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock the realtime module so we can control connection state
vi.mock('../../shared/realtime/useFleetHub', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/realtime/useFleetHub')>()
  return {
    ...actual,
    useHubConnectionState: vi.fn(() => 'connected'),
  }
})

// Mock the api client for all components
vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return {
    ...actual,
    getGeoSuggest: vi.fn().mockResolvedValue({ items: [] }),
    getGeoRoute: vi.fn().mockResolvedValue({ distanceMeters: 0, durationSeconds: 0, estimatedPriceCzk: null }),
    postCreateOrder: vi.fn().mockResolvedValue({ id: 'new-order-id' }),
    getDrivers: vi.fn().mockResolvedValue({ items: [] }),
    getOrder: vi.fn().mockResolvedValue({
      id: 'order-1', publicCode: 'ABC123', status: 'New', source: 'Phone',
      customerPhone: '+420777123456', customerName: null,
      pickupAddress: 'A', pickupLat: 50.0, pickupLng: 15.0,
      dropoffAddress: null, dropoffLat: null, dropoffLng: null,
      scheduledAt: null, note: null, passengers: 1,
      priceType: 'Meter', estimatedPriceCzk: null, fixedPriceCzk: null,
      finalPriceCzk: null, paymentType: null, driverId: null, vehicleId: null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      allowedActions: [], version: 1,
    }),
    postAssignOrder: vi.fn().mockResolvedValue({}),
    postReassignOrder: vi.fn().mockResolvedValue({}),
    postCancelOrder: vi.fn().mockResolvedValue({}),
    postOverrideDriverStatus: vi.fn().mockResolvedValue(undefined),
  }
})

import * as fleetHub from '../../shared/realtime/useFleetHub'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, null,
      createElement(QueryClientProvider, { client: qc },
        createElement(ThemeProvider, { theme },
          createElement(I18nextProvider, { i18n }, children))))
}

function makeOrder(overrides?: Partial<OrderSummaryDto>): OrderSummaryDto {
  return {
    id: 'order-1', publicCode: 'ABC123', status: 'New', source: 'Phone',
    customerPhone: '+420777123456', customerName: 'Test', pickupAddress: 'A',
    dropoffAddress: null, scheduledAt: null, passengers: 1,
    priceType: 'Meter', estimatedPriceCzk: null, fixedPriceCzk: null,
    driverId: null, createdAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeDriver(overrides?: Partial<DriverSummaryDto>): DriverSummaryDto {
  return {
    driverId: 'driver-1', displayName: 'Jan Novák', status: 'Free',
    currentVehiclePlate: '1AB 2345', lastPositionAt: null,
    lastLat: null, lastLng: null, ...overrides,
  }
}

// ---------------------------------------------------------------------------
// OrderForm — submit disabled when disconnected / reconnecting
// ---------------------------------------------------------------------------

describe('OrderForm — submit disabled when server is blocked', () => {
  beforeEach(() => {
    vi.mocked(fleetHub.useHubConnectionState).mockReturnValue('connected')
  })

  it('submit button is enabled when connected', () => {
    render(createElement(OrderForm, {}), { wrapper: makeWrapper() })
    expect(screen.getByRole('button', { name: /vytvořit objednávku/i })).not.toBeDisabled()
  })

  it('submit button is enabled when connecting (initial boot)', () => {
    vi.mocked(fleetHub.useHubConnectionState).mockReturnValue('connecting')
    render(createElement(OrderForm, {}), { wrapper: makeWrapper() })
    expect(screen.getByRole('button', { name: /vytvořit objednávku/i })).not.toBeDisabled()
  })

  it('submit button is disabled when disconnected', () => {
    vi.mocked(fleetHub.useHubConnectionState).mockReturnValue('disconnected')
    render(createElement(OrderForm, {}), { wrapper: makeWrapper() })
    expect(screen.getByRole('button', { name: /vytvořit objednávku/i })).toBeDisabled()
  })

  it('submit button is disabled when reconnecting', () => {
    vi.mocked(fleetHub.useHubConnectionState).mockReturnValue('reconnecting')
    render(createElement(OrderForm, {}), { wrapper: makeWrapper() })
    expect(screen.getByRole('button', { name: /vytvořit objednávku/i })).toBeDisabled()
  })

  it('Enter key does not submit when disconnected', async () => {
    const { postCreateOrder } = await import('../../shared/api/client')
    vi.mocked(fleetHub.useHubConnectionState).mockReturnValue('disconnected')
    render(createElement(OrderForm, {}), { wrapper: makeWrapper() })

    const phoneField = screen.getByRole('textbox', { name: /telefon/i })
    fireEvent.keyDown(phoneField, { key: 'Enter', code: 'Enter' })

    // postCreateOrder should never have been called
    expect(postCreateOrder).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// OrderCard — action buttons disabled when disconnected / reconnecting
// ---------------------------------------------------------------------------

describe('OrderCard — action buttons disabled when server is blocked', () => {
  beforeEach(() => {
    vi.mocked(fleetHub.useHubConnectionState).mockReturnValue('connected')
  })

  it('Assign button is enabled when connected', () => {
    render(createElement(OrderCard, { order: makeOrder({ status: 'New' }) }), { wrapper: makeWrapper() })
    expect(screen.getByLabelText('Přiřadit')).not.toBeDisabled()
  })

  it('Assign button is disabled when disconnected', () => {
    vi.mocked(fleetHub.useHubConnectionState).mockReturnValue('disconnected')
    render(createElement(OrderCard, { order: makeOrder({ status: 'New' }) }), { wrapper: makeWrapper() })
    expect(screen.getByLabelText('Přiřadit')).toBeDisabled()
  })

  it('Assign button is disabled when reconnecting', () => {
    vi.mocked(fleetHub.useHubConnectionState).mockReturnValue('reconnecting')
    render(createElement(OrderCard, { order: makeOrder({ status: 'New' }) }), { wrapper: makeWrapper() })
    expect(screen.getByLabelText('Přiřadit')).toBeDisabled()
  })

  it('Cancel button is enabled when connected', () => {
    render(createElement(OrderCard, { order: makeOrder({ status: 'New' }) }), { wrapper: makeWrapper() })
    expect(screen.getByLabelText('Zrušit')).not.toBeDisabled()
  })

  it('Cancel button is disabled when disconnected', () => {
    vi.mocked(fleetHub.useHubConnectionState).mockReturnValue('disconnected')
    render(createElement(OrderCard, { order: makeOrder({ status: 'New' }) }), { wrapper: makeWrapper() })
    expect(screen.getByLabelText('Zrušit')).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// DriverRow — override button disabled when disconnected / reconnecting
// ---------------------------------------------------------------------------

describe('DriverRow — override button disabled when server is blocked', () => {
  beforeEach(() => {
    vi.mocked(fleetHub.useHubConnectionState).mockReturnValue('connected')
  })

  it('override button is enabled when connected', () => {
    render(createElement(DriverRow, { driver: makeDriver() }), { wrapper: makeWrapper() })
    expect(screen.getByLabelText('Nastavit stav')).not.toBeDisabled()
  })

  it('override button is disabled when disconnected', () => {
    vi.mocked(fleetHub.useHubConnectionState).mockReturnValue('disconnected')
    render(createElement(DriverRow, { driver: makeDriver() }), { wrapper: makeWrapper() })
    expect(screen.getByLabelText('Nastavit stav')).toBeDisabled()
  })

  it('override button is disabled when reconnecting', () => {
    vi.mocked(fleetHub.useHubConnectionState).mockReturnValue('reconnecting')
    render(createElement(DriverRow, { driver: makeDriver() }), { wrapper: makeWrapper() })
    expect(screen.getByLabelText('Nastavit stav')).toBeDisabled()
  })

  it('override button is enabled when connecting (initial boot)', () => {
    vi.mocked(fleetHub.useHubConnectionState).mockReturnValue('connecting')
    render(createElement(DriverRow, { driver: makeDriver() }), { wrapper: makeWrapper() })
    expect(screen.getByLabelText('Nastavit stav')).not.toBeDisabled()
  })
})
