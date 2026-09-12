import { useState, useCallback, useRef } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import type { OrderDetailDto } from '../../../shared/api/client'
import { CountdownRing } from './CountdownRing'
import { PriceBadge } from './PriceBadge'
import { DeclineReasons } from './DeclineReasons'
import { useOfferAccept } from './useOfferAccept'
import { useOfferDecline } from './useOfferDecline'
import { useOfferSound } from './useOfferSound'
import { useOfferRoute } from './useOfferRoute'

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: ${({ theme }) => theme.colors.background};
  z-index: 1000;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`

const Content = styled.div`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`

const PickupAddress = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
  line-height: ${({ theme }) => theme.typography.lineHeight};
`

const MetaRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: center;
`

const MetaChip = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  padding: 2px 10px;
`

const SectionLabel = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.textSecondary};
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

const Footer = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  background: ${({ theme }) => theme.colors.surface};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const AcceptButton = styled.button`
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.primary};
  background: ${({ theme }) => theme.colors.success};
  color: #ffffff;
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
`

const OfflineHint = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.warning};
  text-align: center;
  margin: 0;
`

const ToastBanner = styled.div`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.error};
  color: #ffffff;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  text-align: center;
`

interface OfferTakeoverProps {
  dto: OrderDetailDto
  expiresAt: string
  onDismiss: () => void
}

type Phase = 'offer' | 'declining' | 'expired'

/**
 * Full-screen offer takeover. Shown when NewOrderOffered arrives.
 * - Countdown ring (server-time-based, totalSeconds computed on mount from expiresAt − now).
 * - Distance/ETA to pickup via GPS + geo/route (degrades gracefully when unavailable).
 * - Accept (64px green, double-tap guard) / Decline (reason required).
 * - F-08: 404 or 409 → dismiss + stale toast.
 * - Network error → stay open with offline hint (no queue).
 * - Expiry → auto-dismiss with expired message.
 */
export function OfferTakeover({ dto, expiresAt, onDismiss }: OfferTakeoverProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { isPending: isAccepting, accept } = useOfferAccept()
  const { isPending: isDeclining, decline } = useOfferDecline()
  const [phase, setPhase] = useState<Phase>('offer')
  const [selectedReason, setSelectedReason] = useState<string | null>(null)
  const [showReasonError, setShowReasonError] = useState(false)
  const [offlineHint, setOfflineHint] = useState(false)
  const [staleToast, setStaleToast] = useState(false)

  // Compute totalSeconds once on mount from the server-provided expiresAt
  const totalSecondsRef = useRef<number>(
    Math.max(1, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  )

  // Distance/ETA to pickup via driver GPS + geo/route
  const { distanceMeters, durationSeconds } = useOfferRoute(dto.pickupLat, dto.pickupLng)

  useOfferSound(phase === 'offer')

  const handleExpired = useCallback(() => {
    setPhase('expired')
    setTimeout(() => { onDismiss() }, 2000)
  }, [onDismiss])

  async function handleAccept() {
    setOfflineHint(false)
    const outcome = await accept(dto.id)
    if (outcome.type === 'success') {
      navigate('/d/ride')
      onDismiss()
    } else if (outcome.type === 'stale') {
      setStaleToast(true)
      setTimeout(() => { onDismiss() }, 2000)
    } else {
      // offline
      setOfflineHint(true)
    }
  }

  async function handleDeclineConfirm() {
    if (!selectedReason) {
      setShowReasonError(true)
      return
    }
    setOfflineHint(false)
    const outcome = await decline(dto.id, selectedReason)
    if (outcome.type === 'success') {
      onDismiss()
    } else if (outcome.type === 'stale') {
      setStaleToast(true)
      setTimeout(() => { onDismiss() }, 2000)
    } else if (outcome.type === 'noReason') {
      setShowReasonError(true)
    } else {
      // offline
      setOfflineHint(true)
    }
  }

  if (phase === 'expired') {
    return (
      <Overlay role="dialog" aria-modal="true" aria-label={t('driver.offer.expired')}>
        <Content style={{ alignItems: 'center', justifyContent: 'center' }}>
          <p>{t('driver.offer.expired')}</p>
        </Content>
      </Overlay>
    )
  }

  return (
    <Overlay role="dialog" aria-modal="true" aria-label={t('driver.offer.pickup')}>
      {staleToast && (
        <ToastBanner role="alert">{t('driver.offer.staleOffer')}</ToastBanner>
      )}

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

        {(distanceMeters != null || durationSeconds != null) && (
          <MetaRow>
            {distanceMeters != null && (
              <MetaChip>
                {distanceMeters >= 1000
                  ? `${(distanceMeters / 1000).toFixed(1)} km`
                  : `${distanceMeters} m`}
              </MetaChip>
            )}
            {durationSeconds != null && (
              <MetaChip>
                {Math.ceil(durationSeconds / 60)} min
              </MetaChip>
            )}
          </MetaRow>
        )}

        {dto.dropoffAddress && (
          <div>
            <SectionLabel>{t('driver.offer.dropoff')}</SectionLabel>
            <DropoffText>{dto.dropoffAddress}</DropoffText>
          </div>
        )}

        {(dto.customerName != null || dto.scheduledAt != null) && (
          <MetaRow>
            {dto.customerName && (
              <MetaChip>{dto.customerName}</MetaChip>
            )}
            {dto.scheduledAt && (
              <MetaChip>{t('driver.offer.scheduledAt')}: {new Date(dto.scheduledAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</MetaChip>
            )}
          </MetaRow>
        )}

        {dto.note && <NoteText>{dto.note}</NoteText>}

        {phase === 'declining' && (
          <DeclineReasons
            selectedReason={selectedReason}
            onSelect={r => { setSelectedReason(r); setShowReasonError(false) }}
            showError={showReasonError}
          />
        )}

        {offlineHint && (
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
            <DeclineButton
              type="button"
              onClick={() => setPhase('declining')}
            >
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
            <DeclineButton
              type="button"
              onClick={() => setPhase('offer')}
            >
              ← {t('driver.offer.accept')}
            </DeclineButton>
          </>
        )}
      </Footer>
    </Overlay>
  )
}
