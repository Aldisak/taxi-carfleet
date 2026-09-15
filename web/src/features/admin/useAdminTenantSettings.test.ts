import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/api/client')>()
  return {
    ...actual,
    getAdminTenantSettings: vi.fn(),
    putAdminTenantSettings: vi.fn(),
  }
})

import * as client from '../../shared/api/client'
import { useAdminTenantSettings, useUpdateAdminTenantSettings } from './useAdminTenantSettings'

const mockGet = vi.mocked(client.getAdminTenantSettings)
const mockPut = vi.mocked(client.putAdminTenantSettings)

const FLEET_ID = '11111111-1111-1111-1111-111111111111'

function dto(): client.AdminTenantSettingsDto {
  return {
    name: 'Taxi Demo',
    phone: '+420321700100',
    currency: 'CZK',
    timeZone: 'Europe/Prague',
    primaryColorHex: '#1e88e5',
    isActive: true,
    offerTimeoutSeconds: 45,
    autoDispatchEnabled: false,
    autoDispatchAfterSeconds: 0,
    maxOfferRadiusKm: 10,
    smsSenderName: 'TaxiDemo',
    welcomeText: 'Vítejte',
    smsMonthlyCapCzk: 500,
    smsUnitCostCzk: 2,
    mapyBrowserKey: 'browser-key',
    mapyServerKeyConfigured: true,
    mapCenterLat: 50.02,
    mapCenterLng: 15.27,
    mapZoom: 12,
    geoMonthlyCreditBudget: 250000,
  }
}

function makeClientAndWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  return { queryClient, wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useAdminTenantSettings', () => {
  it('queries getAdminTenantSettings with the fleet id and returns the DTO', async () => {
    mockGet.mockResolvedValue(dto())
    const { wrapper } = makeClientAndWrapper()

    const { result } = renderHook(() => useAdminTenantSettings(FLEET_ID), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGet).toHaveBeenCalledWith(FLEET_ID)
    expect(result.current.data?.name).toBe('Taxi Demo')
  })
})

describe('useUpdateAdminTenantSettings', () => {
  it('invalidates EXACTLY the settings key and the fleets list key on success', async () => {
    mockPut.mockResolvedValue(undefined)
    const { queryClient, wrapper } = makeClientAndWrapper()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateAdminTenantSettings(FLEET_ID), { wrapper })

    result.current.mutate({
      name: 'Taxi Demo',
      phone: '+420321700100',
      currency: 'CZK',
      timeZone: 'Europe/Prague',
      primaryColorHex: '#1e88e5',
      isActive: true,
      offerTimeoutSeconds: 45,
      autoDispatchEnabled: false,
      autoDispatchAfterSeconds: 0,
      maxOfferRadiusKm: 10,
      smsSenderName: 'TaxiDemo',
      welcomeText: 'Vítejte',
      smsMonthlyCapCzk: 500,
      smsUnitCostCzk: 2,
      mapyServerKey: null,
      mapyBrowserKey: null,
      mapCenterLat: 50.02,
      mapCenterLng: 15.27,
      mapZoom: 12,
      geoMonthlyCreditBudget: 250000,
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockPut).toHaveBeenCalledWith(FLEET_ID, expect.objectContaining({ mapyServerKey: null }))
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['admin', 'fleets', FLEET_ID, 'settings'],
    })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'fleets'] })
  })
})
