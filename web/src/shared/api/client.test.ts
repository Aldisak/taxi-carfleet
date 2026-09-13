import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We import authStorage and apiRequest directly; they use localStorage and fetch.
// Since vitest uses jsdom, localStorage is available.

describe('apiRequest — 401 handling', () => {
  const originalLocation = window.location

  beforeEach(() => {
    // Stub window.location.href assignment
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: 'http://localhost/' },
    })

    // Clear storage
    localStorage.clear()
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    })
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('clears auth storage and redirects to /x/login on 401', async () => {
    // Seed some values in localStorage
    localStorage.setItem('auth.accessToken', 'some-token')
    localStorage.setItem('auth.refreshToken', 'some-refresh')
    localStorage.setItem('auth.fleetSlug', 'test-fleet')

    // Mock fetch to return 401
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      statusText: 'Unauthorized',
    }))

    const { apiRequest } = await import('./client')

    // Fire and forget — the function returns a never-resolved promise on 401
    // We don't await it; we just need to trigger the redirect logic
    const requestPromise = apiRequest('/some-protected-endpoint')

    // Wait a tick for the microtask to flush
    await new Promise(resolve => setTimeout(resolve, 0))

    // Assert redirect happened
    expect(window.location.href).toBe('/x/login')

    // Assert storage was cleared
    expect(localStorage.getItem('auth.accessToken')).toBeNull()
    expect(localStorage.getItem('auth.refreshToken')).toBeNull()
    expect(localStorage.getItem('auth.fleetSlug')).toBeNull()

    // The promise never resolves; this is expected behavior
    void requestPromise
  })

  it('does NOT redirect when skipAuthRedirect is true (login endpoint)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      statusText: 'Unauthorized',
      json: vi.fn().mockResolvedValue({
        status: 401,
        title: 'Unauthorized',
        type: 'https://httpstatuses.com/401',
      }),
    }))

    const { apiRequest, ApiResponseError } = await import('./client')

    let thrown: unknown
    try {
      await apiRequest('/auth/staff/login', { skipAuthRedirect: true })
    } catch (err) {
      thrown = err
    }

    // Should throw ApiResponseError, NOT redirect
    expect(thrown).toBeInstanceOf(ApiResponseError)
    expect(window.location.href).not.toBe('/x/login')
  })
})

describe('getCommonRoutes — envelope unwrap (laneB4f AC#1 regression)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  // REGRESSION: the real A-common-routes backend returns a NAMED `{ routes: [...] }`
  // envelope (ListCommonRoutesResponse), NOT the `{ items }` list convention. The client
  // previously typed `{ items }` and read `.items`, yielding `[]` on the real payload ->
  // a logged-out Home with zero route cards -> AC#1 (three-tap common route) impossible.
  // This tests the client mapping against the REAL shape (mocked fetch), so a future
  // regression to `.items` fails here rather than only in e2e.
  it('unwraps a { routes: [...] } payload to the route array', async () => {
    const realPayload = {
      routes: [
        { id: 'r1', name: 'Nádraží → Centrum', type: 'PointToPoint', priceCzk: 110 },
        { id: 'r2', name: 'Letiště → Centrum', type: 'PointToPoint', priceCzk: 450 },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue(realPayload),
    }))

    const { getCommonRoutes } = await import('./client')
    const routes = await getCommonRoutes()

    expect(Array.isArray(routes)).toBe(true)
    expect(routes).toHaveLength(2)
    expect(routes[0]!.id).toBe('r1')
    expect(routes[0]!.name).toBe('Nádraží → Centrum')
    expect(routes[1]!.priceCzk).toBe(450)
  })

  it('returns an empty array when the backend sends { routes: [] }', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue({ routes: [] }),
    }))

    const { getCommonRoutes } = await import('./client')
    const routes = await getCommonRoutes()

    expect(routes).toEqual([])
  })
})

describe('getPriceQuote — POST body + union parse (UC-006 A6 contract, O-02 regression)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  // REGRESSION: A6 switched pricing/quote from GET (string query params fromLat/toLat) to
  // POST with a JSON body { pickupLat, pickupLng, dropoffLat?, dropoffLng?, at? }. The field
  // names are byte-identical to the backend QuoteRequest (O-02). A drift here (e.g. sending
  // fromLat again) silently sends the backend nulls -> a wrong quote. This asserts the exact
  // POST body against a mocked fetch, the same regression style that caught the {routes} bug.
  it('POSTs pickupLat/pickupLng (+ optional dropoff/at) as a JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue({ type: 'Fixed', priceCzk: 110, routeId: 'r1', routeName: 'KH' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getPriceQuote } = await import('./client')
    await getPriceQuote({ pickupLat: 49.948, pickupLng: 15.268, dropoffLat: 50.027, dropoffLng: 15.199, at: '2026-09-12T03:30:00Z' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/pricing/quote')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string)
    expect(body).toEqual({
      pickupLat: 49.948,
      pickupLng: 15.268,
      dropoffLat: 50.027,
      dropoffLng: 15.199,
      at: '2026-09-12T03:30:00Z',
    })
  })

  it('omits dropoff + at from the body when not supplied (pickup-only Zone/Meter quote)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue({ type: 'Meter', baseCzk: 40, perKmCzk: 30, minimumCzk: 60 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getPriceQuote } = await import('./client')
    await getPriceQuote({ pickupLat: 49.948, pickupLng: 15.268 })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body).toEqual({ pickupLat: 49.948, pickupLng: 15.268 })
    expect('dropoffLat' in body).toBe(false)
    expect('at' in body).toBe(false)
  })

  it('parses each arm of the discriminated union (Fixed / Estimate / Meter)', async () => {
    const { getPriceQuote } = await import('./client')

    for (const payload of [
      { type: 'Fixed', priceCzk: 100, routeId: 'r1', routeName: 'Nádraží → Centrum' },
      { type: 'Estimate', lowCzk: 180, highCzk: 220, distanceKm: 12.4, durationMin: 18 },
      { type: 'Meter', baseCzk: 40, perKmCzk: 30, minimumCzk: 60 },
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: vi.fn().mockResolvedValue(payload),
      }))
      const res = await getPriceQuote({ pickupLat: 49.948, pickupLng: 15.268 })
      expect(res.type).toBe(payload.type)
    }
  })
})

// The {routes}/{items} envelope-bug class (CLAUDE.md): the admin CRUD reads were assumed to
// follow the {items} list convention, but the REAL backend returns NAMED envelopes —
// ListZonesResponse(Zones) → {zones}, ListRoutesResponse(Routes) → {routes},
// ListPlacesResponse(Places) → {places}. These mock FETCH (not the client) returning the
// real shapes, so a regression to `.items` fails here rather than silently yielding an empty
// Settings list at integration. Confirmed byte-for-byte against the C# response records.
describe('admin CRUD envelope unwrap (getZones / getRoutes / getPlaces)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('getZones unwraps a { zones: [...] } payload (NOT { items })', async () => {
    const realPayload = {
      zones: [
        { id: 'z1', name: 'Centrum KH', shape: 'Circle', centerLat: 49.948, centerLng: 15.268, radiusMeters: 800, polygon: null, isEnabled: true },
        { id: 'z2', name: 'Pěší zóna', shape: 'Polygon', centerLat: 0, centerLng: 0, radiusMeters: null, polygon: [[49.95, 15.26], [49.96, 15.27], [49.94, 15.28]], isEnabled: false },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue(realPayload),
    }))

    const { getZones } = await import('./client')
    const zones = await getZones()

    expect(zones).toHaveLength(2)
    expect(zones[0]!.id).toBe('z1')
    expect(zones[1]!.shape).toBe('Polygon')
  })

  it('getRoutes unwraps a { routes: [...] } payload (ListRoutesResponse)', async () => {
    const realPayload = {
      routes: [
        {
          id: 'r1', name: 'KH → Kolín', type: 'ZoneToZone', priceCzk: 300,
          fromZoneId: 'zA', toZoneId: 'zB', fromLat: 49.9, fromLng: 15.2, toLat: null, toLng: null,
          fromRadiusMeters: 150, toRadiusMeters: 150, isBidirectional: true,
          validDays: 127, validFromTime: null, validToTime: null, priority: 10, isEnabled: true,
        },
        {
          id: 'r2', name: 'Noční', type: 'Zone', priceCzk: 200,
          fromZoneId: 'zA', toZoneId: null, fromLat: 49.9, fromLng: 15.2, toLat: null, toLng: null,
          fromRadiusMeters: 150, toRadiusMeters: 150, isBidirectional: true,
          validDays: 127, validFromTime: '03:00:00', validToTime: '04:00:00', priority: 5, isEnabled: false,
        },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue(realPayload),
    }))

    const { getRoutes } = await import('./client')
    const routes = await getRoutes()

    expect(routes).toHaveLength(2)
    expect(routes[0]!.id).toBe('r1')
    expect(routes[0]!.isBidirectional).toBe(true)
    expect(routes[1]!.validFromTime).toBe('03:00:00')
  })

  it('getPlaces unwraps a { places: [...] } payload (ListPlacesResponse)', async () => {
    const realPayload = {
      places: [
        { id: 'p1', name: 'Nádraží KH', lat: 49.95, lng: 15.27, address: 'Nádražní 1', sortOrder: 0, isEnabled: true },
        { id: 'p2', name: 'Nemocnice', lat: 49.96, lng: 15.28, address: 'Kutnohorská 5', sortOrder: 1, isEnabled: true },
      ],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue(realPayload),
    }))

    const { getPlaces } = await import('./client')
    const places = await getPlaces()

    expect(places).toHaveLength(2)
    expect(places[0]!.id).toBe('p1')
    expect(places[1]!.sortOrder).toBe(1)
  })
})

describe('getOrders — hasFailedSms list flag (UC-005 §5, laneA5b contract, laneB5b)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  // CONTRACT: laneA5b added an additive `hasFailedSms: boolean` to each OrderSummaryDto in the
  // { items, total, page, pageSize } ListOrdersResponse. The dispatcher board card reads it to
  // show the at-a-glance failed-SMS red icon WITHOUT a per-order detail fetch. This locks the
  // field through the typed client so a drift (dropping it) is caught here, not only in the UI.
  it('carries hasFailedSms on each item in the { items } envelope', async () => {
    const realPayload = {
      items: [
        { id: 'o1', publicCode: 'AAA111', status: 'New', source: 'Phone', customerPhone: '+420777000111', customerName: null, pickupAddress: 'A', dropoffAddress: null, scheduledAt: null, passengers: 1, priceType: 'Meter', estimatedPriceCzk: null, fixedPriceCzk: null, driverId: null, createdAt: '2026-09-13T09:00:00Z', hasFailedSms: true },
        { id: 'o2', publicCode: 'BBB222', status: 'New', source: 'Phone', customerPhone: '+420777000222', customerName: null, pickupAddress: 'B', dropoffAddress: null, scheduledAt: null, passengers: 1, priceType: 'Meter', estimatedPriceCzk: null, fixedPriceCzk: null, driverId: null, createdAt: '2026-09-13T09:01:00Z', hasFailedSms: false },
      ],
      total: 2,
      page: 1,
      pageSize: 20,
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue(realPayload),
    }))

    const { getOrders } = await import('./client')
    const res = await getOrders()

    expect(res.items).toHaveLength(2)
    expect(res.items[0]!.hasFailedSms).toBe(true)
    expect(res.items[1]!.hasFailedSms).toBe(false)
  })
})

describe('reports + audit client (UC-007 B1/B2 — REAL laneA7 contracts)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  // REAL: GetDriverReportResponse = { driverId, driverName, avgRating, days, totals }. avgRating is
  // TOP-LEVEL; `totals` is a DriverReportDayDto with `date: 'Celkem'` (same money fields, NO avgRating).
  // Per-day money fields are cashCzk/cardCzk/invoiceCzk (NOT *TotalCzk), day field is `date` (NOT `day`).
  it('getDriverReport returns { driverId, driverName, avgRating, days, totals } with real field names', async () => {
    const realPayload = {
      driverId: 'd1',
      driverName: 'Jan Novák',
      avgRating: 4.5,
      days: [
        { date: '2026-09-01', ridesCompleted: 3, ridesCancelled: 1, cashCzk: 300, cardCzk: 200, invoiceCzk: 0, totalCzk: 500, hoursOnline: 6, priceOverrideCount: 1 },
      ],
      totals: { date: 'Celkem', ridesCompleted: 3, ridesCancelled: 1, cashCzk: 300, cardCzk: 200, invoiceCzk: 0, totalCzk: 500, hoursOnline: 6, priceOverrideCount: 1 },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue(realPayload),
    }))

    const { getDriverReport } = await import('./client')
    const res = await getDriverReport({ driverId: 'd1', from: '2026-09-01', to: '2026-09-30' })

    expect(res.driverName).toBe('Jan Novák')
    expect(res.avgRating).toBe(4.5)
    expect(res.days).toHaveLength(1)
    expect(res.days[0]!.date).toBe('2026-09-01')
    expect(res.days[0]!.cashCzk).toBe(300)
    expect(res.days[0]!.totalCzk).toBe(500)
    expect(res.totals.date).toBe('Celkem')
    expect(res.totals.totalCzk).toBe(500)
  })

  // REAL: FleetKpiDto carries RAW COUNTS appOrders/phoneOrders/fixedRouteOrders (NOT shares), and
  // avgTime* are nullable seconds. ridesPerDay rows are { date, count } (NOT { day, rides }).
  it('getFleetReport returns { kpis, ridesPerDay, topRoutes } with raw counts + { date, count } series', async () => {
    const realPayload = {
      kpis: { rides: 10, revenueCzk: 5000, avgPriceCzk: 500, avgTimeToAssignSeconds: 120, avgTimeToPickupSeconds: null, cancellationRate: 0.1, appOrders: 6, phoneOrders: 4, fixedRouteOrders: 3, smsCount: 4, smsCostCzk: 4 },
      ridesPerDay: [{ date: '2026-09-01', count: 4 }, { date: '2026-09-02', count: 6 }],
      topRoutes: [{ routeId: 'r1', name: 'KH → Kolín', count: 7 }],
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue(realPayload),
    }))

    const { getFleetReport } = await import('./client')
    const res = await getFleetReport({ from: '2026-09-01', to: '2026-09-30' })

    expect(res.kpis.rides).toBe(10)
    expect(res.kpis.appOrders).toBe(6)
    expect(res.kpis.phoneOrders).toBe(4)
    expect(res.kpis.fixedRouteOrders).toBe(3)
    expect(res.kpis.avgTimeToPickupSeconds).toBeNull()
    expect(res.ridesPerDay).toHaveLength(2)
    expect(res.ridesPerDay[0]!.date).toBe('2026-09-01')
    expect(res.ridesPerDay[0]!.count).toBe(4)
    expect(res.topRoutes[0]!.name).toBe('KH → Kolín')
  })

  // REAL: GetRatingsResponse is the { items } envelope (NOT { ratings }); rangeless (no from/to).
  // RatingDto = { orderPublicCode, driverName(null-able), stars, comment, ratedAt }.
  it('getRatings unwraps the { items: [...] } envelope (NOT { ratings }) and is rangeless', async () => {
    const realPayload = {
      items: [
        { orderPublicCode: 'AAA111', driverName: 'Jan Novák', stars: 5, comment: 'Super', ratedAt: '2026-09-13T10:00:00Z' },
        { orderPublicCode: 'BBB222', driverName: null, stars: 3, comment: null, ratedAt: null },
      ],
    }
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue(realPayload),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getRatings } = await import('./client')
    const ratings = await getRatings()

    expect(ratings).toHaveLength(2)
    expect(ratings[0]!.orderPublicCode).toBe('AAA111')
    expect(ratings[0]!.stars).toBe(5)
    expect(ratings[1]!.driverName).toBeNull()
    expect(ratings[1]!.comment).toBeNull()
    // Rangeless: the URL carries no from/to query params.
    const calledUrl = fetchMock.mock.calls[0]![0] as string
    expect(calledUrl).toBe('/api/v1/reports/ratings')
  })

  it('fetchDriverReportCsv returns the server blob + Content-Disposition filename', async () => {
    const blob = new Blob(['﻿a;b;c\r\n'], { type: 'text/csv' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      blob: vi.fn().mockResolvedValue(blob),
      headers: new Headers({ 'Content-Disposition': 'attachment; filename="report-2026-09.csv"' }),
    }))

    const { fetchDriverReportCsv } = await import('./client')
    const res = await fetchDriverReportCsv({ driverId: 'd1', from: '2026-09-01', to: '2026-09-30' })

    expect(res.blob).toBe(blob)
    expect(res.filename).toBe('report-2026-09.csv')
  })

  it('parseContentDispositionFilename handles RFC 5987 and missing headers', async () => {
    const { parseContentDispositionFilename } = await import('./client')
    expect(parseContentDispositionFilename("attachment; filename*=UTF-8''report%20KH.csv")).toBe('report KH.csv')
    expect(parseContentDispositionFilename('attachment; filename="x.csv"')).toBe('x.csv')
    expect(parseContentDispositionFilename(null)).toBeNull()
  })

  // REAL: GetAuditResponse = { items, total, page(1-based), pageSize }. AuditEntryDto fields are
  // { source, actorUserId, entity, action, orderCode, at } — NO `actor`/`event` (B7a assumptions).
  it('getAudit returns the { items, total, page, pageSize } envelope and builds filter params', async () => {
    const realPayload = {
      items: [
        { source: 'OrderEvent', actorUserId: 'u1', entity: 'Order', action: 'Completed', orderCode: 'AAA111', at: '2026-09-13T10:00:00Z' },
      ],
      total: 1,
      page: 2,
      pageSize: 50,
    }
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue(realPayload),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { getAudit } = await import('./client')
    const res = await getAudit({ actor: 'u1', orderCode: 'AAA111', page: 2 })

    expect(res.items[0]!.action).toBe('Completed')
    expect(res.items[0]!.actorUserId).toBe('u1')
    expect(res.total).toBe(1)
    expect(res.page).toBe(2)
    expect(res.pageSize).toBe(50)
    const calledUrl = fetchMock.mock.calls[0]![0] as string
    expect(calledUrl).toContain('actor=u1')
    expect(calledUrl).toContain('orderCode=AAA111')
    expect(calledUrl).toContain('page=2')
  })
})
