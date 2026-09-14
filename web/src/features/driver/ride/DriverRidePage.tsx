import { useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useDriverMe } from '../home/useDriverMe'
import { useRideRestore } from './useRideRestore'
import { useLiveClear } from './useLiveClear'
import { useActiveOrder } from './useActiveOrder'
import { useRideTransition } from './useRideTransition'
import { deriveRideButtons } from './rideButtonState'
import { RideButton } from './RideButton'
import { NavHandoff } from './NavHandoff'
import { RideMapStrip } from './RideMapStrip'
import { useOwnPositionStore } from '../position/useOwnPositionStore'
import { useWakeLock } from '../position/useWakeLock'
import { useQueuePendingCount } from '../queue/useTransitionQueue'
import { PendingBadge } from '../queue/PendingBadge'

const Page = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: ${({ theme }) => theme.colors.background};
`

const Body = styled.div`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
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

const PhoneLink = styled.a`
  display: inline-flex;
  align-items: center;
  min-height: ${({ theme }) => theme.touchTargets.min};
  color: ${({ theme }) => theme.colors.primary};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  text-decoration: none;
`

const Footer = styled.div`
  margin-top: auto;
  padding-top: ${({ theme }) => theme.spacing.md};
`

const EmptyState = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.lg};
  text-align: center;
`

const StaleBanner = styled.div`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.warning};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  text-align: center;
`

const BackLink = styled.a`
  color: ${({ theme }) => theme.colors.primary};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
`

/**
 * Active ride screen (/driver/ride). Status-driven big buttons, tap-to-call, collapsible map strip,
 * nav handoff, and F-04 live-clear on mid-ride reassignment. State is restored on mount from
 * the server (authoritative) + IndexedDB.
 */
export function DriverRidePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: me } = useDriverMe()
  const myDriverId = me?.driverId

  // Restore on mount and react live to reassignment.
  useRideRestore(myDriverId)
  useLiveClear(myDriverId)

  const { order, noShowEnabled, noShowCountdownSeconds } = useActiveOrder()
  const { isPending, arrive, start, cancelNoShow } = useRideTransition()
  const pendingCount = useQueuePendingCount()
  // A transition that reconciled after a definitive conflict (the order advanced past us).
  const [reconciledNote, setReconciledNote] = useState(false)

  // Keep the screen awake while on an active ride (feature-detected; no-op otherwise).
  useWakeLock(order != null)
  // Live own-position for the map strip's blue pin.
  const ownPosition = useOwnPositionStore(s => s.position)

  if (!order) {
    return (
      <Page>
        <EmptyState>
          <p>{t('driver.ride.noRide')}</p>
          <BackLink href="/driver">{t('driver.ride.backHome')}</BackLink>
        </EmptyState>
      </Page>
    )
  }

  const hasDropoff = order.dropoffLat != null && order.dropoffLng != null
  const buttons = deriveRideButtons(order.status, noShowEnabled, noShowCountdownSeconds, hasDropoff)

  async function runTransition(fn: (id: string) => Promise<{ type: string }>) {
    setReconciledNote(false)
    const outcome = await fn(order!.id)
    // 'stale' means a definitive conflict (terminal 409 / 404 / KeyReused): the queue already
    // dropped this order's queued items and reconciled the order from GET /orders/{id} (B3c-1).
    // Surface a short note; the store now holds the server-authoritative state (or was cleared).
    // 'queued' (offline) is surfaced by the PendingBadge, not a banner.
    if (outcome.type === 'stale') setReconciledNote(true)
  }

  function handlePrimary() {
    if (buttons.primaryAction === 'arrive') void runTransition(arrive)
    else if (buttons.primaryAction === 'start') void runTransition(start)
    else if (buttons.primaryAction === 'complete') navigate('/driver/ride/complete')
  }

  function handleSecondary() {
    if (buttons.secondaryAction === 'noShow') void runTransition(cancelNoShow)
  }

  // Nav target: dropoff while InProgress (if known), otherwise pickup.
  const navToDropoff = order.status === 'InProgress' && hasDropoff
  const navLat = navToDropoff ? order.dropoffLat! : order.pickupLat
  const navLng = navToDropoff ? order.dropoffLng! : order.pickupLng
  const navLabel = navToDropoff ? order.dropoffAddress ?? undefined : order.pickupAddress

  return (
    <Page>
      {reconciledNote && <StaleBanner role="alert">{t('driver.ride.reassigned')}</StaleBanner>}

      <Body>
        <PendingBadge count={pendingCount} />

        <RideMapStrip
          pickupLat={order.pickupLat}
          pickupLng={order.pickupLng}
          dropoffLat={order.dropoffLat}
          dropoffLng={order.dropoffLng}
          ownLat={ownPosition?.lat ?? null}
          ownLng={ownPosition?.lng ?? null}
        />

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

        <div>
          <SectionLabel>{t('driver.ride.phone')}</SectionLabel>
          <PhoneLink href={`tel:${order.customerPhone}`}>{order.customerPhone}</PhoneLink>
        </div>

        {order.note && <NoteText>{order.note}</NoteText>}

        <Footer>
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
        </Footer>
      </Body>
    </Page>
  )
}

const NavStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`
