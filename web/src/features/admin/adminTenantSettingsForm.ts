import type { AdminTenantSettingsDto, UpdateAdminTenantSettingsRequest } from '../../shared/api/client'

/**
 * SuperAdmin per-tenant settings form values. Number fields are carried as strings for
 * controlled inputs (mirroring `fleetSettingsForm.ts`); booleans are booleans; both Mapy
 * keys are strings (blank = "leave the stored key alone" — see {@link toUpdateRequest}).
 */
export interface AdminTenantSettingsFormValues {
  name: string
  phone: string
  currency: string
  timeZone: string
  /** #RRGGBB; empty string means "no brand color". */
  primaryColorHex: string
  isActive: boolean
  /** Seconds (10..600) as a string. */
  offerTimeoutSeconds: string
  autoDispatchEnabled: boolean
  /** Seconds (>= 0) as a string. */
  autoDispatchAfterSeconds: string
  /** Km (1..100) as a string. */
  maxOfferRadiusKm: string
  /** SMS sender name; empty string means "unset". */
  smsSenderName: string
  /** Welcome text; empty string means "unset". */
  welcomeText: string
  /** CZK (>= 0) as a string. */
  smsMonthlyCapCzk: string
  /** CZK (>= 0) as a string. */
  smsUnitCostCzk: string
  /** Public Mapy browser key; blank = keep the stored key. */
  mapyBrowserKey: string
  /** Write-only Mapy server key; always loads blank; blank = keep the stored key. */
  mapyServerKey: string
  /** Read-only hint flag from the DTO — true when a server key is stored. */
  mapyServerKeyConfigured: boolean
  /** Latitude (-90..90) as a string; a float. */
  mapCenterLat: string
  /** Longitude (-180..180) as a string; a float. */
  mapCenterLng: string
  /** Zoom (1..20) as a string. */
  mapZoom: string
  /** Credits (>= 0) as a string. */
  geoMonthlyCreditBudget: string
}

/** Field-keyed validation error messages (i18n keys under `admin.tenant.validation.*`). */
export type AdminTenantSettingsFormErrors = Partial<
  Record<keyof AdminTenantSettingsFormValues, string>
>

/** #RRGGBB — the only accepted brand-color shape (mirrors the server validator). */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
/** Exactly three ASCII letters (ISO 4217 code shape). */
const CURRENCY_CODE = /^[A-Za-z]{3}$/

const OFFER_TIMEOUT_MIN = 10
const OFFER_TIMEOUT_MAX = 600
const MAX_OFFER_RADIUS_MIN = 1
const MAX_OFFER_RADIUS_MAX = 100
const MAP_ZOOM_MIN = 1
const MAP_ZOOM_MAX = 20
const LAT_ABS_MAX = 90
const LNG_ABS_MAX = 180
const SMS_SENDER_MAX_LENGTH = 100
const WELCOME_MAX_LENGTH = 2000
const MAPY_KEY_MAX_LENGTH = 512

/** i18n keys for the form; a caller maps them through t(). */
const K = {
  nameRequired: 'admin.tenant.validation.nameRequired',
  phoneRequired: 'admin.tenant.validation.phoneRequired',
  timeZoneRequired: 'admin.tenant.validation.timeZoneRequired',
  currencyInvalid: 'admin.tenant.validation.currencyInvalid',
  colorInvalid: 'admin.tenant.validation.colorInvalid',
  colorContrast: 'admin.tenant.validation.colorContrast',
  offerTimeoutRange: 'admin.tenant.validation.offerTimeoutRange',
  autoDispatchAfterInvalid: 'admin.tenant.validation.autoDispatchAfterInvalid',
  maxOfferRadiusRange: 'admin.tenant.validation.maxOfferRadiusRange',
  smsCapInvalid: 'admin.tenant.validation.smsCapInvalid',
  smsUnitCostInvalid: 'admin.tenant.validation.smsUnitCostInvalid',
  smsSenderNameTooLong: 'admin.tenant.validation.smsSenderNameTooLong',
  welcomeTooLong: 'admin.tenant.validation.welcomeTooLong',
  mapCenterLatRange: 'admin.tenant.validation.mapCenterLatRange',
  mapCenterLngRange: 'admin.tenant.validation.mapCenterLngRange',
  mapZoomRange: 'admin.tenant.validation.mapZoomRange',
  geoBudgetInvalid: 'admin.tenant.validation.geoBudgetInvalid',
  mapyKeyTooLong: 'admin.tenant.validation.mapyKeyTooLong',
} as const

/** True when the value is a valid #RRGGBB hex color. */
export function isValidHexColor(value: string): boolean {
  return HEX_COLOR.test(value)
}

/** Minimum acceptable contrast ratio of the accent against white or black (WCAG UI-component level). */
const MIN_ACCENT_CONTRAST = 3

/** sRGB channel (0..255) → linearized value for the WCAG relative-luminance formula. */
function linearizeChannel(channel8bit: number): number {
  const c = channel8bit / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance of a valid #RRGGBB hex color (0..1). */
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b)
}

/**
 * True when the accent keeps at least a 3:1 contrast ratio against BOTH white and black — i.e.
 * `min(ratioVsWhite, ratioVsBlack) >= 3`. A near-white accent vanishes on the light-theme surface;
 * a near-black one vanishes on the dark-theme surface; both are rejected.
 *
 * NOTE: the handoff's literal "reject accents with <3:1 against BOTH white and black" predicate is
 * vacuous — `ratioVsWhite < 3` requires luminance > 0.30 while `ratioVsBlack < 3` requires < 0.10,
 * a contradiction, so it never rejects anything (verified by an exhaustive RGB scan). The live,
 * useful reading — the one implemented here — is the min-under-3 form above.
 */
export function hasSufficientAccentContrast(hex: string): boolean {
  const luminance = relativeLuminance(hex)
  const ratioVsWhite = 1.05 / (luminance + 0.05)
  const ratioVsBlack = (luminance + 0.05) / 0.05
  return Math.min(ratioVsWhite, ratioVsBlack) >= MIN_ACCENT_CONTRAST
}

/** True when the string parses as an integer within [min, max]. */
function isIntInRange(value: string, min: number, max: number): boolean {
  const n = Number(value)
  return Number.isInteger(n) && n >= min && n <= max
}

/** True when the string parses as a finite number within [min, max] (allows floats). */
function isFloatInRange(value: string, min: number, max: number): boolean {
  const n = Number(value)
  return Number.isFinite(n) && n >= min && n <= max
}

/** True when the string parses as an integer >= 0. */
function isNonNegativeInt(value: string): boolean {
  const n = Number(value)
  return Number.isInteger(n) && n >= 0
}

/**
 * Validates the SuperAdmin tenant-settings form. Returns a field→i18n-key map; empty when
 * valid. Pure. Mirrors the server `UpdateTenantSettingsValidator` bounds: required
 * name/phone/timeZone; 3-letter currency; optional #RRGGBB color; offer timeout 10..600;
 * auto-dispatch-after >= 0; max offer radius 1..100; non-negative SMS cap and unit cost;
 * sender name <= 100; welcome <= 2000; map center lat -90..90 and lng -180..180 (floats);
 * zoom 1..20; geo budget >= 0; both Mapy keys <= 512.
 */
export function validateAdminTenantSettingsForm(
  values: AdminTenantSettingsFormValues,
): AdminTenantSettingsFormErrors {
  const errors: AdminTenantSettingsFormErrors = {}

  if (!values.name.trim()) errors.name = K.nameRequired
  if (!values.phone.trim()) errors.phone = K.phoneRequired
  if (!values.timeZone.trim()) errors.timeZone = K.timeZoneRequired

  if (!CURRENCY_CODE.test(values.currency.trim())) errors.currency = K.currencyInvalid

  const trimmedColor = values.primaryColorHex.trim()
  if (trimmedColor) {
    if (!isValidHexColor(trimmedColor)) {
      errors.primaryColorHex = K.colorInvalid
    } else if (!hasSufficientAccentContrast(trimmedColor)) {
      errors.primaryColorHex = K.colorContrast
    }
  }

  if (!isIntInRange(values.offerTimeoutSeconds, OFFER_TIMEOUT_MIN, OFFER_TIMEOUT_MAX)) {
    errors.offerTimeoutSeconds = K.offerTimeoutRange
  }

  if (!isNonNegativeInt(values.autoDispatchAfterSeconds)) {
    errors.autoDispatchAfterSeconds = K.autoDispatchAfterInvalid
  }

  if (!isIntInRange(values.maxOfferRadiusKm, MAX_OFFER_RADIUS_MIN, MAX_OFFER_RADIUS_MAX)) {
    errors.maxOfferRadiusKm = K.maxOfferRadiusRange
  }

  if (!isNonNegativeInt(values.smsMonthlyCapCzk)) errors.smsMonthlyCapCzk = K.smsCapInvalid
  if (!isNonNegativeInt(values.smsUnitCostCzk)) errors.smsUnitCostCzk = K.smsUnitCostInvalid

  if (values.smsSenderName.length > SMS_SENDER_MAX_LENGTH) {
    errors.smsSenderName = K.smsSenderNameTooLong
  }

  if (values.welcomeText.length > WELCOME_MAX_LENGTH) errors.welcomeText = K.welcomeTooLong

  if (!isFloatInRange(values.mapCenterLat, -LAT_ABS_MAX, LAT_ABS_MAX)) {
    errors.mapCenterLat = K.mapCenterLatRange
  }
  if (!isFloatInRange(values.mapCenterLng, -LNG_ABS_MAX, LNG_ABS_MAX)) {
    errors.mapCenterLng = K.mapCenterLngRange
  }

  if (!isIntInRange(values.mapZoom, MAP_ZOOM_MIN, MAP_ZOOM_MAX)) errors.mapZoom = K.mapZoomRange

  if (!isNonNegativeInt(values.geoMonthlyCreditBudget)) {
    errors.geoMonthlyCreditBudget = K.geoBudgetInvalid
  }

  if (values.mapyBrowserKey.length > MAPY_KEY_MAX_LENGTH) errors.mapyBrowserKey = K.mapyKeyTooLong
  if (values.mapyServerKey.length > MAPY_KEY_MAX_LENGTH) errors.mapyServerKey = K.mapyKeyTooLong

  return errors
}

/** Trimmed value, or null when blank/whitespace. */
function trimOrNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * Maps validated form values to the API request shape. Numbers are parsed from the string
 * inputs. Empty color/welcome/sender-name become null (the server treats null as "clear").
 *
 * SECURITY-CRITICAL: for BOTH Mapy keys, a blank/whitespace input maps to `null` — which the
 * server interprets as "keep the stored key" — NEVER to `""` (which would clear it). The web
 * UI has no clear affordance for the server key, so a blank submit preserves it. Call only
 * after {@link validateAdminTenantSettingsForm} returns no errors.
 */
export function toUpdateRequest(
  values: AdminTenantSettingsFormValues,
): UpdateAdminTenantSettingsRequest {
  return {
    name: values.name.trim(),
    phone: values.phone.trim(),
    currency: values.currency.trim(),
    timeZone: values.timeZone.trim(),
    primaryColorHex: trimOrNull(values.primaryColorHex),
    isActive: values.isActive,
    offerTimeoutSeconds: Number(values.offerTimeoutSeconds),
    autoDispatchEnabled: values.autoDispatchEnabled,
    autoDispatchAfterSeconds: Number(values.autoDispatchAfterSeconds),
    maxOfferRadiusKm: Number(values.maxOfferRadiusKm),
    smsSenderName: trimOrNull(values.smsSenderName),
    welcomeText: trimOrNull(values.welcomeText),
    smsMonthlyCapCzk: Number(values.smsMonthlyCapCzk),
    smsUnitCostCzk: Number(values.smsUnitCostCzk),
    // blank => null (KEEP the stored key), never "" (CLEAR). Applies to both keys.
    mapyServerKey: trimOrNull(values.mapyServerKey),
    mapyBrowserKey: trimOrNull(values.mapyBrowserKey),
    mapCenterLat: Number(values.mapCenterLat),
    mapCenterLng: Number(values.mapCenterLng),
    mapZoom: Number(values.mapZoom),
    geoMonthlyCreditBudget: Number(values.geoMonthlyCreditBudget),
  }
}

/**
 * Seeds form values from a fetched DTO. The Mapy server-key field ALWAYS seeds blank (the
 * DTO never carries the value); `mapyServerKeyConfigured` is passed through for the page's
 * configured/not-set hint. The browser key seeds from `dto.mapyBrowserKey` (public).
 */
export function fromDto(dto: AdminTenantSettingsDto): AdminTenantSettingsFormValues {
  return {
    name: dto.name,
    phone: dto.phone,
    currency: dto.currency,
    timeZone: dto.timeZone,
    primaryColorHex: dto.primaryColorHex ?? '',
    isActive: dto.isActive,
    offerTimeoutSeconds: String(dto.offerTimeoutSeconds),
    autoDispatchEnabled: dto.autoDispatchEnabled,
    autoDispatchAfterSeconds: String(dto.autoDispatchAfterSeconds),
    maxOfferRadiusKm: String(dto.maxOfferRadiusKm),
    smsSenderName: dto.smsSenderName ?? '',
    welcomeText: dto.welcomeText ?? '',
    smsMonthlyCapCzk: String(dto.smsMonthlyCapCzk),
    smsUnitCostCzk: String(dto.smsUnitCostCzk),
    mapyBrowserKey: dto.mapyBrowserKey ?? '',
    // Never seeded from the DTO — the server-key value is never returned to the browser.
    mapyServerKey: '',
    mapyServerKeyConfigured: dto.mapyServerKeyConfigured,
    mapCenterLat: String(dto.mapCenterLat),
    mapCenterLng: String(dto.mapCenterLng),
    mapZoom: String(dto.mapZoom),
    geoMonthlyCreditBudget: String(dto.geoMonthlyCreditBudget),
  }
}
