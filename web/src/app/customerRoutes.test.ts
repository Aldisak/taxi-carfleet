import { describe, it, expect } from 'vitest'
import { matchRoutes } from 'react-router-dom'
import { router } from './router'

/**
 * Route-ranking guard for the UC-015 dual `/customer` wiring (WI-4). MapOrderPage is mounted as a
 * SIBLING leaf at `/customer` while the CustomerLayout branch (no index route) keeps `t/:code` and
 * `history`. Two routes share the base path `/customer`, so which one wins bare `/customer` is
 * ranking/order-dependent — react-router ranks an exact leaf above a layout branch that has no
 * index, but this is invisible to tsc and to the isolated MapOrderPage test. This test pins the
 * ranking via matchRoutes (no rendering — the lazy leaflet chunks never load).
 */
describe('customer route ranking', () => {
  /** The id of the deepest matched route for a path (the element that actually renders). */
  function leafId(pathname: string): string | undefined {
    const matches = matchRoutes(router.routes, { pathname })
    if (!matches || matches.length === 0) return undefined
    return matches[matches.length - 1].route.id
  }

  it('bare /customer matches a single leaf route (the map order page), not the layout branch', () => {
    const matches = matchRoutes(router.routes, { pathname: '/customer' })
    expect(matches).not.toBeNull()
    // The winning match is a single leaf — the MapOrderPage sibling has no children, so the
    // CustomerLayout-with-empty-Outlet branch must NOT be the one that wins bare /customer.
    expect(matches!.length).toBe(1)
    // Discriminating assertion: length === 1 alone cannot tell MapOrderPage from CustomerLayout
    // (CustomerLayout has no index route, so a bare-/customer match against it would ALSO be a
    // single parent match). The MapOrderPage leaf is childless; CustomerLayout has children. Pin
    // the ranking on that structural difference so a future regression (CustomerLayout winning)
    // fails here.
    const winner = matches![matches!.length - 1].route
    expect(winner.children).toBeUndefined()
  })

  it('/customer/history still resolves under the CustomerLayout branch (nested match)', () => {
    const matches = matchRoutes(router.routes, { pathname: '/customer/history' })
    expect(matches).not.toBeNull()
    // CustomerLayout parent + history child → two matches.
    expect(matches!.length).toBe(2)
  })

  it('/customer/t/:code still resolves under the CustomerLayout branch (nested match)', () => {
    const matches = matchRoutes(router.routes, { pathname: '/customer/t/ABC123' })
    expect(matches).not.toBeNull()
    expect(matches!.length).toBe(2)
    expect(matches![matches!.length - 1].params.code).toBe('ABC123')
  })

  it('the old /customer/order/new and /customer/order/route routes are gone', () => {
    expect(leafId('/customer/order/new')).toBeUndefined()
    expect(leafId('/customer/order/route/r1')).toBeUndefined()
  })
})
