import type { DefaultTheme } from 'styled-components'
import type { PublicFleetResponse } from '../../../shared/api/client'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/**
 * Produces a styled-components theme with the fleet's primary color applied as an
 * override. A null/absent/malformed primaryColorHex falls back to the base theme's
 * primary token (rules/web-react-style.md#styled-components — no hand-rolled colors).
 *
 * Returns the base theme by reference when there is no fleet (loading/offline), so
 * callers can render last-known content without a flash.
 *
 * @param base  The base application theme.
 * @param fleet The public fleet branding response, or undefined while it is loading.
 */
export function applyFleetBranding(
  base: DefaultTheme,
  fleet: PublicFleetResponse | undefined,
): DefaultTheme {
  if (!fleet) {
    return base
  }

  const primary = fleet.primaryColorHex && HEX_COLOR.test(fleet.primaryColorHex)
    ? fleet.primaryColorHex
    : base.colors.primary

  if (primary === base.colors.primary) {
    return base
  }

  return {
    ...base,
    colors: {
      ...base.colors,
      primary,
    },
  }
}
