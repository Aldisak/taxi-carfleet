import { describe, expect, it } from 'vitest'
import { validateVehicleForm } from './vehicleSchema'
import type { VehicleFormValues } from './vehicleSchema'

const t = (k: string) => k

const VALID: VehicleFormValues = {
  plate: '1AB2345',
  make: 'Škoda',
  model: 'Octavia',
  color: 'Bílá',
  seats: '4',
}

describe('validateVehicleForm', () => {
  it('returns no errors for valid input', () => {
    const errors = validateVehicleForm(VALID, t)
    expect(Object.keys(errors)).toHaveLength(0)
  })

  it('plate required: returns error when plate is empty', () => {
    const errors = validateVehicleForm({ ...VALID, plate: '' }, t)
    expect(errors.plate).toBe('settings.vehicles.validation.plateRequired')
  })

  it('plate too long: returns error when plate exceeds 20 chars', () => {
    const errors = validateVehicleForm({ ...VALID, plate: 'A'.repeat(21) }, t)
    expect(errors.plate).toBe('settings.vehicles.validation.plateTooLong')
  })

  it('plate exactly 20 chars: no error', () => {
    const errors = validateVehicleForm({ ...VALID, plate: 'A'.repeat(20) }, t)
    expect(errors.plate).toBeUndefined()
  })

  it('make required: returns error when make is empty', () => {
    const errors = validateVehicleForm({ ...VALID, make: '' }, t)
    expect(errors.make).toBe('settings.vehicles.validation.makeRequired')
  })

  it('model required: returns error when model is empty', () => {
    const errors = validateVehicleForm({ ...VALID, model: '' }, t)
    expect(errors.model).toBe('settings.vehicles.validation.modelRequired')
  })

  it('color required: returns error when color is empty', () => {
    const errors = validateVehicleForm({ ...VALID, color: '' }, t)
    expect(errors.color).toBe('settings.vehicles.validation.colorRequired')
  })

  it('seats must be >= 1: returns error when seats is 0', () => {
    const errors = validateVehicleForm({ ...VALID, seats: '0' }, t)
    expect(errors.seats).toBe('settings.vehicles.validation.seatsMin')
  })

  it('seats must be >= 1: no error when seats is 1', () => {
    const errors = validateVehicleForm({ ...VALID, seats: '1' }, t)
    expect(errors.seats).toBeUndefined()
  })

  it('seats must be >= 1: returns error when seats is negative', () => {
    const errors = validateVehicleForm({ ...VALID, seats: '-1' }, t)
    expect(errors.seats).toBe('settings.vehicles.validation.seatsMin')
  })
})
