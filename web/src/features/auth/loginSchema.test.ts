import { describe, it, expect } from 'vitest'
import { validateLoginForm, parseSubdomainSlug } from './loginSchema'

describe('validateLoginForm', () => {
  it('returns i18n key for empty email', () => {
    const result = validateLoginForm({ fleetSlug: 'demo', email: '', password: 'secret' })
    expect(result.email).toBe('login.validation.emailRequired')
  })

  it('returns i18n key for invalid email (missing @)', () => {
    const result = validateLoginForm({ fleetSlug: 'demo', email: 'notanemail', password: 'secret' })
    expect(result.email).toBe('login.validation.emailInvalid')
  })

  it('returns i18n key for empty password', () => {
    const result = validateLoginForm({ fleetSlug: 'demo', email: 'user@demo.local', password: '' })
    expect(result.password).toBe('login.validation.passwordRequired')
  })

  it('returns i18n key for empty fleet slug', () => {
    const result = validateLoginForm({ fleetSlug: '', email: 'user@demo.local', password: 'secret' })
    expect(result.fleetSlug).toBe('login.validation.fleetSlugRequired')
  })

  it('returns no errors for valid input', () => {
    const result = validateLoginForm({ fleetSlug: 'demo', email: 'user@demo.local', password: 'secret' })
    expect(result.email).toBeUndefined()
    expect(result.password).toBeUndefined()
    expect(result.fleetSlug).toBeUndefined()
  })
})

describe('parseSubdomainSlug', () => {
  it('extracts slug from non-localhost subdomain', () => {
    expect(parseSubdomainSlug('kolintaxi.app.cz')).toBe('kolintaxi')
    expect(parseSubdomainSlug('demo.taxifleet.cz')).toBe('demo')
  })

  it('returns null for localhost', () => {
    expect(parseSubdomainSlug('localhost')).toBeNull()
    expect(parseSubdomainSlug('localhost:5173')).toBeNull()
  })

  it('returns null for IP addresses', () => {
    expect(parseSubdomainSlug('127.0.0.1')).toBeNull()
    expect(parseSubdomainSlug('192.168.1.1')).toBeNull()
  })

  it('returns null when there is no subdomain (apex domain)', () => {
    expect(parseSubdomainSlug('app.cz')).toBeNull()
    expect(parseSubdomainSlug('taxifleet.cz')).toBeNull()
  })

  it('handles host with port', () => {
    expect(parseSubdomainSlug('kolintaxi.app.cz:3000')).toBe('kolintaxi')
  })
})
