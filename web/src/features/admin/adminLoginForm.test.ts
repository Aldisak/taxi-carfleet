import { describe, it, expect } from 'vitest'
import { validateAdminLoginForm } from './adminLoginForm'

describe('validateAdminLoginForm', () => {
  it('accepts a well-formed email + password', () => {
    const errors = validateAdminLoginForm({ email: 'superadmin@demo.local', password: 'Super1234!' })
    expect(errors).toEqual({})
  })

  it('flags a missing email', () => {
    const errors = validateAdminLoginForm({ email: '   ', password: 'x' })
    expect(errors.email).toBe('admin.login.validation.emailRequired')
  })

  it('flags an email without @', () => {
    const errors = validateAdminLoginForm({ email: 'nope', password: 'x' })
    expect(errors.email).toBe('admin.login.validation.emailInvalid')
  })

  it('flags a missing password', () => {
    const errors = validateAdminLoginForm({ email: 'a@b.c', password: '' })
    expect(errors.password).toBe('admin.login.validation.passwordRequired')
  })

  it('reports both fields when both are empty', () => {
    const errors = validateAdminLoginForm({ email: '', password: '' })
    expect(errors.email).toBe('admin.login.validation.emailRequired')
    expect(errors.password).toBe('admin.login.validation.passwordRequired')
  })
})
