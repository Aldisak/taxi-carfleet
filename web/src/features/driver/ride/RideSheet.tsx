import { useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { BottomSheet } from '../../../shared/ui/BottomSheet'
import type { OrderDetailDto } from '../../../shared/api/client'
import { deriveRideButtons } from './rideButtonState'
import { RideButton } from './RideButton'
import { NavHandoff } from './NavHandoff'
import { PendingBadge } from '../queue/PendingBadge'

const StaleBanner = styled.div`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.warning};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  text-align: center;
  border-radius: ${({ theme }) => theme.borderRadius.md};
`

const SectionLabel = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 2px 0;
`

const AddressText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
`

const DropoffText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
`

const NoteText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.text};
  font-style: italic;
  margin: 0;
`

const EtaText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.primary};
  margin: 0;
`

const PhoneLink = styled.a`
  display: inline-flex;
  align-items: center;
  min-height: ${({ theme }) => theme.touchTargets.min};
  color: ${({ theme }) => theme.colors.primary};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  text-decoration: none;
`

const NavStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`

/** Props for the presentational ride-controls sheet — the parent (WI-5) owns the transition hooks. */
export interface RideSheetProps {
  /** The active order being driven. */
  order: OrderDetailDto
  /** Whether the No-show button is enabled (≥5 min since arrival). */
  noShowEnabled: boolean
  /** Seconds remaining until No-show is enabled; null when already enabled or irrelevant. */
  noShowCountdownSeconds: number | null
  /** Live ETA in minutes toward the current leg's target; null when unknown. */
  etaMinutes: number | null
  /** Arrive transition handler (parent binds order.id). */
  onArrive: () => void
  /** Start transition handler. */
  onStart: () => void
  /** Complete handler (parent navigates to /driver/ride/complete). */
  onComplete: () => void
  /** No-show transition handler. */
  onNoShow: () => void
  /** True while a transition is in flight (disables primary). */
  isPending: boolean
  /** Number of queued (offline) transitions awaiting replay. */
  pendingCount: number
  /** True when a transition reconciled after a definitive conflict (mid-ride reassignment). */
  reconciledNote: boolean
}

/**
 * Presentational ride-controls surface hosted in the shared BottomSheet (UC-019 WI-4). Lifted from
 * DriverRidePage's body: addresses, tap-to-call phone, ETA, the Navigate handoff, and the
 * Arrive→Start→Complete/No-show buttons via deriveRideButtons + RideButton. It calls no transition
 * hooks — handlers + flags arrive as props (WI-5 owns useRideTransition/useActiveOrder). It manages
 * only its own open/expanded UI state; Escape collapses the sheet (controls persist during a ride).
 */
export function RideSheet({
  order,
  noShowEnabled,
  noShowCountdownSeconds,
  etaMinutes,
  onArrive,
  onStart,
  onComplete,
  onNoShow,
  isPending,
  pendingCount,
  reconciledNote,
}: RideSheetProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  const hasDropoff = order.dropoffLat != null && order.dropoffLng != null
  const buttons = deriveRideButtons(order.status, noShowEnabled, noShowCountdownSeconds, hasDropoff)

  function handlePrimary() {
    if (buttons.primaryAction === 'arrive') onArrive()
    else if (buttons.primaryAction === 'start') onStart()
    else if (buttons.primaryAction === 'complete') onComplete()
  }

  function handleSecondary() {
    if (buttons.secondaryAction === 'noShow') onNoShow()
  }

  // Nav target: dropoff while InProgress (if known), otherwise pickup.
  const navToDropoff = order.status === 'InProgress' && hasDropoff
  const navLat = navToDropoff ? order.dropoffLat! : order.pickupLat
  const navLng = navToDropoff ? order.dropoffLng! : order.pickupLng
  const navLabel = navToDropoff ? order.dropoffAddress ?? undefined : order.pickupAddress

  // ETA line copy keys off the current leg (pickup pre-Start, dropoff after Start).
  const etaKey = order.status === 'InProgress' ? 'driver.ride.etaToDropoff' : 'driver.ride.etaToPickup'

  return (
    <BottomSheet
      open
      expanded={expanded}
      ariaLabelKey="driver.ride.sheetLabel"
      onClose={() => setExpanded(false)}
    >
      {reconciledNote && <StaleBanner role="alert">{t('driver.ride.reassigned')}</StaleBanner>}

      <PendingBadge count={pendingCount} />

      <div>
        <SectionLabel>{t('driver.ride.pickup')}</SectionLabel>
        <AddressText>{order.pickupAddress}</AddressText>
      </div>

      {order.dropoffAddress && (
        <div>
          <SectionLabel>{t('driver.ride.dropoff')}</SectionLabel>
          <DropoffText>{order.dropoffAddress}</DropoffText>
        </div>
      )}

      {etaMinutes != null && <EtaText>{t(etaKey, { min: etaMinutes })}</EtaText>}

      <div>
        <SectionLabel>{t('driver.ride.phone')}</SectionLabel>
        <PhoneLink href={`tel:${order.customerPhone}`}>{order.customerPhone}</PhoneLink>
      </div>

      {order.note && <NoteText>{order.note}</NoteText>}

      <NavStack>
        {buttons.navAction === 'navigate' && buttons.navLabel && (
          <NavHandoff lat={navLat} lng={navLng} label={navLabel} labelKey={buttons.navLabel} />
        )}
        <RideButton
          state={{ ...buttons, navAction: null, navLabel: null }}
          pending={isPending}
          onPrimary={handlePrimary}
          onNav={() => {}}
          onSecondary={handleSecondary}
        />
      </NavStack>
    </BottomSheet>
  )
}
