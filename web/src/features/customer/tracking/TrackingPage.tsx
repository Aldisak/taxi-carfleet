import { useState, type ReactNode } from 'react'
import styled from 'styled-components'
import { useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authStorage } from '../../../shared/api/auth-storage'
import { formatCzk } from '../../../shared/format/money'
import { CallButton } from '../shell/CallButton'
import { resolveTrackingMode } from './trackingMode'
import { deriveHeadline, type TrackVm } from './headlineRules'
import { useTrackingAuthed } from './useTrackingAuthed'
import { useTrackingPublic } from './useTrackingPublic'
import { useCancelOrder } from './useCancelOrder'
import { selectCarMarker } from './trackingMarker'
import { StatusHeadline } from './StatusHeadline'
import { TrackingMap } from './TrackingMap'
import { CancelDialog } from './CancelDialog'
import { PushPrompt } from './PushPrompt'
import { RatingForm } from './RatingForm'

const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  padding-bottom: ${({ theme }) => theme.spacing.xl};
`

const Centered = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  align-items: center;
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl} ${({ theme }) => theme.spacing.md};
`

const ExpiredTitle = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

const Muted = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const CancelButton = styled.button`
  width: calc(100% - 2 * ${({ theme }) => theme.spacing.md});
  margin: 0 ${({ theme }) => theme.spacing.md};
  min-height: ${({ theme }) => theme.touchTargets.min};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.error};
  border: 1px solid ${({ theme }) => theme.colors.error};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.error};
    outline-offset: 2px;
  }
`

const Details = styled.details`
  margin: 0 ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.surface};
`

const Summary = styled.summary`
  min-height: ${({ theme }) => theme.touchTargets.min};
  display: flex;
  align-items: center;
  padding: 0 ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
`

const DetailRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`

const DetailLabel = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`

const DetailValue = styled.span`
  color: ${({ theme }) => theme.colors.text};
  text-align: right;
`

const ErrorText = styled.p`
  margin: 0 ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.error};
`

/** Formats an optional ISO timestamp in Europe/Prague, or the ASAP label when null. */
function formatPragueTime(iso: string | null, asapLabel: string): string {
  if (!iso) return asapLabel
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return asapLabel
  return new Intl.DateTimeFormat('cs-CZ', {
    timeZone: 'Europe/Prague',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

interface DetailsBlockProps {
  code: string
  vm: TrackVm
  pickupAddress: string | null
  scheduledAt: string | null
}

function DetailsBlock({ code, vm, pickupAddress, scheduledAt }: DetailsBlockProps) {
  const { t } = useTranslation()
  return (
    <Details>
      <Summary>{t('customer.tracking.detailsTitle')}</Summary>
      <DetailRow>
        <DetailLabel>{t('customer.tracking.codeLabel')}</DetailLabel>
        <DetailValue>{code}</DetailValue>
      </DetailRow>
      {pickupAddress && (
        <DetailRow>
          <DetailLabel>{t('customer.tracking.pickupAddress')}</DetailLabel>
          <DetailValue>{pickupAddress}</DetailValue>
        </DetailRow>
      )}
      {vm.dropoffAddress && (
        <DetailRow>
          <DetailLabel>{t('customer.tracking.dropoffAddress')}</DetailLabel>
          <DetailValue>{vm.dropoffAddress}</DetailValue>
        </DetailRow>
      )}
      <DetailRow>
        <DetailLabel>{t('customer.tracking.timeLabel')}</DetailLabel>
        <DetailValue>{formatPragueTime(scheduledAt, t('customer.tracking.timeAsap'))}</DetailValue>
      </DetailRow>
      {vm.priceCzk != null && (
        <DetailRow>
          <DetailLabel>{t('customer.tracking.priceLabel')}</DetailLabel>
          <DetailValue>{formatCzk(vm.priceCzk)}</DetailValue>
        </DetailRow>
      )}
      {vm.driverFirstName && (
        <DetailRow>
          <DetailLabel>{t('customer.tracking.driverLabel')}</DetailLabel>
          <DetailValue>{vm.driverFirstName}</DetailValue>
        </DetailRow>
      )}
      {(vm.vehicleColor || vm.vehiclePlate) && (
        <DetailRow>
          <DetailLabel>{t('customer.tracking.vehicleLabel')}</DetailLabel>
          <DetailValue>{[vm.vehicleColor, vm.vehiclePlate].filter(Boolean).join(' · ')}</DetailValue>
        </DetailRow>
      )}
    </Details>
  )
}

/**
 * Two-mode customer tracking screen (/customer/t/:code).
 *
 * - Authed (logged-in): reuses the single /hubs/fleet SignalR connection, Subscribe(orderId),
 *   live headline (cache-patch + stale guard) and moving car marker (useTrackingAuthed).
 * - Public (logged-out SMS link, ?k=token): polls GET public/track every 10 s (useTrackingPublic);
 *   a 410 shows "Odkaz vypršel" + the call button.
 *
 * The headline is a pure mapping (statusHeadline.ts). Cancel is offered only in New/Assigned/
 * Accepted via a focus-trapping confirm dialog (post-Accepted hint). A rating seam is exposed on
 * Completed (B-rating fills it). The push-subscription prompt (permission only) shows after the
 * first order. Offline/SignalR-down falls back to the last cached state (never a blank screen).
 */
export function TrackingPage(): ReactNode {
  const { t } = useTranslation()
  const { code = '' } = useParams<{ code: string }>()
  const [searchParams] = useSearchParams()
  const linkToken = searchParams.get('k')

  const hasToken = authStorage.getAccessToken() != null
  const mode = resolveTrackingMode({ hasToken, linkToken })

  // Both hooks are called unconditionally (rules of hooks); each is gated internally and only
  // fetches for the active mode.
  const authed = useTrackingAuthed(mode === 'authed' ? code : '')
  const publicTrack = useTrackingPublic(mode === 'public' ? code : '', mode === 'public' ? linkToken : null)

  const [showCancel, setShowCancel] = useState(false)
  const orderId = mode === 'authed' ? authed.orderId : null
  const cancel = useCancelOrder(orderId)

  // Expired logged-out link: show "Odkaz vypršel" + the call button (AC #3).
  if (mode === 'public' && publicTrack.isExpired) {
    return (
      <Centered>
        <ExpiredTitle>{t('customer.tracking.expired')}</ExpiredTitle>
        <Muted>{t('customer.tracking.expiredHint')}</Muted>
        <CallButton phone={undefined} />
      </Centered>
    )
  }

  // Logged out with no link token: nothing to show.
  if (mode === 'none') {
    return (
      <Centered>
        <Muted>{t('customer.tracking.loginNeeded')}</Muted>
        <CallButton phone={undefined} />
      </Centered>
    )
  }

  // Build the view-model + marker from the active mode.
  const vm: TrackVm =
    mode === 'authed'
      ? authed.vm
      : publicTrack.data
        ? {
            status: publicTrack.data.status,
            driverFirstName: publicTrack.data.driverFirstName,
            etaMinutes: publicTrack.data.etaMinutes ?? null,
            vehiclePlate: publicTrack.data.vehiclePlate,
            vehicleColor: publicTrack.data.vehicleColor,
            dropoffAddress: publicTrack.data.dropoffAddress,
            priceCzk: publicTrack.data.displayPriceCzk ?? null,
          }
        : { status: 'New', driverFirstName: null, etaMinutes: null, vehiclePlate: null, vehicleColor: null, dropoffAddress: null, priceCzk: null }

  const isLoading = mode === 'authed' ? authed.isLoading : publicTrack.isLoading
  const hasData = mode === 'authed' ? authed.orderId != null || !authed.isLoading : publicTrack.data != null

  if (isLoading && !hasData) {
    return (
      <Centered>
        <Muted>{t('customer.tracking.loading')}</Muted>
        <CallButton phone={undefined} />
      </Centered>
    )
  }

  const descriptor = deriveHeadline(vm)

  const carMarker =
    mode === 'authed'
      ? authed.carMarker
      : selectCarMarker({ livePosition: null, fallbackPosition: publicTrack.data?.position ?? null })

  const pickupMarker = mode === 'authed' ? authed.pickup : null
  const pickupAddress = mode === 'authed' ? authed.pickupAddress : publicTrack.data?.pickupAddress ?? null
  const scheduledAt = mode === 'authed' ? authed.scheduledAt : publicTrack.data?.scheduledAt ?? null

  // The rating form is authed-only: POST orders/{id}/rating is CustomerOnly and needs the
  // resolved order id (a logged-out public viewer sees the default seam text). It is mounted only
  // on the Completed state (descriptor.showRating) to avoid the orders/mine lookup otherwise.
  const ratingSlot =
    mode === 'authed' && descriptor.showRating ? <RatingForm publicCode={code} /> : undefined

  return (
    <Page>
      <StatusHeadline descriptor={descriptor} vm={vm} ratingSlot={ratingSlot} />

      <TrackingMap car={carMarker} pickup={pickupMarker} />

      {descriptor.showCancel && orderId && (
        <CancelButton type="button" onClick={() => setShowCancel(true)}>
          {t('customer.tracking.cancel')}
        </CancelButton>
      )}

      {cancel.errorKey && !showCancel && <ErrorText role="alert">{t(cancel.errorKey)}</ErrorText>}

      <DetailsBlock code={code} vm={vm} pickupAddress={pickupAddress} scheduledAt={scheduledAt} />

      {descriptor.showCall && <CallButton phone={undefined} />}

      <PushPrompt />

      {showCancel && (
        <CancelDialog
          showAcceptedHint={descriptor.showAcceptedHint}
          isPending={cancel.isPending}
          errorKey={cancel.errorKey}
          onConfirm={() => {
            // Branch on the returned outcome (NOT the captured cancel.errorKey, which is a stale
            // closure frozen at the render when the dialog opened): close only on success, keep
            // the dialog open on failure so its in-dialog error (e.g. 409 "už nelze zrušit") shows.
            void cancel.cancel().then((ok) => {
              if (ok) setShowCancel(false)
            })
          }}
          onDismiss={() => setShowCancel(false)}
        />
      )}
    </Page>
  )
}
