import { describe, it, expect } from 'vitest'
import {
  validateFleetSettingsForm,
  toUpdateRequest,
  isValidHexColor,
  checkLogoFile,
  MAX_LOGO_BYTES,
  type FleetSettingsFormValues,
} from './fleetSettingsForm'

function values(overrides?: Partial<FleetSettingsFormValues>): FleetSettingsFormValues {
  return {
    name: 'Taxi Kolín',
    phone: '+420321123456',
    primaryColorHex: '#1e88e5',
    welcomeText: 'Vítejte',
    offerTimeoutSeconds: '45',
    smsMonthlyCapCzk: '500',
    autoDispatchEnabled: false,
    ...overrides,
  }
}

describe('isValidHexColor', () => {
  it('accepts #RRGGBB', () => {
    expect(isValidHexColor('#1e88e5')).toBe(true)
    expect(isValidHexColor('#ABCDEF')).toBe(true)
  })

  it('rejects shorthand, missing hash, and non-hex', () => {
    expect(isValidHexColor('#fff')).toBe(false)
    expect(isValidHexColor('1e88e5')).toBe(false)
    expect(isValidHexColor('#gggggg')).toBe(false)
    expect(isValidHexColor('')).toBe(false)
  })
})

describe('validateFleetSettingsForm', () => {
  it('passes a well-formed form', () => {
    expect(validateFleetSettingsForm(values())).toEqual({})
  })

  it('requires name and phone', () => {
    const errs = validateFleetSettingsForm(values({ name: '  ', phone: '' }))
    expect(errs.name).toBeDefined()
    expect(errs.phone).toBeDefined()
  })

  it('allows an empty color (no brand color) but rejects a malformed one', () => {
    expect(validateFleetSettingsForm(values({ primaryColorHex: '' })).primaryColorHex).toBeUndefined()
    expect(validateFleetSettingsForm(values({ primaryColorHex: 'blue' })).primaryColorHex).toBeDefined()
  })

  it('enforces the offer-timeout 10..600 range and integer-ness', () => {
    expect(validateFleetSettingsForm(values({ offerTimeoutSeconds: '9' })).offerTimeoutSeconds).toBeDefined()
    expect(validateFleetSettingsForm(values({ offerTimeoutSeconds: '601' })).offerTimeoutSeconds).toBeDefined()
    expect(validateFleetSettingsForm(values({ offerTimeoutSeconds: 'abc' })).offerTimeoutSeconds).toBeDefined()
    expect(validateFleetSettingsForm(values({ offerTimeoutSeconds: '10' })).offerTimeoutSeconds).toBeUndefined()
    expect(validateFleetSettingsForm(values({ offerTimeoutSeconds: '600' })).offerTimeoutSeconds).toBeUndefined()
  })

  it('requires a non-negative integer SMS cap', () => {
    expect(validateFleetSettingsForm(values({ smsMonthlyCapCzk: '-1' })).smsMonthlyCapCzk).toBeDefined()
    expect(validateFleetSettingsForm(values({ smsMonthlyCapCzk: 'x' })).smsMonthlyCapCzk).toBeDefined()
    expect(validateFleetSettingsForm(values({ smsMonthlyCapCzk: '0' })).smsMonthlyCapCzk).toBeUndefined()
  })

  it('rejects a welcome text over 2000 chars', () => {
    expect(validateFleetSettingsForm(values({ welcomeText: 'a'.repeat(2001) })).welcomeText).toBeDefined()
    expect(validateFleetSettingsForm(values({ welcomeText: 'a'.repeat(2000) })).welcomeText).toBeUndefined()
  })
})

describe('toUpdateRequest', () => {
  it('maps values, trimming and nulling empty color/welcome', () => {
    const req = toUpdateRequest(values({ primaryColorHex: '  ', welcomeText: '   ', offerTimeoutSeconds: '30' }))
    expect(req).toEqual({
      name: 'Taxi Kolín',
      phone: '+420321123456',
      primaryColorHex: null,
      welcomeText: null,
      offerTimeoutSeconds: 30,
      smsMonthlyCapCzk: 500,
      autoDispatchEnabled: false,
    })
  })

  it('keeps a set color/welcome', () => {
    const req = toUpdateRequest(values())
    expect(req.primaryColorHex).toBe('#1e88e5')
    expect(req.welcomeText).toBe('Vítejte')
  })
})

describe('checkLogoFile', () => {
  function fileOf(name: string, type: string, size: number): File {
    const f = new File([new Uint8Array(1)], name, { type })
    // jsdom File size is derived from content; override for the size branch.
    Object.defineProperty(f, 'size', { value: size })
    return f
  }

  it('accepts a PNG under 200 KB', () => {
    expect(checkLogoFile(fileOf('logo.png', 'image/png', 1000))).toEqual({ ok: true })
  })

  it('rejects a non-PNG', () => {
    expect(checkLogoFile(fileOf('logo.jpg', 'image/jpeg', 1000))).toEqual({ ok: false, reason: 'notPng' })
  })

  it('rejects a PNG over 200 KB', () => {
    expect(checkLogoFile(fileOf('logo.png', 'image/png', MAX_LOGO_BYTES + 1))).toEqual({
      ok: false,
      reason: 'tooLarge',
    })
  })
})
