import { useCallback, useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { authStorage } from '../../../shared/api/auth-storage'
import { CustomerLoginStep } from '../login/CustomerLoginStep'
import { useOnlineStatus } from '../shell/useOnlineStatus'
import { BottomSheet } from '../../../shared/ui/BottomSheet'
import { buildOrderRequest } from './buildOrderRequest'
import { useCreateOrder } from './useCreateOrder'
import { PriceRangeBadge } from './PriceRangeBadge'
import { PassengerStepper } from './PassengerStepper'
import { WhenPicker, type WhenMode } from './WhenPicker'
import { validateScheduledAt, minScheduledAt, maxScheduledAt } from './whenRules'
import type { UsePriceQuoteResult } from './usePriceQuote'
import type { PriceQuoteView } from './priceQuote'
import type { SelectedPlace } from './orderFlowState'

const Header = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`

const Title = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

const Fallback = styled.p`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  text-align: center;
`

const OptionsToggle = styled.button<{ $expanded: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`

const Options = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
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

const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`

const OrderButton = styled.button`
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

const CancelButton = styled.button`
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.min};
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  cursor: pointer;
  text-decoration: underline;

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
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
 * The map-first customer price bottom-sheet (UC-015 WI-3). Rendered in the shell bottomSlot
 * once a destination is set. Shows the interpreted price (PriceRangeBadge: Fixed exact,
 * Estimate RANGE, Meter, or error) and the Order / Cancel actions. The ride options
 * (passengers, when, note) live in a collapsed-by-default area that drives BottomSheet.expanded.
 *
 * Order gating (F4): Order is enabled only for a fixed/estimate view while online with a
 * resolved pickup; meter/unknown/error/null show the fallback message and disable Order, so
 * buildOrderRequest is never invoked on a non-priceable view. Order click mirrors the proven
 * CustomOrderPage continuation: offline → visible blocked reason (never queued —
 * rules/web-realtime.md#offline-ux); logged-out → inline CustomerLoginStep in-place with all
 * order state preserved, auto-resuming the create on onAuthenticated; logged-in → build the
 * request and create, then onOrdered(publicCode).
 */
export function PriceSheet({ pickup, destination, quote, onCancel, onOrdered }: PriceSheetProps) {
  const { t } = useTranslation()
  const online = useOnlineStatus()
  const createOrder = useCreateOrder()

  const [expanded, setExpanded] = useState(false)
  const [passengers, setPassengers] = useState(1)
  const [whenMode, setWhenMode] = useState<WhenMode>('now')
  const [scheduledAtLocal, setScheduledAtLocal] = useState('')
  const [note, setNote] = useState('')
  const [showLogin, setShowLogin] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const orderable = isOrderable(quote.view)

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
    // Escape collapses the options area if it is open; otherwise it clears the destination.
    if (expanded) {
      setExpanded(false)
      return
    }
    onCancel()
  }

  const canOrder = online && orderable && pickup !== null && !createOrder.isPending

  return (
    <BottomSheet open expanded={expanded} ariaLabelKey="customer.mapOrder.sheetLabel" onClose={handleClose}>
      <Header>
        <Title>{t('customer.mapOrder.priceSheetTitle')}</Title>
        <PriceRangeBadge view={quote.view} errorKey={quote.errorKey} />
        {!orderable && !quote.errorKey && <Fallback>{t('customer.mapOrder.meterUnavailable')}</Fallback>}
      </Header>

      <OptionsToggle
        type="button"
        $expanded={expanded}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {t('customer.mapOrder.optionsToggle')}
        <span aria-hidden="true">{expanded ? '−' : '+'}</span>
      </OptionsToggle>

      {expanded && (
        <Options>
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
          </Field>

          <Field>
            {t('customer.order.noteLabel')}
            <NoteInput
              value={note}
              placeholder={t('customer.order.notePlaceholder')}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
        </Options>
      )}

      {!online && <Message role="alert">{t('customer.order.offlineBlocked')}</Message>}
      {online && formError && <Message role="alert">{t(formError)}</Message>}

      {showLogin ? (
        <>
          <LoginPrompt>{t('customer.mapOrder.loginPrompt')}</LoginPrompt>
          <CustomerLoginStep onAuthenticated={() => { setShowLogin(false); void submit() }} />
        </>
      ) : (
        <Actions>
          <OrderButton type="button" onClick={handleOrderClick} disabled={!canOrder}>
            {createOrder.isPending ? t('customer.order.submitting') : t('customer.mapOrder.order')}
          </OrderButton>
          <CancelButton type="button" onClick={onCancel}>
            {t('customer.mapOrder.cancel')}
          </CancelButton>
        </Actions>
      )}
    </BottomSheet>
  )
}

/** Converts a Date to a datetime-local input value (local time, no seconds). */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
