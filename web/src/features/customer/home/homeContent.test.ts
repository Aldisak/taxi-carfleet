import { describe, it, expect } from 'vitest'
import { decideHomeContent } from './homeContent'
import type { CommonRouteDto, MyActiveOrderDto } from '../../../shared/api/client'

const route: CommonRouteDto = { id: 'r1', name: 'Nádraží → Centrum', type: 'PointToPoint', priceCzk: 110 }
const activeOrder: MyActiveOrderDto = { id: 'o1', publicCode: 'K7F2A9', status: 'Assigned' }

describe('decideHomeContent', () => {
  it('shows the active-order banner (replacing routes) when an order is active', () => {
    const result = decideHomeContent({ activeOrder, routes: [route] })
    expect(result.mode).toBe('activeOrder')
    if (result.mode === 'activeOrder') {
      expect(result.activeOrder.publicCode).toBe('K7F2A9')
    }
  })

  it('shows the routes cards when there are valid-now routes and no active order', () => {
    const result = decideHomeContent({ activeOrder: null, routes: [route] })
    expect(result.mode).toBe('routes')
    if (result.mode === 'routes') {
      expect(result.routes).toHaveLength(1)
    }
  })

  it('hides the routes block (empty mode) when no routes are valid-now and no active order', () => {
    const result = decideHomeContent({ activeOrder: null, routes: [] })
    expect(result.mode).toBe('empty')
  })

  it('prefers the active-order banner even when routes are also present', () => {
    const result = decideHomeContent({ activeOrder, routes: [route] })
    expect(result.mode).toBe('activeOrder')
  })

  it('treats a 204 (null active order) as no active order', () => {
    const result = decideHomeContent({ activeOrder: null, routes: [route] })
    expect(result.mode).toBe('routes')
  })
})
