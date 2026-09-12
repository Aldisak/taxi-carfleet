import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { getNavAppPreference } from '../settings/driverSettings'
import { buildNavUrl } from './navLinks'

const NavLink = styled.a`
  display: block;
  width: 100%;
  box-sizing: border-box;
  text-align: center;
  min-height: ${({ theme }) => theme.touchTargets.min};
  line-height: ${({ theme }) => theme.touchTargets.min};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  text-decoration: none;
`

interface NavHandoffProps {
  lat: number
  lng: number
  label?: string
  /** i18n key for the link text (e.g. 'driver.ride.navigate'). */
  labelKey: string
}

/**
 * Navigation handoff link — opens the driver's preferred maps app
 * (Google Maps / Mapy.cz / Waze / geo:) at the destination.
 * Rendered as a real anchor so the OS deep-link / universal link fires.
 */
export function NavHandoff({ lat, lng, label, labelKey }: NavHandoffProps) {
  const { t } = useTranslation()
  const href = buildNavUrl(getNavAppPreference(), lat, lng, label)

  return (
    <NavLink href={href} target="_blank" rel="noopener noreferrer">
      {t(labelKey)}
    </NavLink>
  )
}
