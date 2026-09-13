import type { UpdateFleetSettingsRequest } from '../../shared/api/client'

/** Editable Fleet self-service form values (all strings for controlled inputs). */
export interface FleetSettingsFormValues {
  name: string
  phone: string
  /** #RRGGBB; empty string means "no brand color". */
  primaryColorHex: string
  welcomeText: string
  /** Seconds (10..600) as a string (number input). */
  offerTimeoutSeconds: string
  /** CZK (>= 0) as a string. */
  smsMonthlyCapCzk: string
  autoDispatchEnabled: boolean
}

/** Field-keyed validation error messages (i18n keys). */
export type FleetSettingsFormErrors = Partial<Record<keyof FleetSettingsFormValues, string>>

/** The maximum logo upload size in bytes (200 KB), matching the server guard. */
export const MAX_LOGO_BYTES = 200 * 1024

/** #RRGGBB — the only accepted brand-color shape (mirrors the server validator). */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

const OFFER_TIMEOUT_MIN = 10
const OFFER_TIMEOUT_MAX = 600
const WELCOME_MAX_LENGTH = 2000

/** True when the value is a valid #RRGGBB hex color. */
export function isValidHexColor(value: string): boolean {
  return HEX_COLOR.test(value)
}

/** i18n keys for the form; a caller maps them through t(). */
const K = {
  nameRequired: 'settings.fleet.validation.nameRequired',
  phoneRequired: 'settings.fleet.validation.phoneRequired',
  colorInvalid: 'settings.fleet.validation.colorInvalid',
  offerTimeoutRange: 'settings.fleet.validation.offerTimeoutRange',
  smsCapInvalid: 'settings.fleet.validation.smsCapInvalid',
  welcomeTooLong: 'settings.fleet.validation.welcomeTooLong',
} as const

/**
 * Validates the fleet self-service form. Returns a field→i18n-key map; empty when valid.
 * Pure — no side effects, easily unit-tested. Mirrors the server UpdateFleetSettingsValidator:
 * required name/phone, optional #RRGGBB color, offer-timeout 10..600, non-negative SMS cap,
 * welcome text <= 2000 chars.
 */
export function validateFleetSettingsForm(values: FleetSettingsFormValues): FleetSettingsFormErrors {
  const errors: FleetSettingsFormErrors = {}

  if (!values.name.trim()) errors.name = K.nameRequired
  if (!values.phone.trim()) errors.phone = K.phoneRequired

  if (values.primaryColorHex.trim() && !isValidHexColor(values.primaryColorHex.trim())) {
    errors.primaryColorHex = K.colorInvalid
  }

  const timeout = Number(values.offerTimeoutSeconds)
  if (
    !Number.isInteger(timeout) ||
    timeout < OFFER_TIMEOUT_MIN ||
    timeout > OFFER_TIMEOUT_MAX
  ) {
    errors.offerTimeoutSeconds = K.offerTimeoutRange
  }

  const cap = Number(values.smsMonthlyCapCzk)
  if (!Number.isInteger(cap) || cap < 0) {
    errors.smsMonthlyCapCzk = K.smsCapInvalid
  }

  if (values.welcomeText.length > WELCOME_MAX_LENGTH) {
    errors.welcomeText = K.welcomeTooLong
  }

  return errors
}

/**
 * Maps validated form values to the API request shape. Empty color/welcome become null
 * (the server treats null as "clear"). Numbers are parsed from the string inputs.
 * Call only after validateFleetSettingsForm returns no errors.
 */
export function toUpdateRequest(values: FleetSettingsFormValues): UpdateFleetSettingsRequest {
  const color = values.primaryColorHex.trim()
  const welcome = values.welcomeText.trim()
  return {
    name: values.name.trim(),
    phone: values.phone.trim(),
    primaryColorHex: color ? color : null,
    welcomeText: welcome ? welcome : null,
    offerTimeoutSeconds: Number(values.offerTimeoutSeconds),
    smsMonthlyCapCzk: Number(values.smsMonthlyCapCzk),
    autoDispatchEnabled: values.autoDispatchEnabled,
  }
}

/** Result of a client-side logo pre-check. */
export type LogoCheckResult =
  | { ok: true }
  | { ok: false; reason: 'notPng' | 'tooLarge' }

/**
 * Client-side pre-check for a logo file before upload (mirrors the server 400 guards so
 * the user gets instant feedback without a round-trip). The server still re-validates
 * (PNG magic bytes + 200 KB) and the caller must fall back to the server 400.
 *
 * @param file the selected File (type is the browser-reported MIME; trusted only for UX).
 */
export function checkLogoFile(file: File): LogoCheckResult {
  const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
  if (!isPng) return { ok: false, reason: 'notPng' }
  if (file.size > MAX_LOGO_BYTES) return { ok: false, reason: 'tooLarge' }
  return { ok: true }
}
