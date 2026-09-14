import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import type { CommonRouteDto } from '../../../shared/api/client'
import { useRouteOrder } from './useRouteOrder'

const route: CommonRouteDto = {
  id: 'r1',
  name: 'Nádraží → Centrum',
  type: 'PointToPoint',
  priceCzk: 110,
}

/**
 * Renders useRouteOrder at /customer/order/route/:routeId with a pre-seeded ['routes','common']
 * query cache and NO nav-state, exercising the cache-fallback branch (a soft refresh where
 * location.state is gone but the Home query cache is still warm).
 */
function renderWithCache(cached: CommonRouteDto[] | undefined) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (cached !== undefined) {
    client.setQueryData(['routes', 'common'], cached)
  }

  function wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client },
      createElement(
        MemoryRouter,
        { initialEntries: ['/customer/order/route/r1'] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: '/customer/order/route/:routeId', element: children as never }),
        ),
      ),
    )
  }

  return renderHook(() => useRouteOrder(), { wrapper })
}

describe('useRouteOrder — cache fallback (laneB4f-r2 envelope regression)', () => {
  // REGRESSION: the ['routes','common'] query now caches a CommonRouteDto[] (getCommonRoutes
  // unwraps the real { routes } envelope), NOT a { items } object. Before the fix this read
  // `cached?.items.find(...)` against an array -> undefined -> the confirm screen could not
  // resolve the tapped route from a warm cache. This guards the array-shaped cache read.
  it('resolves the tapped route from the array-shaped query cache', () => {
    const { result } = renderWithCache([route])
    expect(result.current.route).not.toBeNull()
    expect(result.current.route!.id).toBe('r1')
    expect(result.current.route!.name).toBe('Nádraží → Centrum')
    expect(result.current.routeId).toBe('r1')
  })

  it('returns a null route when the cache is empty', () => {
    const { result } = renderWithCache([])
    expect(result.current.route).toBeNull()
    expect(result.current.routeId).toBe('r1')
  })
})
