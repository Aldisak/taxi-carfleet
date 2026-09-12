import { describe, it, expect } from 'vitest'
import {
  emptyRouteForm,
  routeFormFromDto,
  routeFormToRequest,
  validateRouteForm,
  toggleDay,
  isDaySelected,
  type RouteFormState,
} from './routeForm'
import type { RouteAdminDto } from '../../../../shared/api/client'

const ALL_WEEK = 127

function p2pForm(partial: Partial<RouteFormState> = {}): RouteFormState {
  return {
    ...emptyRouteForm(),
    name: 'Nádraží → Centrum',
    type: 'PointToPoint',
    priceCzk: 100,
    fromLat: 49.95,
    fromLng: 15.27,
    toLat: 49.948,
    toLng: 15.268,
    fromRadiusMeters: 150,
    toRadiusMeters: 150,
    ...partial,
  }
}

describe('validateRouteForm', () => {
  it('accepts a valid PointToPoint form', () => {
    expect(validateRouteForm(p2pForm())).toEqual([])
  })

  it('requires a name', () => {
    expect(validateRouteForm(p2pForm({ name: '  ' }))).toContain('settings.routes.validation.nameRequired')
  })

  it('requires a positive price', () => {
    expect(validateRouteForm(p2pForm({ priceCzk: 0 }))).toContain('settings.routes.validation.priceRequired')
  })

  it('PointToPoint requires from+to coords and positive radii', () => {
    const errs = validateRouteForm(p2pForm({ toLat: null, toLng: null, fromRadiusMeters: 0 }))
    expect(errs).toContain('settings.routes.validation.dropoffRequired')
    expect(errs).toContain('settings.routes.validation.radiusRequired')
  })

  it('Zone requires a from zone', () => {
    const form: RouteFormState = { ...emptyRouteForm(), name: 'V zóně', type: 'Zone', priceCzk: 110, fromZoneId: null }
    expect(validateRouteForm(form)).toContain('settings.routes.validation.fromZoneRequired')
  })

  it('Zone with a from zone is valid', () => {
    const form: RouteFormState = { ...emptyRouteForm(), name: 'V zóně', type: 'Zone', priceCzk: 110, fromZoneId: 'zA' }
    expect(validateRouteForm(form)).toEqual([])
  })

  it('ZoneToZone requires both zones', () => {
    const form: RouteFormState = { ...emptyRouteForm(), name: 'A→B', type: 'ZoneToZone', priceCzk: 300, fromZoneId: 'zA', toZoneId: null }
    expect(validateRouteForm(form)).toContain('settings.routes.validation.toZoneRequired')
  })

  it('requires at least one valid day', () => {
    expect(validateRouteForm(p2pForm({ validDays: 0 }))).toContain('settings.routes.validation.daysRequired')
  })
})

describe('routeFormToRequest', () => {
  it('maps a PointToPoint form, keeping zone fields null', () => {
    const req = routeFormToRequest(p2pForm({ validDays: ALL_WEEK }))
    expect(req.type).toBe('PointToPoint')
    expect(req.fromLat).toBe(49.95)
    expect(req.toLat).toBe(49.948)
    expect(req.fromZoneId).toBeNull()
    expect(req.validFromTime).toBeNull()
    expect(req.isEnabled).toBe(true)
  })

  it('maps a Zone form, zeroing coords and sending the from zone', () => {
    const form: RouteFormState = { ...emptyRouteForm(), name: 'V zóně', type: 'Zone', priceCzk: 110, fromZoneId: 'zA' }
    const req = routeFormToRequest(form)
    expect(req.type).toBe('Zone')
    expect(req.fromZoneId).toBe('zA')
    expect(req.toZoneId).toBeNull()
    expect(req.toLat).toBeNull()
  })

  it('serializes the validity window as HH:mm:ss when provided', () => {
    const req = routeFormToRequest(p2pForm({ validFromTime: '22:00', validToTime: '06:00' }))
    expect(req.validFromTime).toBe('22:00:00')
    expect(req.validToTime).toBe('06:00:00')
  })

  it('sends a null window when either end is blank (all-day)', () => {
    const req = routeFormToRequest(p2pForm({ validFromTime: '', validToTime: '' }))
    expect(req.validFromTime).toBeNull()
    expect(req.validToTime).toBeNull()
  })

  it('carries the bidirectional flag for ZoneToZone', () => {
    const form: RouteFormState = { ...emptyRouteForm(), name: 'A↔B', type: 'ZoneToZone', priceCzk: 300, fromZoneId: 'zA', toZoneId: 'zB', isBidirectional: false }
    expect(routeFormToRequest(form).isBidirectional).toBe(false)
  })
})

describe('routeFormFromDto', () => {
  it('round-trips a DTO into an editable form (HH:mm:ss → HH:mm)', () => {
    const dto: RouteAdminDto = {
      id: 'r1', name: 'Noční', type: 'Zone', priceCzk: 200,
      fromZoneId: 'zA', toZoneId: null, fromLat: 49.9, fromLng: 15.2, toLat: null, toLng: null,
      fromRadiusMeters: 150, toRadiusMeters: 150, isBidirectional: true,
      validDays: ALL_WEEK, validFromTime: '03:00:00', validToTime: '04:00:00', priority: 5, isEnabled: false,
    }
    const form = routeFormFromDto(dto)
    expect(form.type).toBe('Zone')
    expect(form.fromZoneId).toBe('zA')
    expect(form.validFromTime).toBe('03:00')
    expect(form.validToTime).toBe('04:00')
    expect(form.isEnabled).toBe(false)
  })
})

describe('toggleDay / isDaySelected', () => {
  it('toggles a day bit on and off', () => {
    const on = toggleDay(0, 0) // add Monday (bit 1)
    expect(on).toBe(1)
    expect(isDaySelected(on, 0)).toBe(true)
    expect(isDaySelected(on, 1)).toBe(false)
    expect(toggleDay(on, 0)).toBe(0)
  })
})
