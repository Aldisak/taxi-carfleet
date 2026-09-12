import { describe, it, expect } from 'vitest'
import { resolveFleetSlug } from './resolveFleetSlug'

describe('resolveFleetSlug', () => {
  it('prefers the subdomain on a real multi-level host', () => {
    expect(resolveFleetSlug('acme.taxi.cz', '', '')).toBe('acme')
  })

  it('prefers the subdomain over a path/query param', () => {
    expect(resolveFleetSlug('acme.taxi.cz', '?fleet=other', '/c')).toBe('acme')
  })

  it('falls back to the ?fleet= query param on localhost', () => {
    expect(resolveFleetSlug('localhost', '?fleet=demo2', '/c')).toBe('demo2')
  })

  it('falls back to a /c/f/:slug path segment on localhost', () => {
    expect(resolveFleetSlug('localhost', '', '/c/f/pragtaxi')).toBe('pragtaxi')
  })

  it("defaults to 'demo' on bare localhost with no hints", () => {
    expect(resolveFleetSlug('localhost', '', '/c')).toBe('demo')
  })

  it("defaults to 'demo' on a 127.0.0.1 host with no hints", () => {
    expect(resolveFleetSlug('127.0.0.1', '', '/c')).toBe('demo')
  })

  it("treats a www. prefix as non-slug and falls back to default", () => {
    expect(resolveFleetSlug('www.taxi.cz', '', '/c')).toBe('demo')
  })

  it('ignores an empty subdomain (bare apex domain)', () => {
    expect(resolveFleetSlug('taxi.cz', '', '/c')).toBe('demo')
  })
})
