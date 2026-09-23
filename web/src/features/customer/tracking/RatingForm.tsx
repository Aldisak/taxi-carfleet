import { useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { StarPicker } from '../../../shared/ui/StarPicker'
import { Button } from '../../../shared/ui/Button'
import { useOnlineStatus } from '../shell/useOnlineStatus'
import { useRateOrder } from './useRateOrder'
import { canSubmitRating, MAX_RATING_COMMENT_LENGTH } from './ratingRules'

const Wrapper = styled.section`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
`

const Title = styled.h3`
  margin: 0;
  font-size: var(--fs-headline);
  font-weight: var(--fw-extra);
  color: var(--ink);
`

const CommentLabel = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: var(--fs-label);
  font-weight: var(--fw-bold);
  color: var(--ink-2);
`

const CommentInput = styled.textarea`
  min-height: 56px;
  padding: 10px 14px;
  border: 1px solid transparent;
  border-radius: var(--r-md);
  background: var(--surface-2);
  color: var(--ink);
  font-size: var(--fs-body-lg);
  font-family: inherit;
  resize: vertical;

  &::placeholder {
    color: var(--ink-3);
  }

  &:focus {
    outline: none;
    background: var(--surface);
    border: 2px solid var(--ink);
  }
`

const Thanks = styled.p`
  margin: 0;
  font-size: var(--fs-body);
  color: var(--ink);
`

const Message = styled.p`
  margin: 0;
  font-size: var(--fs-caption);
  font-weight: var(--fw-bold);
  color: var(--danger);
`

interface RatingFormProps {
  /** The tracking public code; the hook resolves the order id + already-rated state from it. */
  publicCode: string
}

/**
 * Rating control dropped into the TrackingSheet ratingSlot on the Completed tracking view
 * (B-rating; restyled onto the shared UI kit in UC-020 WI-4 — the LOCAL StarPicker is replaced by
 * the shared kit StarPicker with 48px SVG-star targets). 1..5 stars + optional comment → POST
 * orders/{id}/rating, once. Already-rated orders (from history) and a 409 both render the read-only
 * "Děkujeme" state (useRateOrder). Offline disables submit with a message. Authed-only: TrackingPage
 * passes this slot only in authed mode (the POST is CustomerOnly and needs the resolved order id).
 */
export function RatingForm({ publicCode }: RatingFormProps) {
  const { t } = useTranslation()
  const online = useOnlineStatus()
  const { view, orderId, submit, isPending, errorKey } = useRateOrder(publicCode)

  const [stars, setStars] = useState(0)
  const [comment, setComment] = useState('')

  if (view.kind === 'thanks') {
    return (
      <Wrapper aria-live="polite">
        <Thanks>{t('customer.rating.thanks')}</Thanks>
        {view.stars != null && (
          <Thanks>{t('customer.rating.yourRating', { stars: view.stars })}</Thanks>
        )}
      </Wrapper>
    )
  }

  // Gate on a resolved order id: if the completed order is not in page-1 of orders/mine (a
  // customer with many newer orders opening an old completed order's URL directly), submit would
  // silently no-op — keep it disabled instead of an enabled dead button.
  const canSubmit = online && orderId != null && canSubmitRating(stars, comment) && !isPending

  return (
    <Wrapper>
      <Title>{t('customer.rating.title')}</Title>

      <StarPicker
        value={stars}
        onChange={setStars}
        legend={t('customer.rating.starsLegend')}
        starLabel={(n) => t('customer.rating.starLabel', { stars: n })}
      />

      <CommentLabel>
        {t('customer.rating.commentLabel')}
        <CommentInput
          value={comment}
          maxLength={MAX_RATING_COMMENT_LENGTH}
          placeholder={t('customer.rating.commentPlaceholder')}
          onChange={(e) => setComment(e.target.value)}
        />
      </CommentLabel>

      {!online && <Message role="alert">{t('customer.rating.offline')}</Message>}
      {errorKey && <Message role="alert">{t(errorKey)}</Message>}

      <Button
        variant="primary"
        fullWidth
        disabled={!canSubmit}
        loading={isPending}
        loadingLabel={t('customer.rating.submitting')}
        onClick={() => void submit(stars, comment)}
      >
        {t('customer.rating.submit')}
      </Button>
    </Wrapper>
  )
}
