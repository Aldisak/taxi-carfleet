import { describe, it, expect } from 'vitest'
import { canAccessAdmin } from './adminRoleGating'

describe('canAccessAdmin', () => {
  it('allows only SuperAdmin', () => {
    expect(canAccessAdmin('SuperAdmin')).toBe(true)
  })

  it('denies every other role and the logged-out state', () => {
    expect(canAccessAdmin('FleetAdmin')).toBe(false)
    expect(canAccessAdmin('Dispatcher')).toBe(false)
    expect(canAccessAdmin('Driver')).toBe(false)
    expect(canAccessAdmin(null)).toBe(false)
    expect(canAccessAdmin(undefined)).toBe(false)
  })
})
