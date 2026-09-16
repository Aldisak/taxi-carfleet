import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getGeoReverse } from './client'

/** Captures the URL passed to fetch and returns a canned reverse-geocode response. */
function stubFetch(body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function lastUrl(fetchMock: ReturnType<typeof vi.fn>): string {
  const full = String(fetchMock.mock.calls[0][0])
  // Strip the BASE_URL prefix so the assertion is on the path + query only.
  return full.replace(/^.*\/api\/v1/, '')
}

describe('getGeoReverse', () => {
  const okBody = {
    found: true,
    label: 'Nádražní 1, Kutná Hora',
    street: 'Nádražní 1',
    municipality: 'Kutná Hora',
  }

  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('issues GET /geo/reverse with lat & lng query params', async () => {
    const fetchMock = stubFetch(okBody)
    await getGeoReverse(50.0755, 14.4378)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(lastUrl(fetchMock)).toBe('/geo/reverse?lat=50.0755&lng=14.4378')
  })

  it('rounds coordinates to 4 decimals before building the query (matches backend Math.Round(..,4))', async () => {
    const fetchMock = stubFetch(okBody)
    await getGeoReverse(50.07553219, 14.43781995)
    expect(lastUrl(fetchMock)).toBe('/geo/reverse?lat=50.0755&lng=14.4378')
  })

  it('emits dot-decimal coords regardless of locale (no comma separator)', async () => {
    const fetchMock = stubFetch(okBody)
    await getGeoReverse(-33.8, 151.2)
    expect(lastUrl(fetchMock)).toBe('/geo/reverse?lat=-33.8&lng=151.2')
  })

  it('maps the response to { found, label, street, municipality }', async () => {
    stubFetch(okBody)
    const res = await getGeoReverse(50.0755, 14.4378)
    expect(res).toEqual(okBody)
  })
})
