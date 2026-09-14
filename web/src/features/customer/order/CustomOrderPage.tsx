import { useCallback, useState } from 'react'
import styled from 'styled-components'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { REORDER_STATE_KEY, type ReorderDraft } from '../history/reorder'
import { authStorage } from '../../../shared/api/auth-storage'
import type { CreateOrderRequest } from '../../../shared/api/client'
import { CustomerLoginStep } from '../login/CustomerLoginStep'
import { useOnlineStatus } from '../shell/useOnlineStatus'
import { useCreateOrder } from './useCreateOrder'
import { usePriceQuote } from './usePriceQuote'
import { isFormSubmittable } from './priceQuote'
import { clampPassengers } from './orderForm'
import { validateScheduledAt, minScheduledAt, maxScheduledAt } from './whenRules'
import { AddressAutocomplete, type AddressValue } from './AddressAutocomplete'
import { PickupMap } from './PickupMap'
import { PriceRangeBadge } from './PriceRangeBadge'
import { PassengerStepper } from './PassengerStepper'
import { WhenPicker, type WhenMode } from './WhenPicker'

const Page = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.lg};
  padding: ${({ theme }) => theme.spacing.lg};
`

const Title = styled.h1`
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
 * Custom order screen (/customer/order/new). Pickup autocomplete (geo/suggest) + "Použít moji
 * polohu" GPS pin + lazy map-pin drag fallback; optional dropoff. A live price preview
 * (usePriceQuote → PriceRangeBadge) shows a Fixed price or an Estimate RANGE, never a
 * single exact estimate (AC #4). When / passengers / note, then "Objednat": if logged out
 * the inline CustomerLoginStep renders WITHOUT unmounting the form (the page owns all
 * state, so the chosen pickup survives the login), then the order is created and the app
 * navigates to tracking by publicCode. Ordering is blocked when offline (spec §Behavior).
 */
export function CustomOrderPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const online = useOnlineStatus()
  const createOrder = useCreateOrder()

  // "Objednat znovu" (B-history) passes a reorder draft via router state: prefill the address
  // fields only (the history list carries no fresh coords) — the customer re-confirms pickup on
  // the map/autocomplete, which supplies lat/lng before the order can be submitted.
  const reorder = (location.state as { [REORDER_STATE_KEY]?: ReorderDraft } | null)?.[REORDER_STATE_KEY] ?? null

  const [pickup, setPickup] = useState<AddressValue>(() =>
    reorder ? { address: reorder.pickupAddress, lat: null, lng: null } : EMPTY,
  )
  const [dropoff, setDropoff] = useState<AddressValue>(() =>
    reorder?.dropoffAddress ? { address: reorder.dropoffAddress, lat: null, lng: null } : EMPTY,
  )
  const [passengers, setPassengers] = useState(1)
  const [whenMode, setWhenMode] = useState<WhenMode>('now')
  const [scheduledAtLocal, setScheduledAtLocal] = useState('')
  const [note, setNote] = useState('')
  const [showLogin, setShowLogin] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const quote = usePriceQuote({
    pickupLat: pickup.lat,
    pickupLng: pickup.lng,
    dropoffLat: dropoff.lat,
    dropoffLng: dropoff.lng,
  })

  const toIso = useCallback((local: string): string | null => {
    if (!local) return null
    const ms = Date.parse(local)
    return Number.isNaN(ms) ? local : new Date(ms).toISOString()
  }, [])

  const handlePickupPin = useCallback((lat: number, lng: number) => {
    setPickup((prev) => ({ address: prev.address || t('customer.custom.myLocationLabel'), lat, lng }))
  }, [t])

  const submit = useCallback(async () => {
    if (!isFormSubmittable(pickup)) {
      setFormError('customer.custom.pickupRequired')
      return
    }
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

    const hasDropoff = dropoff.lat != null && dropoff.lng != null
    const req: CreateOrderRequest = {
      pickupAddress: pickup.address,
      pickupLat: pickup.lat!,
      pickupLng: pickup.lng!,
      dropoffAddress: hasDropoff ? dropoff.address : null,
      dropoffLat: hasDropoff ? dropoff.lat : null,
      dropoffLng: hasDropoff ? dropoff.lng : null,
      scheduledAt,
      note: note.trim() === '' ? null : note.trim(),
      passengers: clampPassengers(passengers),
      priceType: 'Estimate',
    }

    try {
      const created = await createOrder.mutateAsync(req)
      navigate(`/customer/t/${created.publicCode}`)
    } catch {
      setFormError('customer.order.errorCreateFailed')
    }
  }, [pickup, dropoff, whenMode, scheduledAtLocal, toIso, note, passengers, createOrder, navigate])

  function handleSubmitClick() {
    if (!online) {
      setFormError('customer.order.offlineBlocked')
      return
    }
    if (!isFormSubmittable(pickup)) {
      setFormError('customer.custom.pickupRequired')
      return
    }
    if (authStorage.getAccessToken() === null) {
      setShowLogin(true)
      return
    }
    void submit()
  }

  const canSubmit = online && isFormSubmittable(pickup) && !createOrder.isPending

  return (
    <Page>
      <Title>{t('customer.custom.title')}</Title>

      <AddressAutocomplete
        label="customer.custom.pickupLabel"
        placeholder="customer.custom.pickupPlaceholder"
        value={pickup}
        onChange={setPickup}
        showUseMyLocation
      />
      <PickupMap lat={pickup.lat} lng={pickup.lng} onPinMove={handlePickupPin} />

      <AddressAutocomplete
        label="customer.custom.dropoffLabel"
        placeholder="customer.custom.dropoffPlaceholder"
        value={dropoff}
        onChange={setDropoff}
      />

      <PriceRangeBadge view={quote.view} errorKey={quote.errorKey} />

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

      <Field>
        {t('customer.order.noteLabel')}
        <NoteInput
          value={note}
          placeholder={t('customer.order.notePlaceholder')}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      {formError && <Message role="alert">{t(formError)}</Message>}

      {showLogin ? (
        <>
          <LoginPrompt>{t('customer.custom.loginPrompt')}</LoginPrompt>
          <CustomerLoginStep onAuthenticated={() => { setShowLogin(false); void submit() }} />
        </>
      ) : (
        <SubmitButton type="button" onClick={handleSubmitClick} disabled={!canSubmit}>
          {createOrder.isPending ? t('customer.custom.submitting') : t('customer.custom.submit')}
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
