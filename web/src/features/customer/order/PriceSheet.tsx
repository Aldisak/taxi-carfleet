import { useCallback, useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { authStorage } from '../../../shared/api/auth-storage'
import { CustomerLoginStep } from '../login/CustomerLoginStep'
import { useOnlineStatus } from '../shell/useOnlineStatus'
import { BottomSheet } from '../../../shared/ui/BottomSheet'
import { Button } from '../../../shared/ui/Button'
import { Chip } from '../../../shared/ui/Chip'
import { Callout } from '../../../shared/ui/Callout'
import { RouteSummary } from '../../../shared/ui/RouteSummary'
import { Icon } from '../../../shared/ui/icons/Icon'
import { formatCzk } from '../../../shared/format/money'
import { buildOrderRequest } from './buildOrderRequest'
import { useCreateOrder } from './useCreateOrder'
import { PriceRangeBadge } from './PriceRangeBadge'
import { OptionsSheet } from './OptionsSheet'
import { type WhenMode } from './WhenPicker'
import { validateScheduledAt } from './whenRules'
import type { UsePriceQuoteResult } from './usePriceQuote'
import type { PriceQuoteView } from './priceQuote'
import type { SelectedPlace } from './orderFlowState'

const Title = styled.h2`
  margin: 0;
  font-size: var(--fs-headline);
  font-weight: var(--fw-extra);
  color: var(--ink);
`

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`

const LoginPrompt = styled.p`
  margin: 0;
  font-size: var(--fs-body-lg);
  color: var(--ink);
`

const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

/** Props for PriceSheet — a controlled surface; the page owns the source-of-truth state. */
export interface PriceSheetProps {
  /** The resolved pickup (GPS / center-pin), or null while unresolved. */
  pickup: SelectedPlace | null
  /** The chosen destination (a destination is set whenever the sheet is shown). */
  destination: SelectedPlace | null
  /** The live price quote (from usePriceQuote in the page) — drives the badge + Order gate. */
  quote: UsePriceQuoteResult
  /** Resets the destination (returns the flow to the search phase). */
  onCancel: () => void
  /** Called with the created order's publicCode so the page can navigate to tracking. */
  onOrdered: (publicCode: string) => void
}

/** Only fixed/estimate views are orderable — meter/unknown/null disable Order (F4). */
function isOrderable(view: PriceQuoteView | null): view is Extract<PriceQuoteView, { kind: 'fixed' | 'estimate' }> {
  return view != null && (view.kind === 'fixed' || view.kind === 'estimate')
}

/**
 * The map-first customer price bottom-sheet (UC-015 WI-3, restyled onto the UI kit in UC-020 WI-2).
 * Rendered in the shell bottomSlot once a destination is set. Shows the RouteSummary (pickup→dropoff
 * with a "Změnit" action returning to search), the interpreted price on a PriceCard (PriceRangeBadge:
 * Fixed exact, Estimate RANGE, Meter, or error), the ride-option chips (Hned/Na čas · N cestující ·
 * Poznámka — each opens the OptionsSheet), and the Order / Cancel actions.
 *
 * Order gating (F4): Order is enabled only for a fixed/estimate view while online with a resolved
 * pickup; meter/unknown/error/null disable Order so buildOrderRequest is never invoked on a
 * non-priceable view. Order click mirrors the proven continuation: offline → visible blocked reason
 * (never queued — rules/web-realtime.md#offline-ux); logged-out → inline CustomerLoginStep in-place
 * with all order state preserved, auto-resuming the create on onAuthenticated; logged-in → build the
 * request and create, then onOrdered(publicCode). The inline-login seam is behaviourally unchanged.
 *
 * The Order button's price slot carries the FIXED price only (aria-hidden so the accessible name
 * stays exactly "Objednat"); for an Estimate the range lives solely in the PriceCard so the price
 * text appears once (the e2e binds getByText(/140 Kč/) strictly).
 */
export function PriceSheet({ pickup, destination, quote, onCancel, onOrdered }: PriceSheetProps) {
  const { t } = useTranslation()
  const online = useOnlineStatus()
  const createOrder = useCreateOrder()

  const [optionsOpen, setOptionsOpen] = useState(false)
  const [passengers, setPassengers] = useState(1)
  const [whenMode, setWhenMode] = useState<WhenMode>('now')
  const [scheduledAtLocal, setScheduledAtLocal] = useState('')
  const [note, setNote] = useState('')
  const [showLogin, setShowLogin] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const orderable = isOrderable(quote.view)
  const fixedPrice = quote.view?.kind === 'fixed' ? quote.view.priceCzk : null

  const toIso = useCallback((local: string): string | null => {
    if (!local) return null
    const ms = Date.parse(local)
    return Number.isNaN(ms) ? local : new Date(ms).toISOString()
  }, [])

  const submit = useCallback(async () => {
    if (!orderable || pickup === null) {
      setFormError('customer.mapOrder.meterUnavailable')
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

    const req = buildOrderRequest({
      view: quote.view!,
      pickup,
      destination,
      passengers,
      scheduledAt,
      note: note.trim() === '' ? null : note.trim(),
    })

    try {
      const created = await createOrder.mutateAsync(req)
      onOrdered(created.publicCode)
    } catch {
      setFormError('customer.order.errorCreateFailed')
    }
  }, [orderable, quote.view, pickup, destination, whenMode, scheduledAtLocal, toIso, note, passengers, createOrder, onOrdered])

  function handleOrderClick() {
    if (!online) {
      setFormError('customer.order.offlineBlocked')
      return
    }
    if (!orderable || pickup === null) {
      setFormError('customer.mapOrder.meterUnavailable')
      return
    }
    if (authStorage.getAccessToken() === null) {
      setShowLogin(true)
      return
    }
    void submit()
  }

  function handleClose() {
    // The OptionsSheet owns its own Escape (it stops propagation), so when this sheet receives
    // Escape the options are closed → clear the destination.
    onCancel()
  }

  const canOrder = online && orderable && pickup !== null && !createOrder.isPending
  const whenChipLabel = whenMode === 'now' ? t('customer.order.whenNow') : t('customer.order.whenScheduled')

  return (
    <>
      <BottomSheet open expanded={false} ariaLabelKey="customer.mapOrder.sheetLabel" onClose={handleClose}>
        <Title>{t('customer.mapOrder.priceSheetTitle')}</Title>

        <RouteSummary
          pickup={pickup?.label ?? t('customer.mapOrder.pickupLabel')}
          dropoff={destination?.label}
          action={
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {t('customer.mapOrder.pickupChange')}
            </Button>
          }
        />

        <PriceRangeBadge view={quote.view} errorKey={quote.errorKey} />
        {!orderable && !quote.errorKey && (
          <Callout tone="neutral">{t('customer.mapOrder.meterUnavailable')}</Callout>
        )}

        <ChipRow>
          <Chip selected={whenMode === 'scheduled'} onClick={() => setOptionsOpen(true)}>
            {whenChipLabel}
          </Chip>
          <Chip selected={passengers > 1} onClick={() => setOptionsOpen(true)}>
            {t('customer.order.passengersChip', { count: passengers })}
          </Chip>
          <Chip selected={note.trim() !== ''} onClick={() => setOptionsOpen(true)}>
            {t('customer.order.chipNote')}
          </Chip>
        </ChipRow>

        {!online && (
          <Callout tone="warning" role="alert" icon={<Icon name="wifi-off" />}>
            {t('customer.order.offlineBlocked')}
          </Callout>
        )}
        {online && formError && (
          <Callout tone="danger" role="alert" icon={<Icon name="close" />}>
            {t(formError)}
          </Callout>
        )}

        {showLogin ? (
          <>
            <LoginPrompt>{t('customer.mapOrder.loginPrompt')}</LoginPrompt>
            <CustomerLoginStep onAuthenticated={() => { setShowLogin(false); void submit() }} />
          </>
        ) : (
          <Actions>
            <Button
              variant="primary"
              size="md"
              fullWidth
              disabled={!canOrder}
              loading={createOrder.isPending}
              loadingLabel={t('customer.order.submitting')}
              price={fixedPrice !== null ? <span aria-hidden="true">{formatCzk(fixedPrice)}</span> : undefined}
              onClick={handleOrderClick}
            >
              {t('customer.mapOrder.order')}
            </Button>
            <Button variant="ghost" size="sm" fullWidth onClick={onCancel}>
              {t('customer.mapOrder.cancel')}
            </Button>
          </Actions>
        )}
      </BottomSheet>

      <OptionsSheet
        open={optionsOpen}
        whenMode={whenMode}
        onWhenModeChange={setWhenMode}
        scheduledAt={scheduledAtLocal}
        onScheduledAtChange={setScheduledAtLocal}
        passengers={passengers}
        onPassengersChange={setPassengers}
        note={note}
        onNoteChange={setNote}
        onDone={() => setOptionsOpen(false)}
      />
    </>
  )
}
