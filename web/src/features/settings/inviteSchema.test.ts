import { describe, expect, it } from 'vitest'
import { validateInviteForm } from './inviteSchema'
import type { InviteFormValues } from './inviteSchema'

const t = (k: string) => k

const VALID: InviteFormValues = {
  email: 'driver@taxi.cz',
  displayName: 'Jan Novák',
  role: 'Driver',
  phone: '+420777000111',
}

describe('validateInviteForm', () => {
  it('returns no errors for valid input', () => {
    const errors = validateInviteForm(VALID, t)
    expect(Object.keys(errors)).toHaveLength(0)
  })

  it('email required: returns error when email is empty', () => {
    const errors = validateInviteForm({ ...VALID, email: '' }, t)
    expect(errors.email).toBe('settings.people.validation.emailRequired')
  })

  it('email invalid: returns error for non-email string', () => {
    const errors = validateInviteForm({ ...VALID, email: 'not-an-email' }, t)
    expect(errors.email).toBe('settings.people.validation.emailInvalid')
  })

  it('email valid: no error for proper email format', () => {
    const errors = validateInviteForm({ ...VALID, email: 'jan.novak@firma.cz' }, t)
    expect(errors.email).toBeUndefined()
  })

  it('displayName required: returns error when empty', () => {
    const errors = validateInviteForm({ ...VALID, displayName: '' }, t)
    expect(errors.displayName).toBe('settings.people.validation.displayNameRequired')
  })

  it('role required: returns error when role is empty string', () => {
    const errors = validateInviteForm({ ...VALID, role: '' }, t)
    expect(errors.role).toBe('settings.people.validation.roleRequired')
  })

  it('phone is optional: no error when phone is empty', () => {
    const errors = validateInviteForm({ ...VALID, phone: '' }, t)
    expect(errors).not.toHaveProperty('phone')
    expect(Object.keys(errors)).toHaveLength(0)
  })
})
