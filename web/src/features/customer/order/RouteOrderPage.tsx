import { useCallback, useEffect, useState } from 'react'
import styled from 'styled-components'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authStorage } from '../../../shared/api/auth-storage'
import { CustomerLoginStep } from '../login/CustomerLoginStep'
import { useOnlineStatus } from '../shell/useOnlineStatus'
import { useRouteOrder } from './useRouteOrder'
import { useCreateOrder } from './useCreateOrder'
import { usePriceQuote } from './usePriceQuote'
import { buildRouteOrderRequest, buildZoneOrderRequest, isAddressLocked } from './orderForm'
import { validateScheduledAt, minScheduledAt, maxScheduledAt } from './whenRules'
import { FixedPriceBadge } from './FixedPriceBadge'
import { AddressAutocomplete, type AddressValue } from './AddressAutocomplete'
import { PickupMap } from './PickupMap'
import { PassengerStepper } from './PassengerStepper'
import { WhenPicker, type WhenMode } from './WhenPicker'

const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
  padding: ${({ theme }) => theme.spacing.lg};
`

const Journey = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const NoteInput = styled.input`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
`

const Placeholder = styled.p`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.background};
  border: 1px dashed ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const MoreLink = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const SubmitButton = styled.button`
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.primary};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const Message = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.error};
`

const LoginPrompt = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};
`

const EMPTY: AddressValue = { address: '', lat: null, lng: null }

/**
 * Confirm-route order screen (/customer/order/route/:routeId). Route-type-driven: PointToPoint
 * shows a locked journey + optional pickup note; Zone/ZoneToZone let the customer enter an
 * in-zone pickup (+ dropoff for ZoneToZone) and the server POST /pricing/quote validates
 * zone containment (UC-006: pricing/quote IS the zone-validation mechanism — no client-side
 * polygon check). When (Hned / Na čas +20min…+7d), passengers 1–4, big fixed price. On
 * Objednat, if the customer is not logged in the inline CustomerLoginStep renders WITHOUT
 * unmounting the form (the parent owns all form state via local state, so everything
 * survives); on auth the order is created (reusing postCreateOrder, unwrapping { order })
 * and the app navigates to tracking via the returned publicCode.
 */
export function RouteOrderPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const online = useOnlineStatus()
  const { route } = useRouteOrder()
  const createOrder = useCreateOrder()

  const [passengers, setPassengers] = useState(1)
  const [whenMode, setWhenMode] = useState<WhenMode>('now')
  const [scheduledAtLocal, setScheduledAtLocal] = useState('')
  const [note, setNote] = useState('')
  const [showLogin, setShowLogin] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Zone / ZoneToZone only: the customer-entered endpoints. The server quote validates that
  // the pickup (and dropoff, for ZoneToZone) fall inside the route's zone(s).
  const [zonePickup, setZonePickup] = useState<AddressValue>(EMPTY)
  const [zoneDropoff, setZoneDropoff] = useState<AddressValue>(EMPTY)

  const isZone = route != null && !isAddressLocked(route)
  const needsDropoff = route?.type === 'ZoneToZone'

  const quote = usePriceQuote({
    pickupLat: isZone ? zonePickup.lat : null,
    pickupLng: isZone ? zonePickup.lng : null,
    dropoffLat: isZone && needsDropoff ? zoneDropoff.lat : null,
    dropoffLng: isZone && needsDropoff ? zoneDropoff.lng : null,
    // A logged-out customer must see the in-zone Fixed quote before the login step, so the
    // zone confirm screen quotes anonymously by fleet slug (A6 widened the policy).
    allowAnonymous: true,
  })

  // A Zone order is only valid when the server quote matched THIS route as a Fixed price
  // (the pickup — and dropoff, for ZoneToZone — is inside the zone). Any other result
  // (Estimate/Meter/unknown) means the pickup is outside the zone → "mimo zónu".
  const zoneFixed = isZone && quote.view?.kind === 'fixed' ? quote.view : null
  const zoneCoordsReady = isZone && zonePickup.lat != null && zonePickup.lng != null &&
    (!needsDropoff || (zoneDropoff.lat != null && zoneDropoff.lng != null))

  const toIso = useCallback((local: string): string | null => {
    if (!local) return null
    const ms = Date.parse(local)
    return Number.isNaN(ms) ? local : new Date(ms).toISOString()
  }, [])

  const handlePickupPin = useCallback((lat: number, lng: number) => {
    setZonePickup((prev) => ({ address: prev.address || t('customer.custom.myLocationLabel'), lat, lng }))
  }, [t])

  const submit = useCallback(async () => {
    if (!route) return
    setFormError(null)

    let scheduledAt: string | null = null
    if (whenMode === 'scheduled') {
      const iso = toIso(scheduledAtLocal)
      const verdict = iso ? validateScheduledAt(iso) : 'invalid'
      if (verdict === 'tooSoon') { setFormError('customer.order.errorTooSoon'); return }
      if (verdict === 'tooLate') { setFormError('customer.order.errorTooLate'); return }
      if (verdict === 'invalid') { setFormError('customer.order.errorScheduledInvalid'); return }
      scheduledAt = iso
    }

    const trimmedNote = note.trim() === '' ? null : note.trim()

    let req
    if (isZone) {
      // Zone/ZoneToZone: require a Fixed match from the server quote (pickup in zone).
      if (!zoneFixed || zonePickup.lat == null || zonePickup.lng == null) {
        setFormError('customer.order.outsideZone')
        return
      }
      req = buildZoneOrderRequest({
        route,
        pickup: { address: zonePickup.address, lat: zonePickup.lat, lng: zonePickup.lng },
        dropoff: needsDropoff && zoneDropoff.lat != null && zoneDropoff.lng != null
          ? { address: zoneDropoff.address, lat: zoneDropoff.lat, lng: zoneDropoff.lng }
          : null,
        passengers,
        scheduledAt,
        note: trimmedNote,
        quoteRouteId: zoneFixed.routeId,
        quotePriceCzk: zoneFixed.priceCzk,
      })
    } else {
      req = buildRouteOrderRequest({ route, passengers, scheduledAt, note: trimmedNote })
    }

    try {
      const created = await createOrder.mutateAsync(req)
      navigate(`/customer/t/${created.publicCode}`)
    } catch {
      setFormError('customer.order.errorCreateFailed')
    }
  }, [route, whenMode, scheduledAtLocal, toIso, passengers, note, isZone, zoneFixed, zonePickup, needsDropoff, zoneDropoff, createOrder, navigate])

  // Deep-link / hard-refresh with no nav-state and no warm cache cannot recover the
  // route (no route-detail endpoint pre-06) — bounce back Home.
  useEffect(() => {
    if (route === null) {
      navigate('/customer', { replace: true })
    }
  }, [route, navigate])

  if (!route) {
    return <Page><Message>{t('customer.order.routeNotFound')}</Message></Page>
  }

  function handleSubmitClick() {
    if (!online) {
      setFormError('customer.order.offlineBlocked')
      return
    }
    // Zone orders require a confirmed in-zone pickup (a Fixed quote) before we can submit.
    if (isZone && !zoneFixed) {
      setFormError(zoneCoordsReady ? 'customer.order.outsideZone' : 'customer.order.zonePickupRequired')
      return
    }
    if (authStorage.getAccessToken() === null) {
      setShowLogin(true)
      return
    }
    void submit()
  }

  const locked = isAddressLocked(route)
  // The quote runs only while authenticated (CustomerOnly gate on usePriceQuote). A logged-out
  // customer picks the pickup first, then logs in at Objednat; the quote resolves post-login.
  const showOutsideZone = isZone && zoneCoordsReady && quote.view != null && !zoneFixed && !quote.isLoading
  // A zone order can only be placed once the server quote confirms an in-zone Fixed match.
  // This holds for logged-out visitors too (the quote runs anonymously by slug), so the
  // disabled state no longer hinges on auth — a valid in-zone pickup enables Objednat, which
  // then routes a logged-out customer to the inline login.
  const submitDisabled = createOrder.isPending || (isZone && !zoneFixed)

  return (
    <Page>
      <Journey>{route.name}</Journey>
      <FixedPriceBadge priceCzk={route.priceCzk} />

      {!locked && (
        <>
          <AddressAutocomplete
            label="customer.order.zonePickupLabel"
            placeholder="customer.custom.pickupPlaceholder"
            value={zonePickup}
            onChange={setZonePickup}
            showUseMyLocation
          />
          <PickupMap lat={zonePickup.lat} lng={zonePickup.lng} onPinMove={handlePickupPin} />
          {needsDropoff && (
            <AddressAutocomplete
              label="customer.order.zoneDropoffLabel"
              placeholder="customer.custom.pickupPlaceholder"
              value={zoneDropoff}
              onChange={setZoneDropoff}
            />
          )}
          {quote.errorKey && <Placeholder role="status">{t(quote.errorKey)}</Placeholder>}
          {showOutsideZone && <Message role="alert">{t('customer.order.outsideZone')}</Message>}
          {zoneFixed && (
            <Placeholder role="status">{t('customer.order.zoneConfirmed')}</Placeholder>
          )}
        </>
      )}

      {locked && (
        <Field>
          {t('customer.order.noteLabel')}
          <NoteInput
            value={note}
            placeholder={t('customer.order.notePlaceholder')}
            onChange={e => setNote(e.target.value)}
          />
        </Field>
      )}

      <WhenPicker
        mode={whenMode}
        onModeChange={setWhenMode}
        scheduledAt={scheduledAtLocal}
        onScheduledAtChange={setScheduledAtLocal}
        min={toLocalInput(minScheduledAt())}
        max={toLocalInput(maxScheduledAt())}
      />

      <Field as="div">
        {t('customer.order.passengersLabel')}
        <PassengerStepper value={passengers} onChange={setPassengers} />
        <MoreLink>{t('customer.order.morePassengers')}</MoreLink>
      </Field>

      {formError && <Message role="alert">{t(formError)}</Message>}

      {showLogin ? (
        <>
          <LoginPrompt>{t('customer.order.loginPrompt')}</LoginPrompt>
          <CustomerLoginStep onAuthenticated={() => { setShowLogin(false); void submit() }} />
        </>
      ) : (
        <SubmitButton type="button" onClick={handleSubmitClick} disabled={submitDisabled}>
          {createOrder.isPending ? t('customer.order.submitting') : t('customer.order.submit')}
        </SubmitButton>
      )}
    </Page>
  )
}

/** Converts a Date to a datetime-local input value (local time, no seconds). */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
