import { describe, expect, it } from 'vitest'
import { map409ErrorToKey } from './staffErrors'
import { ApiResponseError } from '../../shared/api/client'

/** Minimal valid ApiError body for testing. */
function makeError(status: number, code: string): ApiResponseError {
  return new ApiResponseError(status, {
    status,
    title: 'Conflict',
    type: 'Conflict',
    errors: [{ name: '', reason: '', code }],
  })
}

describe('map409ErrorToKey', () => {
  it('returns selfDeactivation key for Staff.SelfDeactivation code', () => {
    expect(map409ErrorToKey(makeError(409, 'Staff.SelfDeactivation'))).toBe(
      'settings.people.selfDeactivation',
    )
  })

  it('returns driverIsOnline key for Staff.DriverIsOnline code', () => {
    expect(map409ErrorToKey(makeError(409, 'Staff.DriverIsOnline'))).toBe(
      'settings.people.driverIsOnline',
    )
  })

  it('returns null for non-409 status', () => {
    expect(map409ErrorToKey(makeError(400, 'Staff.SelfDeactivation'))).toBeNull()
  })

  it('returns null for unrecognized 409 error code', () => {
    expect(map409ErrorToKey(makeError(409, 'Some.OtherError'))).toBeNull()
  })

  it('returns null for non-ApiResponseError', () => {
    expect(map409ErrorToKey(new Error('plain error'))).toBeNull()
    expect(map409ErrorToKey(null)).toBeNull()
    expect(map409ErrorToKey('string error')).toBeNull()
  })
})
