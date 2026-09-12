import type { CreateRouteRequest, RouteAdminDto, RouteType } from '../../../../shared/api/client'

/**
 * Editable form state for a route. A single flat shape the RouteEditor binds to; the
 * type-specific fields that don't apply to the current `type` are simply ignored when
 * mapping to a request. Times are "HH:mm" (the value of an <input type="time">), or '' /
 * null for an all-day route.
 */
export interface RouteFormState {
  name: string
  type: RouteType
  priceCzk: number
  fromZoneId: string | null
  toZoneId: string | null
  fromLat: number | null
  fromLng: number | null
  toLat: number | null
  toLng: number | null
  fromRadiusMeters: number
  toRadiusMeters: number
  isBidirectional: boolean
  validDays: number
  validFromTime: string | null
  validToTime: string | null
  priority: number
  isEnabled: boolean
}

const ALL_WEEK = 127

/** A blank route form (PointToPoint, all week, all day, enabled). */
export function emptyRouteForm(): RouteFormState {
  return {
    name: '',
    type: 'PointToPoint',
    priceCzk: 0,
    fromZoneId: null,
    toZoneId: null,
    fromLat: null,
    fromLng: null,
    toLat: null,
    toLng: null,
    fromRadiusMeters: 150,
    toRadiusMeters: 150,
    isBidirectional: true,
    validDays: ALL_WEEK,
    validFromTime: null,
    validToTime: null,
    priority: 0,
    isEnabled: true,
  }
}

/** Whether bit `index` (0=Mon … 6=Sun) is set in the validDays mask. */
export function isDaySelected(validDays: number, index: number): boolean {
  return (validDays & (1 << index)) !== 0
}

/** Toggles bit `index` (0=Mon … 6=Sun) in the validDays mask, returning the new mask. */
export function toggleDay(validDays: number, index: number): number {
  return validDays ^ (1 << index)
}

/** Trims a "HH:mm:ss"/"HH:mm" to "HH:mm" (for an <input type="time">). Null passes through. */
function toHhMm(time: string | null): string | null {
  if (time == null || time === '') return null
  const [h = '00', m = '00'] = time.split(':')
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

/** Expands a "HH:mm" to the backend "HH:mm:ss" TimeOnly wire format; blank → null (all-day). */
function toHhMmSs(time: string | null): string | null {
  const trimmed = toHhMm(time)
  return trimmed == null ? null : `${trimmed}:00`
}

/**
 * Validates a route form per its type, returning a list of i18n error-code keys (empty = OK).
 * Validator-level concerns only (required/format); the backend enforces the authoritative
 * per-type rules and returns 400 on any drift.
 */
export function validateRouteForm(form: RouteFormState): string[] {
  const errors: string[] = []

  if (form.name.trim() === '') errors.push('settings.routes.validation.nameRequired')
  if (!(form.priceCzk > 0)) errors.push('settings.routes.validation.priceRequired')
  if (form.validDays === 0) errors.push('settings.routes.validation.daysRequired')

  if (form.type === 'PointToPoint') {
    if (form.fromLat == null || form.fromLng == null) errors.push('settings.routes.validation.pickupRequired')
    if (form.toLat == null || form.toLng == null) errors.push('settings.routes.validation.dropoffRequired')
    if (!(form.fromRadiusMeters > 0) || !(form.toRadiusMeters > 0)) {
      errors.push('settings.routes.validation.radiusRequired')
    }
  } else {
    if (form.fromZoneId == null || form.fromZoneId === '') errors.push('settings.routes.validation.fromZoneRequired')
    if (form.type === 'ZoneToZone' && (form.toZoneId == null || form.toZoneId === '')) {
      errors.push('settings.routes.validation.toZoneRequired')
    }
  }

  return errors
}

/**
 * Maps a validated form to a Create/Update request, zeroing fields that don't apply to the
 * chosen type (so a PointToPoint never leaks a fromZoneId, and a Zone never leaks coords).
 * The times are serialized to the backend "HH:mm:ss" TimeOnly format (or null for all-day).
 */
export function routeFormToRequest(form: RouteFormState): CreateRouteRequest {
  const isPointToPoint = form.type === 'PointToPoint'
  const isZoneToZone = form.type === 'ZoneToZone'

  return {
    name: form.name.trim(),
    type: form.type,
    priceCzk: form.priceCzk,
    fromZoneId: isPointToPoint ? null : form.fromZoneId,
    toZoneId: isZoneToZone ? form.toZoneId : null,
    fromLat: isPointToPoint ? (form.fromLat ?? 0) : 0,
    fromLng: isPointToPoint ? (form.fromLng ?? 0) : 0,
    toLat: isPointToPoint ? form.toLat : null,
    toLng: isPointToPoint ? form.toLng : null,
    fromRadiusMeters: form.fromRadiusMeters,
    toRadiusMeters: form.toRadiusMeters,
    isBidirectional: form.isBidirectional,
    validDays: form.validDays,
    validFromTime: toHhMmSs(form.validFromTime),
    validToTime: toHhMmSs(form.validToTime),
    priority: form.priority,
    isEnabled: form.isEnabled,
  }
}

/** Builds an editable form from an existing route DTO (HH:mm:ss → HH:mm for the time inputs). */
export function routeFormFromDto(dto: RouteAdminDto): RouteFormState {
  return {
    name: dto.name,
    type: dto.type,
    priceCzk: dto.priceCzk,
    fromZoneId: dto.fromZoneId,
    toZoneId: dto.toZoneId,
    fromLat: dto.fromLat,
    fromLng: dto.fromLng,
    toLat: dto.toLat,
    toLng: dto.toLng,
    fromRadiusMeters: dto.fromRadiusMeters,
    toRadiusMeters: dto.toRadiusMeters,
    isBidirectional: dto.isBidirectional,
    validDays: dto.validDays,
    validFromTime: toHhMm(dto.validFromTime),
    validToTime: toHhMm(dto.validToTime),
    priority: dto.priority,
    isEnabled: dto.isEnabled,
  }
}
