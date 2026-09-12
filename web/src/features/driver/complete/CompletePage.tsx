import { useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useActiveOrder } from '../ride/useActiveOrder'
import { useCompleteRide } from './useCompleteRide'
import { deriveCompleteFormState, validateCompleteForm } from './completeForm'
import { buildCompletePayload } from './overrideReason'
import { NumericKeypad } from './NumericKeypad'
import { PaymentToggles, type PaymentType } from './PaymentToggles'

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

const Title = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
`

const LockedPrice = styled.div`
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

const LockedTag = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightNormal};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const RevealButton = styled.button`
  align-self: flex-start;
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  background: none;
  color: ${({ theme }) => theme.colors.primary};
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  cursor: pointer;
`

const ReasonInput = styled.input`
  width: 100%;
  box-sizing: border-box;
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
`

const FieldLabel = styled.label`
  display: block;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 4px;
`

const ErrorText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.error};
  margin: 0;
`

const SubmitButton = styled.button`
  margin-top: auto;
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

const EmptyState = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.lg};
`

/**
 * Complete ride screen (/d/ride/complete).
 * - Fixed price: locked + prefilled; "Změnit cenu" reveals a keypad + mandatory reason
 *   (>= 5 chars) sent as overrideReason ONLY when the price actually changed.
 * - Estimate/Meter: big numeric keypad prefilled with the estimate.
 * - Payment toggles Hotově / Kartou / Faktura.
 * - "Dokončit" -> complete; on success return Home with a 2s "Hotovo ✓" toast; 409 refetches.
 */
export function CompletePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { order } = useActiveOrder()
  const { isPending, complete } = useCompleteRide()

  const formState = order
    ? deriveCompleteFormState(order.priceType, order.fixedPriceCzk, order.estimatedPriceCzk)
    : null

  const [price, setPrice] = useState<number | null>(formState?.prefillAmount ?? null)
  const [payment, setPayment] = useState<PaymentType | null>(null)
  const [overrideRevealed, setOverrideRevealed] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [errors, setErrors] = useState<ReturnType<typeof validateCompleteForm>>({})
  const [serverNote, setServerNote] = useState<string | null>(null)

  if (!order || !formState) {
    return (
      <Page>
        <EmptyState>{t('driver.ride.noRide')}</EmptyState>
      </Page>
    )
  }

  const showKeypad = !formState.priceLocked || overrideRevealed

  async function handleSubmit() {
    setServerNote(null)
    const found = validateCompleteForm({
      priceType: order!.priceType,
      fixedPriceCzk: order!.fixedPriceCzk,
      finalPriceCzk: price,
      paymentType: payment,
      overrideRevealed,
      overrideReason,
    })
    setErrors(found)
    if (Object.keys(found).length > 0) return

    const payload = buildCompletePayload({
      finalPriceCzk: price!,
      paymentType: payment!,
      overrideRevealed,
      overrideReason,
      priceType: order!.priceType,
      fixedPriceCzk: order!.fixedPriceCzk,
    })

    const outcome = await complete(order!.id, payload)
    if (outcome.type === 'success') {
      navigate('/d', { state: { toast: 'driver.complete.successOverlay' } })
    } else if (outcome.type === 'queued') {
      // Offline: the complete is queued (idempotency key minted) and replays on reconnect.
      // Go Home optimistically — the PendingBadge communicates it is still being sent.
      navigate('/d', { state: { toast: 'driver.complete.queuedOverlay' } })
    } else if (outcome.type === 'stale') {
      // Definitive conflict: the queue already dropped this order's items and reconciled
      // from GET /orders/{id} (B3c-1); show a short note so the driver re-checks the ride.
      setServerNote('driver.complete.staleRefetched')
    }
  }

  return (
    <Page>
      <Body>
        <Title>{t('driver.complete.title')}</Title>

        {formState.priceLocked && !overrideRevealed ? (
          <>
            <div>
              <FieldLabel as="p">{t('driver.complete.price')}</FieldLabel>
              <LockedPrice>
                {order.fixedPriceCzk ?? 0}
                <LockedTag>{t('driver.complete.fixedLocked')}</LockedTag>
              </LockedPrice>
            </div>
            <RevealButton type="button" onClick={() => setOverrideRevealed(true)}>
              {t('driver.complete.changePrice')}
            </RevealButton>
          </>
        ) : null}

        {showKeypad && (
          <NumericKeypad value={price} onChange={setPrice} />
        )}

        {overrideRevealed && (
          <div>
            <FieldLabel htmlFor="override-reason">{t('driver.complete.overrideReason')}</FieldLabel>
            <ReasonInput
              id="override-reason"
              type="text"
              value={overrideReason}
              placeholder={t('driver.complete.overrideReasonPlaceholder')}
              onChange={e => setOverrideReason(e.target.value)}
            />
            {errors.overrideReason && <ErrorText>{t(errors.overrideReason)}</ErrorText>}
          </div>
        )}

        {errors.finalPriceCzk && <ErrorText>{t(errors.finalPriceCzk)}</ErrorText>}

        <div>
          <FieldLabel as="p">{t('driver.complete.paymentTitle')}</FieldLabel>
          <PaymentToggles selected={payment} onSelect={setPayment} />
          {errors.paymentType && <ErrorText>{t(errors.paymentType)}</ErrorText>}
        </div>

        {serverNote && <ErrorText role="alert">{t(serverNote)}</ErrorText>}

        <SubmitButton type="button" disabled={isPending} onClick={() => void handleSubmit()}>
          {isPending ? t('driver.complete.submitting') : t('driver.complete.submit')}
        </SubmitButton>
      </Body>
    </Page>
  )
}
