/**
 * Display-band mapper for a fleet's server-computed health flag.
 *
 * The backend (GET /api/v1/admin/analytics) already computes `health` as one of
 * "growing" | "stable" | "declining" | "inactive", with inactive taking
 * precedence over the MoM bands. This module is a pure DISPLAY mapper — it maps
 * that string to an i18n label key and a theme color token. It deliberately does
 * NOT recompute the band from momDeltaPct (that would duplicate server logic and
 * silently diverge on the inactive-precedence rule); it consumes `row.health`
 * directly.
 */

import type { theme } from '../../../shared/theme/theme'

/** A theme.colors key usable for the health chip. */
type ColorToken = keyof typeof theme.colors

/** Presentation for a single health band. */
export interface HealthBand {
  /** i18n key for the human-readable band label. */
  labelKey: string
  /** theme.colors token for the band's background/accent color. */
  colorToken: ColorToken
  /**
   * theme.colors token for the FOREGROUND (text) color, paired with colorToken for
   * WCAG contrast. Amber (`warning`, #f9ab00) fails with white text (~1.9:1), so the
   * inactive band uses dark `text` — mirroring the codebase status-pill convention
   * (statusBusyText/orderAssignedText). jsdom axe cannot check contrast, so this pairing
   * is enforced by unit test + the manual Lighthouse gate.
   */
  fgToken: ColorToken
}

const BANDS: Record<string, HealthBand> = {
  growing: { labelKey: 'admin.platform.health.growing', colorToken: 'success', fgToken: 'textOnPrimary' },
  stable: { labelKey: 'admin.platform.health.stable', colorToken: 'textSecondary', fgToken: 'textOnPrimary' },
  declining: { labelKey: 'admin.platform.health.declining', colorToken: 'error', fgToken: 'textOnPrimary' },
  inactive: { labelKey: 'admin.platform.health.inactive', colorToken: 'warning', fgToken: 'text' },
}

/**
 * Maps a server health flag to its display band.
 *
 * @param health - The `health` string from the API row.
 * @returns The band's label key + color token; falls back to the "stable" band
 *   for any unrecognized value (never recomputes from other fields).
 */
export function healthBand(health: string): HealthBand {
  return BANDS[health] ?? BANDS.stable
}
