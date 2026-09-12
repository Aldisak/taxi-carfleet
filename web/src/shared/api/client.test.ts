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
