import { useState, type ReactNode } from 'react'
import styled from 'styled-components'
import { useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authStorage } from '../../../shared/api/auth-storage'
import { ensureFleetSlug } from '../shell/ensureFleetSlug'
import { CustomerMapShell } from '../shell/CustomerMapShell'
import { CallButton } from '../shell/CallButton'
import type { LatLng } from '../shell/mapCamera'
import { resolveTrackingMode } from './trackingMode'
import { deriveHeadline, type TrackVm } from './headlineRules'
import { useTrackingAuthed } from './useTrackingAuthed'
import { useTrackingPublic } from './useTrackingPublic'
import { useCancelOrder } from './useCancelOrder'
import { selectCarMarker } from './trackingMarker'
import { TrackingSheet } from './TrackingSheet'
import { PushPrompt } from './PushPrompt'
import { RatingForm } from './RatingForm'

// Standalone meta-state surface (expired / login-needed / loading): these are NOT order-status
// phases (TrackingSheet owns only the 6 phases). They render full-viewport with the heading
// preserved as an <h2> ('Odkaz vypršel') and the call fallback — a load-bearing e2e contract
// (customer.spec.ts locates getByRole('heading', { name: 'Odkaz vypršel' })).
const Centered = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  gap: ${({ theme }) => theme.spacing.md};
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.background};
`

const MetaTitle = styled.h2`
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

/**
 * Map-first customer tracking screen (/customer/t/:code) — UC-016 WI-4.
 *
 * A SIBLING leaf of the CustomerLayout group (mirroring MapOrderPage / /customer/login): it owns
 * the full-viewport CustomerMapShell and re-runs the one-shot slug/silent-refresh initializers
 * itself, so it must NOT nest under CustomerLayout (which would double-invoke them).
 *
 * - Authed (logged-in): reuses the single /hubs/fleet SignalR connection, Subscribe(orderId),
 *   live headline (cache-patch + stale guard) and moving car marker (useTrackingAuthed).
 * - Public (logged-out SMS link, ?k=token): polls GET public/track every 10 s (useTrackingPublic);
 *   a 410 shows "Odkaz vypršel" + the call button.
 *
 * Both modes build ONE normalized TrackVm + orderId + marker coords and feed the SAME TrackingSheet
 * + shell (AC#5 parity). Public degrades gracefully (ETA null → line omitted; no cancel/rating
 * without an id/authed customer). The full-bleed map background renders the smoothly-interpolated
 * car marker inside its lazy chunk (leaflet never enters the eager page chunk).
 */
export function TrackingPage(): ReactNode {
  const { t } = useTranslation()
  const { code = '' } = useParams<{ code: string }>()
  const [searchParams] = useSearchParams()
  const linkToken = searchParams.get('k')

  // F1 (design-review HIGH): persist the resolved slug synchronously, during render, BEFORE any
  // public/auth fetch effect fires — the CustomerLoginPage precedent (a sibling for the same F-05
  // reason). The meta-state early-returns below never mount CustomerMapShell, so its own
  // ensureFleetSlug initializer would not run; hoisting it here guarantees the public/track call
  // (and the branding query) carry X-Fleet-Slug and do not 404 on localhost. Idempotent — safe to
  // run again inside CustomerMapShell in the non-meta case (CLAUDE.md → "F-05 fleet-slug resolution").
  useState(ensureFleetSlug)

  const hasToken = authStorage.getAccessToken() != null
  const mode = resolveTrackingMode({ hasToken, linkToken })

  // Both hooks are called unconditionally (rules of hooks); each is gated internally and only
  // fetches for the active mode.
  const authed = useTrackingAuthed(mode === 'authed' ? code : '')
  const publicTrack = useTrackingPublic(mode === 'public' ? code : '', mode === 'public' ? linkToken : null)

  const orderId = mode === 'authed' ? authed.orderId : null
  const cancel = useCancelOrder(orderId)

  // ── Meta-states (not order-status phases) ────────────────────────────────────
  // Expired logged-out link: "Odkaz vypršel" + the call button (AC #3). Kept as a heading-role
  // element (F2 — e2e locates getByRole('heading', { name: 'Odkaz vypršel' })).
  if (mode === 'public' && publicTrack.isExpired) {
    return (
      <Centered>
        <MetaTitle>{t('customer.tracking.expired')}</MetaTitle>
        <Muted>{t('customer.tracking.expiredHint')}</Muted>
        <CallButton phone={undefined} />
      </Centered>
    )
  }

  // Logged out with no link token: prompt login + a call fallback.
  if (mode === 'none') {
    return (
      <Centered>
        <Muted>{t('customer.tracking.loginNeeded')}</Muted>
        <CallButton phone={undefined} />
      </Centered>
    )
  }

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

  // ── Build ONE normalized VM + marker coords from the active mode (AC#5 parity) ─
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

  const descriptor = deriveHeadline(vm)

  const carMarker: LatLng | null =
    mode === 'authed'
      ? authed.carMarker
      : selectCarMarker({ livePosition: null, fallbackPosition: publicTrack.data?.position ?? null })

  const pickupMarker: LatLng | null = mode === 'authed' ? authed.pickup : null

  // Camera frames [car, pickup] when both are known (fitBounds); a single point → setView; none →
  // no move (the shell's CameraController reads cameraTarget.length). No new camera math.
  const cameraTarget: LatLng[] = [carMarker, pickupMarker].filter((p): p is LatLng => p != null)

  // The rating form is authed-only: POST orders/{id}/rating is CustomerOnly and needs the resolved
  // order id (a logged-out public viewer sees the default seam text). Mounted only on Completed
  // (descriptor.showRating) to avoid the orders/mine lookup otherwise.
  const ratingSlot =
    mode === 'authed' && descriptor.showRating ? <RatingForm publicCode={code} /> : undefined

  return (
    <CustomerMapShell
      carMarker={carMarker}
      pickupMarker={pickupMarker}
      cameraTarget={cameraTarget}
      bottomSlot={
        <>
          <TrackingSheet
            vm={vm}
            descriptor={descriptor}
            orderId={orderId}
            code={code}
            cancel={cancel}
            ratingSlot={ratingSlot}
          />
          <PushPrompt />
        </>
      }
    />
  )
}
