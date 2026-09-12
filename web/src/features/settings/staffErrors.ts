/** Maps 409 API errors from staff operations to i18n keys for toast messages. */
import { ApiResponseError } from '../../shared/api/client'

/**
 * Maps a 409 staff operation error to the appropriate i18n key.
 * Returns null for non-409 errors or unrecognized codes.
 */
export function map409ErrorToKey(error: unknown): string | null {
  if (!(error instanceof ApiResponseError) || error.status !== 409) return null
  const code = error.body?.errors?.[0]?.code
  if (code === 'Staff.SelfDeactivation') return 'settings.people.selfDeactivation'
  if (code === 'Staff.DriverIsOnline') return 'settings.people.driverIsOnline'
  return null
}
