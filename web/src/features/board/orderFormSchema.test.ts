import { describe, it, expect } from 'vitest'
import { normalizePhone, isValidPhone } from './phoneNormalization'
import { validateOrderForm } from './orderFormSchema'
import type { OrderFormValues } from './orderFormSchema'
import { QUICK_CHIPS } from './quickChips'

// ---------------------------------------------------------------------------
// Phone normalization (mirrors backend PhoneNormalizer)
// ---------------------------------------------------------------------------

describe('normalizePhone', () => {
  it('prefixes bare 9-digit Czech number with +420', () => {
    expect(normalizePhone('777123456')).toBe('+420777123456')
    expect(normalizePhone('601234567')).toBe('+420601234567')
  })

  it('strips spaces before normalizing', () => {
    expect(normalizePhone('777 123 456')).toBe('+420777123456')
    expect(normalizePhone('777-123-456')).toBe('+420777123456')
  })

  it('passes through valid E.164 numbers unchanged', () => {
    expect(normalizePhone('+420777123456')).toBe('+420777123456')
    expect(normalizePhone('+491234567890')).toBe('+491234567890')
  })

  it('strips spaces from E.164 numbers', () => {
    expect(normalizePhone('+420 777 123 456')).toBe('+420777123456')
  })

  it('returns null for empty/null input', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
    expect(normalizePhone('   ')).toBeNull()
  })

  it('returns null for un-normalizable input', () => {
    expect(normalizePhone('12345')).toBeNull()       // too short, not 9 digits
    expect(normalizePhone('12345678901')).toBeNull() // 11 digits without + prefix
    expect(normalizePhone('not-a-phone')).toBeNull()
  })

  it('returns null for 8-digit number (not Czech 9-digit)', () => {
    expect(normalizePhone('12345678')).toBeNull()
  })
})

describe('isValidPhone', () => {
  it('returns true for valid phones', () => {
    expect(isValidPhone('777123456')).toBe(true)
    expect(isValidPhone('+420777123456')).toBe(true)
  })

  it('returns false for invalid phones', () => {
    expect(isValidPhone('')).toBe(false)
    expect(isValidPhone('123')).toBe(false)
    expect(isValidPhone(null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Quick chips
// ---------------------------------------------------------------------------

describe('QUICK_CHIPS', () => {
  it('has 4 chips with non-null coordinates', () => {
    expect(QUICK_CHIPS).toHaveLength(4)
    for (const chip of QUICK_CHIPS) {
      expect(chip.label).toBeTruthy()
      expect(chip.address).toBeTruthy()
      expect(typeof chip.lat).toBe('number')
      expect(typeof chip.lng).toBe('number')
      expect(chip.lat).not.toBeNaN()
      expect(chip.lng).not.toBeNaN()
    }
  })

  it('includes train station Kolín, train station KH, hospital, and bus station', () => {
    const labels = QUICK_CHIPS.map(c => c.label.toLowerCase())
    expect(labels.some(l => l.includes('kolín') && l.includes('nádraží'))).toBe(true)
    expect(labels.some(l => l.includes('kutná hora') || l.includes('kh'))).toBe(true)
    expect(labels.some(l => l.includes('nemocnic'))).toBe(true)
    expect(labels.some(l => l.includes('autobus'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Order form validation
// ---------------------------------------------------------------------------

function makeValid(): OrderFormValues {
  return {
    phone: '777123456',
    name: '',
    pickup: { address: 'Nádraží Kolín', lat: 50.027, lng: 15.2 },
    dropoff: { address: '', lat: null, lng: null },
    asap: true,
    scheduledAt: '',
    passengers: 1,
    note: '',
  }
}

describe('validateOrderForm', () => {
  it('returns no errors for a valid ASAP order', () => {
    const errors = validateOrderForm(makeValid())
    expect(errors.phone).toBeUndefined()
    expect(errors.pickup).toBeUndefined()
    expect(errors.scheduledAt).toBeUndefined()
    expect(errors.passengers).toBeUndefined()
  })

  it('requires phone', () => {
    const values = { ...makeValid(), phone: '' }
    const errors = validateOrderForm(values)
    expect(errors.phone).toBeTruthy()
    expect(errors.phone).not.toContain('{')
  })

  it('rejects invalid phone format', () => {
    const values = { ...makeValid(), phone: '12345' }
    const errors = validateOrderForm(values)
    expect(errors.phone).toBeTruthy()
  })

  it('requires pickup address', () => {
    const values = { ...makeValid(), pickup: { address: '', lat: null, lng: null } }
    const errors = validateOrderForm(values)
    expect(errors.pickup).toBeTruthy()
  })

  it('requires pickup coordinates when address is present', () => {
    const values = {
      ...makeValid(),
      pickup: { address: 'Somewhere', lat: null, lng: null },
    }
    const errors = validateOrderForm(values)
    expect(errors.pickup).toBeTruthy()
  })

  it('rejects scheduled time in the past', () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    const values = { ...makeValid(), asap: false, scheduledAt: past }
    const errors = validateOrderForm(values)
    expect(errors.scheduledAt).toBeTruthy()
  })

  it('accepts scheduled time in the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    const values = { ...makeValid(), asap: false, scheduledAt: future }
    const errors = validateOrderForm(values)
    expect(errors.scheduledAt).toBeUndefined()
  })

  it('rejects passengers < 1', () => {
    const values = { ...makeValid(), passengers: 0 }
    const errors = validateOrderForm(values)
    expect(errors.passengers).toBeTruthy()
  })

  it('ignores scheduledAt when asap = true', () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    const values = { ...makeValid(), asap: true, scheduledAt: past }
    const errors = validateOrderForm(values)
    expect(errors.scheduledAt).toBeUndefined()
  })
})
