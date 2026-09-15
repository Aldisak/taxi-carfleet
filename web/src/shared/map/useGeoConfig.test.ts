import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return {
    ...actual,
    getGeoConfig: vi.fn(),
  }
})

import { useGeoConfig } from './useGeoConfig'
import * as client from '../api/client'

const CONFIG: client.GeoConfigResponse = {
  tileUrlTemplate: 'https://api.mapy.cz/v1/maptiles/basic/256/{z}/{x}/{y}?apikey={apikey}',
  browserKey: 'browser-key-123',
  attributionHtml: '<a href="https://api.mapy.cz/copyright">Mapy.cz</a>',
  mapCenterLat: 50.03,
  mapCenterLng: 15.2,
  mapZoom: 11,
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('useGeoConfig', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches the geo config via the client', async () => {
    vi.mocked(client.getGeoConfig).mockResolvedValueOnce(CONFIG)

    const { result } = renderHook(() => useGeoConfig(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.data).toEqual(CONFIG))
    expect(client.getGeoConfig).toHaveBeenCalledTimes(1)
  })

  it('caches under the ["geo","config"] key so it does not refetch per map', async () => {
    vi.mocked(client.getGeoConfig).mockResolvedValue(CONFIG)
    const wrapper = makeWrapper()

    const first = renderHook(() => useGeoConfig(), { wrapper })
    await waitFor(() => expect(first.result.current.data).toEqual(CONFIG))

    // A second consumer within the same client reuses the cached value (no second fetch).
    const second = renderHook(() => useGeoConfig(), { wrapper })
    await waitFor(() => expect(second.result.current.data).toEqual(CONFIG))

    expect(client.getGeoConfig).toHaveBeenCalledTimes(1)
  })
})
