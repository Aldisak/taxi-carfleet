import { useState, useRef } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import type { OrderDetailDto } from '../../../shared/api/client'
import { CountdownRing } from './CountdownRing'
import { PriceBadge } from './PriceBadge'
import { DeclineReasons } from './DeclineReasons'
import { useOfferAccept } from './useOfferAccept'
import { useOfferDecline } from './useOfferDecline'
import { useOfferSound } from './useOfferSound'
import { useOfferRoute } from './useOfferRoute'
import { offerActionOutcome, type OfferCardPhase, type OfferActionKind } from './offerCardState'
import { reconcileActiveRide } from '../ride/useRideRestore'
import { useActiveOrderStore } from '../ride/useActiveOrderStore'

const Card = styled.section`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: ${({ theme }) => theme.zIndex.overlay};
  margin: ${({ theme }) => theme.spacing.sm};
  padding-top: env(safe-area-inset-top);
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`

const Banner = styled.div`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.error};
  color: ${({ theme }) => theme.colors.textOnPrimary};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  text-align: center;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
`

const Content = styled.div`
  padding: 0 ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`

const SectionLabel = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`

const PickupAddress = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
  line-height: ${({ theme }) => theme.typography.lineHeight};
`

const DropoffText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
`

const MetaChip = styled.span`
  align-self: flex-start;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
`

const OfflineHint = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.warning};
  text-align: center;
  margin: 0;
`

const ExpiredText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  text-align: center;
  margin: 0;
  padding: ${({ theme }) => theme.spacing.lg};
`

const Footer = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const AcceptButton = styled.button`
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.primary};
  background: ${({ theme }) => theme.colors.success};
  color: ${({ theme }) => theme.colors.textOnPrimary};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

const DeclineButton = styled.button`
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.min};
  background: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`

interface OfferCardProps {
  dto: OrderDetailDto
  expiresAt: string
  onDismiss: () => void
}

/**
 * Top-anchored offer card overlaid on the driver map (UC-019 WI-2).
 * Replaces the full-screen OfferTakeover dialog with a `region` card.
 *
 * - Countdown ring (server-time-based, totalSeconds computed once on mount).
 * - Distance/ETA to pickup via GPS + geo/route (degrades gracefully).
 * - Accept (reuse useOfferAccept) — on success hydrates useActiveOrderStore from the
 *   server-authoritative reconcile (AC#6: GET /drivers/me → getOrder) so the shared
 *   /driver screen reactively renders the ride view with NO route change (WI-5 defect
 *   fix: WI-5 removed the /driver/ride navigation-as-hydration-trigger without a
 *   replacement, leaving the store null after accept). Then calls onDismiss ONLY; it
 *   never navigates.
 * - Decline (reuse useOfferDecline + DeclineReasons) with a reason-required step.
 * - Branch decisions routed through offerActionOutcome (pure, WI-1).
 * - F-08: 404/409 → stale banner + dismiss after 2000ms; network error → offline hint.
 * - Expiry → expired message → dismiss after 2000ms.
 */
export function OfferCard({ dto, expiresAt, onDismiss }: OfferCardProps) {
  const { t } = useTranslation()
  const { isPending: isAccepting, accept } = useOfferAccept()
  const { isPending: isDeclining, decline } = useOfferDecline()
  // ATOMIC one-field selector (CLAUDE.md laneB3c zustand-object-selector loop trap).
  const setOrder = useActiveOrderStore(s => s.setOrder)
  const [phase, setPhase] = useState<OfferCardPhase>('offer')
  const [selectedReason, setSelectedReason] = useState<string | null>(null)
  const [showReasonError, setShowReasonError] = useState(false)
  const [showOffline, setShowOffline] = useState(false)
  const [showStale, setShowStale] = useState(false)

  // Compute totalSeconds once on mount from the server-provided expiresAt.
  const totalSecondsRef = useRef<number>(
    Math.max(1, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  )

  const { distanceMeters, durationSeconds } = useOfferRoute(dto.pickupLat, dto.pickupLng)

  useOfferSound(phase === 'offer')

  function applyDecision(kind: OfferActionKind, current: OfferCardPhase) {
    const d = offerActionOutcome(kind, current)
    setPhase(d.nextPhase)
    setShowOffline(d.showOffline)
    setShowStale(d.showStale)
    setShowReasonError(d.showReasonError)
    if (d.dismissAfterMs === 0) {
      onDismiss()
    } else if (d.dismissAfterMs != null) {
      setTimeout(() => { onDismiss() }, d.dismissAfterMs)
    }
  }

  function handleExpired() {
    setPhase('expired')
    setTimeout(() => { onDismiss() }, 2000)
  }

  async function handleAccept() {
    const outcome = await accept(dto.id)
    if (outcome.type === 'noop') return
    if (outcome.type === 'success') {
      // Hydrate the active-ride store from the server (AC#6 authoritative reconcile):
      // POST accept has committed, so GET /drivers/me now carries the activeOrderId.
      // This makes the state-driven /driver screen render the ride view with NO route
      // change. Fire-and-forget so onDismiss (below) is NOT blocked and the no-navigate
      // contract is preserved. reconcileActiveRide fetches /drivers/me itself and ignores
      // its arg, so no driverId lookup is needed here.
      void reconcileActiveRide('').then(r => {
        if (r.outcome === 'active' && r.order) setOrder(r.order)
      })
    }
    applyDecision(outcome.type, phase)
  }

  async function handleDeclineConfirm() {
    if (!selectedReason) {
      applyDecision('noReason', phase)
      return
    }
    const outcome = await decline(dto.id, selectedReason)
    applyDecision(outcome.type, phase)
  }

  const distanceEta =
    distanceMeters != null && durationSeconds != null
      ? t('driver.offer.distanceEta', {
          km: (distanceMeters / 1000).toFixed(1),
          min: Math.ceil(durationSeconds / 60),
        })
      : null

  return (
    <Card role="region" aria-label={t('driver.offer.boxLabel')}>
      {showStale && <Banner role="alert">{t('driver.offer.staleOffer')}</Banner>}

      {phase === 'expired' && !showStale ? (
        <ExpiredText>{t('driver.offer.expired')}</ExpiredText>
      ) : (
        <>
          <Header>
            <CountdownRing
              expiresAt={expiresAt}
              totalSeconds={totalSecondsRef.current}
              onExpired={handleExpired}
            />
            <PriceBadge
              priceType={dto.priceType}
              fixedPriceCzk={dto.fixedPriceCzk}
              estimatedPriceCzk={dto.estimatedPriceCzk}
            />
          </Header>

          <Content>
            <div>
              <SectionLabel>{t('driver.offer.pickup')}</SectionLabel>
              <PickupAddress>{dto.pickupAddress}</PickupAddress>
            </div>

            {distanceEta != null && <MetaChip>{distanceEta}</MetaChip>}

            {dto.dropoffAddress && (
              <div>
                <SectionLabel>{t('driver.offer.dropoff')}</SectionLabel>
                <DropoffText>{dto.dropoffAddress}</DropoffText>
              </div>
            )}

            {phase === 'declining' && (
              <DeclineReasons
                selectedReason={selectedReason}
                onSelect={r => { setSelectedReason(r); setShowReasonError(false) }}
                showError={showReasonError}
              />
            )}

            {showOffline && (
              <OfflineHint role="alert">{t('driver.offer.offlineHint')}</OfflineHint>
            )}
          </Content>

          <Footer>
            {phase === 'offer' ? (
              <>
                <AcceptButton
                  type="button"
                  disabled={isAccepting}
                  onClick={() => { void handleAccept() }}
                >
                  {isAccepting ? t('driver.offer.accepting') : t('driver.offer.accept')}
                </AcceptButton>
                <DeclineButton type="button" onClick={() => setPhase('declining')}>
                  {t('driver.offer.decline')}
                </DeclineButton>
              </>
            ) : (
              <>
                <AcceptButton
                  type="button"
                  disabled={isDeclining}
                  onClick={() => { void handleDeclineConfirm() }}
                >
                  {isDeclining ? t('driver.offer.declining') : t('driver.offer.decline')}
                </AcceptButton>
                <DeclineButton type="button" onClick={() => setPhase('offer')}>
                  {t('driver.offer.accept')}
                </DeclineButton>
              </>
            )}
          </Footer>
        </>
      )}
    </Card>
  )
}
