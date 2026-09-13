import { describe, it, expect } from 'vitest'
import {
  validateCreateFleetForm,
  toCreateFleetRequest,
  isValidSlug,
  type CreateFleetFormValues,
} from './createFleetForm'

function values(overrides?: Partial<CreateFleetFormValues>): CreateFleetFormValues {
  return {
    slug: 'kolin-taxi',
    name: 'Taxi Kolín',
    phone: '+420321123456',
    adminEmail: 'admin@kolin.local',
    ...overrides,
  }
}

describe('isValidSlug', () => {
  it('accepts lowercase alphanumeric + internal hyphens', () => {
    expect(isValidSlug('demo')).toBe(true)
    expect(isValidSlug('kolin-taxi')).toBe(true)
    expect(isValidSlug('fleet2')).toBe(true)
  })

  it('rejects uppercase, spaces, leading/trailing hyphens, and symbols', () => {
    expect(isValidSlug('Kolin')).toBe(false)
    expect(isValidSlug('kolin taxi')).toBe(false)
    expect(isValidSlug('-kolin')).toBe(false)
    expect(isValidSlug('kolin-')).toBe(false)
    expect(isValidSlug('kolin_taxi')).toBe(false)
    expect(isValidSlug('')).toBe(false)
  })
})

describe('validateCreateFleetForm', () => {
  it('passes a well-formed form', () => {
    expect(validateCreateFleetForm(values())).toEqual({})
  })

  it('flags an empty slug vs an invalid slug distinctly', () => {
    expect(validateCreateFleetForm(values({ slug: '' })).slug).toBe('admin.fleets.validation.slugRequired')
    expect(validateCreateFleetForm(values({ slug: 'NOPE' })).slug).toBe('admin.fleets.validation.slugInvalid')
  })

  it('requires name and phone', () => {
    const errs = validateCreateFleetForm(values({ name: ' ', phone: '' }))
    expect(errs.name).toBeDefined()
    expect(errs.phone).toBeDefined()
  })

  it('validates the admin email', () => {
    expect(validateCreateFleetForm(values({ adminEmail: '' })).adminEmail).toBe('admin.fleets.validation.emailRequired')
    expect(validateCreateFleetForm(values({ adminEmail: 'nope' })).adminEmail).toBe('admin.fleets.validation.emailInvalid')
  })
})

describe('toCreateFleetRequest', () => {
  it('trims and lowercases the slug', () => {
    expect(toCreateFleetRequest(values({ slug: '  Kolin-Taxi  ' }))).toEqual({
      slug: 'kolin-taxi',
      name: 'Taxi Kolín',
      phone: '+420321123456',
      adminEmail: 'admin@kolin.local',
    })
  })
})
