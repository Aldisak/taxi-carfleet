import type { CreateFleetRequest } from '../../shared/api/client'

/** Editable create-fleet form values. */
export interface CreateFleetFormValues {
  slug: string
  name: string
  phone: string
  adminEmail: string
}

/** Field-keyed validation error messages (i18n keys). */
export type CreateFleetFormErrors = Partial<Record<keyof CreateFleetFormValues, string>>

/** Lowercase URL-safe slug: a-z, 0-9, hyphen; must start and end alphanumeric. */
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/

/** Minimal email shape (server is authoritative; this is a pre-check for instant feedback). */
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const K = {
  slugRequired: 'admin.fleets.validation.slugRequired',
  slugInvalid: 'admin.fleets.validation.slugInvalid',
  nameRequired: 'admin.fleets.validation.nameRequired',
  phoneRequired: 'admin.fleets.validation.phoneRequired',
  emailRequired: 'admin.fleets.validation.emailRequired',
  emailInvalid: 'admin.fleets.validation.emailInvalid',
} as const

/** True when the value is a valid fleet slug. */
export function isValidSlug(value: string): boolean {
  return SLUG.test(value)
}

/**
 * Validates the create-fleet form. Returns a field→i18n-key map; empty when valid. Pure.
 * Mirrors the server CreateFleetValidator shape (required slug/name/phone/email, slug charset).
 */
export function validateCreateFleetForm(values: CreateFleetFormValues): CreateFleetFormErrors {
  const errors: CreateFleetFormErrors = {}

  const slug = values.slug.trim()
  if (!slug) errors.slug = K.slugRequired
  else if (!isValidSlug(slug)) errors.slug = K.slugInvalid

  if (!values.name.trim()) errors.name = K.nameRequired
  if (!values.phone.trim()) errors.phone = K.phoneRequired

  const email = values.adminEmail.trim()
  if (!email) errors.adminEmail = K.emailRequired
  else if (!EMAIL.test(email)) errors.adminEmail = K.emailInvalid

  return errors
}

/** Maps validated form values to the API request (trimmed, slug lowercased). */
export function toCreateFleetRequest(values: CreateFleetFormValues): CreateFleetRequest {
  return {
    slug: values.slug.trim().toLowerCase(),
    name: values.name.trim(),
    phone: values.phone.trim(),
    adminEmail: values.adminEmail.trim(),
  }
}
