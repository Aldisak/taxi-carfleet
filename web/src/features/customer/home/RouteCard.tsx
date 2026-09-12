import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'
import type { CommonRouteDto } from '../../../shared/api/client'
import { formatCzk } from '../../../shared/format/money'

const Card = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  text-align: left;
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`

const Name = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.text};
`

const Price = styled.span`
  flex-shrink: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.primary};
`

/** Props for RouteCard. */
export interface RouteCardProps {
  route: CommonRouteDto
}

/**
 * A single common-route card on Home. One tap navigates to the preselected confirm
 * screen (/c/order/route/:routeId), passing the route in nav state so the confirm
 * screen renders its type/name/price without a second fetch (there is no route-detail
 * endpoint pre-06). A native button for keyboard + a11y (rules/web-accessibility.md).
 */
export function RouteCard({ route }: RouteCardProps) {
  const navigate = useNavigate()

  return (
    <Card
      type="button"
      onClick={() => navigate(`/c/order/route/${route.id}`, { state: { route } })}
    >
      <Name>{route.name}</Name>
      <Price>{formatCzk(route.priceCzk)}</Price>
    </Card>
  )
}
