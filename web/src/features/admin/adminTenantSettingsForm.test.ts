import { describe, it, expect } from 'vitest'
import {
  validateAdminTenantSettingsForm,
  toUpdateRequest,
  fromDto,
  type AdminTenantSettingsFormValues,
} from './adminTenantSettingsForm'
import type { AdminTenantSettingsDto } from '../../shared/api/client'

function values(overrides?: Partial<AdminTenantSettingsFormValues>): AdminTenantSettingsFormValues {
  return {
    name: 'Taxi Kolín',
    phone: '+420321123456',
    currency: 'CZK',
    timeZone: 'Europe/Prague',
    primaryColorHex: '#1e88e5',
    isActive: true,
    offerTimeoutSeconds: '45',
    autoDispatchEnabled: false,
    autoDispatchAfterSeconds: '60',
    maxOfferRadiusKm: '15',
    smsSenderName: 'Taxi Kolín',
    welcomeText: 'Vítejte',
    smsMonthlyCapCzk: '500',
    smsUnitCostCzk: '1',
    mapyBrowserKey: 'browser-key-abc',
    mapyServerKey: '',
    mapyServerKeyConfigured: true,
    mapCenterLat: '50.08',
    mapCenterLng: '14.42',
    mapZoom: '12',
    geoMonthlyCreditBudget: '250000',
    ...overrides,
  }
}

function dto(overrides?: Partial<AdminTenantSettingsDto>): AdminTenantSettingsDto {
  return {
    name: 'Taxi Kolín',
    phone: '+420321123456',
    currency: 'CZK',
    timeZone: 'Europe/Prague',
    primaryColorHex: '#1e88e5',
    isActive: true,
    offerTimeoutSeconds: 45,
    autoDispatchEnabled: false,
    autoDispatchAfterSeconds: 60,
    maxOfferRadiusKm: 15,
    smsSenderName: 'Taxi Kolín',
    welcomeText: 'Vítejte',
    smsMonthlyCapCzk: 500,
    smsUnitCostCzk: 1,
    mapyBrowserKey: 'browser-key-abc',
    mapyServerKeyConfigured: true,
    mapCenterLat: 50.08,
    mapCenterLng: 14.42,
    mapZoom: 12,
    geoMonthlyCreditBudget: 250000,
    ...overrides,
  }
}

describe('validateAdminTenantSettingsForm', () => {
  it('passes a well-formed form (including float map center)', () => {
    expect(validateAdminTenantSettingsForm(values())).toEqual({})
  })

  it('requires name, phone, timeZone', () => {
    const errs = validateAdminTenantSettingsForm(values({ name: '  ', phone: '', timeZone: '   ' }))
    expect(errs.name).toBe('admin.tenant.validation.nameRequired')
    expect(errs.phone).toBe('admin.tenant.validation.phoneRequired')
    expect(errs.timeZone).toBe('admin.tenant.validation.timeZoneRequired')
  })

  it('requires a 3-letter currency code', () => {
    expect(validateAdminTenantSettingsForm(values({ currency: '' })).currency).toBe(
      'admin.tenant.validation.currencyInvalid',
    )
    expect(validateAdminTenantSettingsForm(values({ currency: 'CZ' })).currency).toBe(
      'admin.tenant.validation.currencyInvalid',
    )
    expect(validateAdminTenantSettingsForm(values({ currency: 'CZKK' })).currency).toBe(
      'admin.tenant.validation.currencyInvalid',
    )
    expect(validateAdminTenantSettingsForm(values({ currency: '12K' })).currency).toBe(
      'admin.tenant.validation.currencyInvalid',
    )
    expect(validateAdminTenantSettingsForm(values({ currency: 'usd' })).currency).toBeUndefined()
  })

  it('allows an empty brand color but rejects a malformed one', () => {
    expect(validateAdminTenantSettingsForm(values({ primaryColorHex: '' })).primaryColorHex).toBeUndefined()
    expect(validateAdminTenantSettingsForm(values({ primaryColorHex: 'blue' })).primaryColorHex).toBe(
      'admin.tenant.validation.colorInvalid',
    )
    expect(validateAdminTenantSettingsForm(values({ primaryColorHex: '#fff' })).primaryColorHex).toBe(
      'admin.tenant.validation.colorInvalid',
    )
  })

  it('enforces offer-timeout 10..600 integer', () => {
    expect(validateAdminTenantSettingsForm(values({ offerTimeoutSeconds: '9' })).offerTimeoutSeconds).toBe(
      'admin.tenant.validation.offerTimeoutRange',
    )
    expect(validateAdminTenantSettingsForm(values({ offerTimeoutSeconds: '601' })).offerTimeoutSeconds).toBe(
      'admin.tenant.validation.offerTimeoutRange',
    )
    expect(validateAdminTenantSettingsForm(values({ offerTimeoutSeconds: '45.5' })).offerTimeoutSeconds).toBe(
      'admin.tenant.validation.offerTimeoutRange',
    )
    expect(validateAdminTenantSettingsForm(values({ offerTimeoutSeconds: '10' })).offerTimeoutSeconds).toBeUndefined()
    expect(validateAdminTenantSettingsForm(values({ offerTimeoutSeconds: '600' })).offerTimeoutSeconds).toBeUndefined()
  })

  it('requires non-negative auto-dispatch-after-seconds', () => {
    expect(
      validateAdminTenantSettingsForm(values({ autoDispatchAfterSeconds: '-1' })).autoDispatchAfterSeconds,
    ).toBe('admin.tenant.validation.autoDispatchAfterInvalid')
    expect(
      validateAdminTenantSettingsForm(values({ autoDispatchAfterSeconds: '0' })).autoDispatchAfterSeconds,
    ).toBeUndefined()
  })

  it('enforces max-offer-radius 1..100', () => {
    expect(validateAdminTenantSettingsForm(values({ maxOfferRadiusKm: '0' })).maxOfferRadiusKm).toBe(
      'admin.tenant.validation.maxOfferRadiusRange',
    )
    expect(validateAdminTenantSettingsForm(values({ maxOfferRadiusKm: '101' })).maxOfferRadiusKm).toBe(
      'admin.tenant.validation.maxOfferRadiusRange',
    )
    expect(validateAdminTenantSettingsForm(values({ maxOfferRadiusKm: '1' })).maxOfferRadiusKm).toBeUndefined()
    expect(validateAdminTenantSettingsForm(values({ maxOfferRadiusKm: '100' })).maxOfferRadiusKm).toBeUndefined()
  })

  it('requires non-negative sms monthly cap', () => {
    expect(validateAdminTenantSettingsForm(values({ smsMonthlyCapCzk: '-1' })).smsMonthlyCapCzk).toBe(
      'admin.tenant.validation.smsCapInvalid',
    )
    expect(validateAdminTenantSettingsForm(values({ smsMonthlyCapCzk: '0' })).smsMonthlyCapCzk).toBeUndefined()
  })

  it('requires non-negative sms unit cost', () => {
    expect(validateAdminTenantSettingsForm(values({ smsUnitCostCzk: '-1' })).smsUnitCostCzk).toBe(
      'admin.tenant.validation.smsUnitCostInvalid',
    )
    expect(validateAdminTenantSettingsForm(values({ smsUnitCostCzk: '0' })).smsUnitCostCzk).toBeUndefined()
  })

  it('rejects a sms sender name over 100 chars', () => {
    expect(validateAdminTenantSettingsForm(values({ smsSenderName: 'a'.repeat(101) })).smsSenderName).toBe(
      'admin.tenant.validation.smsSenderNameTooLong',
    )
    expect(validateAdminTenantSettingsForm(values({ smsSenderName: 'a'.repeat(100) })).smsSenderName).toBeUndefined()
    expect(validateAdminTenantSettingsForm(values({ smsSenderName: '' })).smsSenderName).toBeUndefined()
  })

  it('rejects a welcome text over 2000 chars', () => {
    expect(validateAdminTenantSettingsForm(values({ welcomeText: 'a'.repeat(2001) })).welcomeText).toBe(
      'admin.tenant.validation.welcomeTooLong',
    )
    expect(validateAdminTenantSettingsForm(values({ welcomeText: 'a'.repeat(2000) })).welcomeText).toBeUndefined()
  })

  it('enforces map center lat -90..90 as a float', () => {
    expect(validateAdminTenantSettingsForm(values({ mapCenterLat: '-91' })).mapCenterLat).toBe(
      'admin.tenant.validation.mapCenterLatRange',
    )
    expect(validateAdminTenantSettingsForm(values({ mapCenterLat: '91' })).mapCenterLat).toBe(
      'admin.tenant.validation.mapCenterLatRange',
    )
    expect(validateAdminTenantSettingsForm(values({ mapCenterLat: 'abc' })).mapCenterLat).toBe(
      'admin.tenant.validation.mapCenterLatRange',
    )
    // Float values inside the range are valid (regression guard for Number.isInteger misuse).
    expect(validateAdminTenantSettingsForm(values({ mapCenterLat: '50.08' })).mapCenterLat).toBeUndefined()
    expect(validateAdminTenantSettingsForm(values({ mapCenterLat: '-90' })).mapCenterLat).toBeUndefined()
    expect(validateAdminTenantSettingsForm(values({ mapCenterLat: '90' })).mapCenterLat).toBeUndefined()
  })

  it('enforces map center lng -180..180 as a float', () => {
    expect(validateAdminTenantSettingsForm(values({ mapCenterLng: '-181' })).mapCenterLng).toBe(
      'admin.tenant.validation.mapCenterLngRange',
    )
    expect(validateAdminTenantSettingsForm(values({ mapCenterLng: '181' })).mapCenterLng).toBe(
      'admin.tenant.validation.mapCenterLngRange',
    )
    expect(validateAdminTenantSettingsForm(values({ mapCenterLng: '14.42' })).mapCenterLng).toBeUndefined()
    expect(validateAdminTenantSettingsForm(values({ mapCenterLng: '-180' })).mapCenterLng).toBeUndefined()
    expect(validateAdminTenantSettingsForm(values({ mapCenterLng: '180' })).mapCenterLng).toBeUndefined()
  })

  it('enforces map zoom 1..20 integer', () => {
    expect(validateAdminTenantSettingsForm(values({ mapZoom: '0' })).mapZoom).toBe(
      'admin.tenant.validation.mapZoomRange',
    )
    expect(validateAdminTenantSettingsForm(values({ mapZoom: '21' })).mapZoom).toBe(
      'admin.tenant.validation.mapZoomRange',
    )
    expect(validateAdminTenantSettingsForm(values({ mapZoom: '12.5' })).mapZoom).toBe(
      'admin.tenant.validation.mapZoomRange',
    )
    expect(validateAdminTenantSettingsForm(values({ mapZoom: '1' })).mapZoom).toBeUndefined()
    expect(validateAdminTenantSettingsForm(values({ mapZoom: '20' })).mapZoom).toBeUndefined()
  })

  it('requires non-negative geo monthly credit budget', () => {
    expect(
      validateAdminTenantSettingsForm(values({ geoMonthlyCreditBudget: '-1' })).geoMonthlyCreditBudget,
    ).toBe('admin.tenant.validation.geoBudgetInvalid')
    expect(
      validateAdminTenantSettingsForm(values({ geoMonthlyCreditBudget: '0' })).geoMonthlyCreditBudget,
    ).toBeUndefined()
  })

  it('rejects mapy keys over 512 chars', () => {
    expect(validateAdminTenantSettingsForm(values({ mapyBrowserKey: 'a'.repeat(513) })).mapyBrowserKey).toBe(
      'admin.tenant.validation.mapyKeyTooLong',
    )
    expect(validateAdminTenantSettingsForm(values({ mapyServerKey: 'a'.repeat(513) })).mapyServerKey).toBe(
      'admin.tenant.validation.mapyKeyTooLong',
    )
    expect(validateAdminTenantSettingsForm(values({ mapyBrowserKey: 'a'.repeat(512) })).mapyBrowserKey).toBeUndefined()
    expect(validateAdminTenantSettingsForm(values({ mapyServerKey: 'a'.repeat(512) })).mapyServerKey).toBeUndefined()
  })
})

describe('toUpdateRequest — SECURITY: blank keys map to null (keep), never "" (clear)', () => {
  it('maps a blank server key to null (KEEP the existing key)', () => {
    const req = toUpdateRequest(values({ mapyServerKey: '' }))
    expect(req.mapyServerKey).toBeNull()
    expect(req.mapyServerKey).not.toBe('')
  })

  it('maps a whitespace-only server key to null (KEEP the existing key)', () => {
    const req = toUpdateRequest(values({ mapyServerKey: '   ' }))
    expect(req.mapyServerKey).toBeNull()
    expect(req.mapyServerKey).not.toBe('')
  })

  it('maps a typed server key to its trimmed value', () => {
    const req = toUpdateRequest(values({ mapyServerKey: '  secret-server-key  ' }))
    expect(req.mapyServerKey).toBe('secret-server-key')
  })

  it('maps a blank browser key to null (KEEP the existing key)', () => {
    const req = toUpdateRequest(values({ mapyBrowserKey: '' }))
    expect(req.mapyBrowserKey).toBeNull()
    expect(req.mapyBrowserKey).not.toBe('')
  })

  it('maps a whitespace-only browser key to null (KEEP the existing key)', () => {
    const req = toUpdateRequest(values({ mapyBrowserKey: '   ' }))
    expect(req.mapyBrowserKey).toBeNull()
    expect(req.mapyBrowserKey).not.toBe('')
  })

  it('maps a typed browser key to its trimmed value', () => {
    const req = toUpdateRequest(values({ mapyBrowserKey: '  browser-key  ' }))
    expect(req.mapyBrowserKey).toBe('browser-key')
  })
})

describe('toUpdateRequest — field mapping and number conversion', () => {
  it('converts string number fields to numbers (ints and floats)', () => {
    const req = toUpdateRequest(
      values({
        offerTimeoutSeconds: '30',
        autoDispatchAfterSeconds: '90',
        maxOfferRadiusKm: '20',
        smsMonthlyCapCzk: '600',
        smsUnitCostCzk: '2',
        mapCenterLat: '49.5',
        mapCenterLng: '15.25',
        mapZoom: '10',
        geoMonthlyCreditBudget: '300000',
      }),
    )
    expect(req.offerTimeoutSeconds).toBe(30)
    expect(req.autoDispatchAfterSeconds).toBe(90)
    expect(req.maxOfferRadiusKm).toBe(20)
    expect(req.smsMonthlyCapCzk).toBe(600)
    expect(req.smsUnitCostCzk).toBe(2)
    expect(req.mapCenterLat).toBe(49.5)
    expect(req.mapCenterLng).toBe(15.25)
    expect(req.mapZoom).toBe(10)
    expect(req.geoMonthlyCreditBudget).toBe(300000)
  })

  it('trims text fields and nulls empty color/welcome/senderName', () => {
    const req = toUpdateRequest(
      values({ primaryColorHex: '  ', welcomeText: '   ', smsSenderName: '  ', name: ' Taxi ', phone: ' +420 ' }),
    )
    expect(req.primaryColorHex).toBeNull()
    expect(req.welcomeText).toBeNull()
    expect(req.smsSenderName).toBeNull()
    expect(req.name).toBe('Taxi')
    expect(req.phone).toBe('+420')
  })

  it('passes through fleet fields and booleans', () => {
    const req = toUpdateRequest(values({ currency: 'usd', timeZone: 'UTC', isActive: false, autoDispatchEnabled: true }))
    expect(req.currency).toBe('usd')
    expect(req.timeZone).toBe('UTC')
    expect(req.isActive).toBe(false)
    expect(req.autoDispatchEnabled).toBe(true)
  })
})

describe('fromDto', () => {
  it('always seeds the server-key field blank (the DTO never carries it)', () => {
    expect(fromDto(dto()).mapyServerKey).toBe('')
    expect(fromDto(dto({ mapyServerKeyConfigured: false })).mapyServerKey).toBe('')
  })

  it('exposes the mapyServerKeyConfigured flag for the page hint', () => {
    expect(fromDto(dto({ mapyServerKeyConfigured: true })).mapyServerKeyConfigured).toBe(true)
    expect(fromDto(dto({ mapyServerKeyConfigured: false })).mapyServerKeyConfigured).toBe(false)
  })

  it('seeds the browser-key from the DTO (public), empty when null', () => {
    expect(fromDto(dto({ mapyBrowserKey: 'bk-123' })).mapyBrowserKey).toBe('bk-123')
    expect(fromDto(dto({ mapyBrowserKey: null })).mapyBrowserKey).toBe('')
  })

  it('seeds all other fields, converting numbers to strings and nulls to empty strings', () => {
    const v = fromDto(
      dto({
        name: 'Taxi X',
        phone: '+420111222333',
        currency: 'EUR',
        timeZone: 'UTC',
        primaryColorHex: null,
        isActive: false,
        offerTimeoutSeconds: 60,
        autoDispatchEnabled: true,
        autoDispatchAfterSeconds: 30,
        maxOfferRadiusKm: 25,
        smsSenderName: null,
        welcomeText: null,
        smsMonthlyCapCzk: 1000,
        smsUnitCostCzk: 3,
        mapCenterLat: 49.1,
        mapCenterLng: 16.6,
        mapZoom: 8,
        geoMonthlyCreditBudget: 100000,
      }),
    )
    expect(v.name).toBe('Taxi X')
    expect(v.phone).toBe('+420111222333')
    expect(v.currency).toBe('EUR')
    expect(v.timeZone).toBe('UTC')
    expect(v.primaryColorHex).toBe('')
    expect(v.isActive).toBe(false)
    expect(v.offerTimeoutSeconds).toBe('60')
    expect(v.autoDispatchEnabled).toBe(true)
    expect(v.autoDispatchAfterSeconds).toBe('30')
    expect(v.maxOfferRadiusKm).toBe('25')
    expect(v.smsSenderName).toBe('')
    expect(v.welcomeText).toBe('')
    expect(v.smsMonthlyCapCzk).toBe('1000')
    expect(v.smsUnitCostCzk).toBe('3')
    expect(v.mapCenterLat).toBe('49.1')
    expect(v.mapCenterLng).toBe('16.6')
    expect(v.mapZoom).toBe('8')
    expect(v.geoMonthlyCreditBudget).toBe('100000')
  })

  it('round-trips valid form values back through validate cleanly', () => {
    expect(validateAdminTenantSettingsForm(fromDto(dto()))).toEqual({})
  })
})
