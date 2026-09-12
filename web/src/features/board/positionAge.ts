/**
 * Formats how long ago a driver's position was last seen.
 * @param lastPositionAt - ISO 8601 string from DriverSummaryDto.lastPositionAt, or null.
 * @param nowMs - Current timestamp in ms (for testability).
 * @param t - i18next translation function (routes strings through i18n).
 * @returns Localised position age string (e.g. "před 5 s"), or "—" when null.
 */
export function formatPositionAge(
  lastPositionAt: string | null,
  nowMs: number,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  if (lastPositionAt === null) return t('drivers.positionAge.unknown')

  const diffMs = nowMs - new Date(lastPositionAt).getTime()
  const diffSec = Math.floor(diffMs / 1000)

  if (diffSec < 60) {
    return t('drivers.positionAge.seconds', { n: diffSec })
  }

  const diffMin = Math.floor(diffSec / 60)
  return t('drivers.positionAge.minutes', { n: diffMin })
}
