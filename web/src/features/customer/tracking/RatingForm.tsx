import { useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useOnlineStatus } from '../shell/useOnlineStatus'
import { useRateOrder } from './useRateOrder'
import { canSubmitRating, MAX_RATING_COMMENT_LENGTH } from './ratingRules'
import { StarPicker } from './StarPicker'

const Wrapper = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  margin-top: ${({ theme }) => theme.spacing.sm};
`

const Title = styled.h3`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

const CommentLabel = styled.label`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const CommentInput = styled.textarea`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-family: inherit;
  resize: vertical;
`

const SubmitButton = styled.button`
  min-height: ${({ theme }) => theme.touchTargets.min};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const Thanks = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};
`

const Message = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.error};
`

interface RatingFormProps {
  /** The tracking public code; the hook resolves the order id + already-rated state from it. */
  publicCode: string
}

/**
 * Rating control dropped into the TrackingSheet ratingSlot on the Completed tracking view
 * (B-rating). 1..5 stars + optional comment → POST orders/{id}/rating, once. Already-rated
 * orders (from history) and a 409 both render the read-only "Děkujeme" state (useRateOrder).
 * Offline disables submit with a message. Authed-only: TrackingPage passes this slot only in
 * authed mode (the POST is CustomerOnly and needs the resolved order id).
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
        {view.stars != null && <StarPicker value={view.stars} onChange={() => {}} readOnly />}
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

      <StarPicker value={stars} onChange={setStars} disabled={isPending} />

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

      <SubmitButton type="button" disabled={!canSubmit} onClick={() => void submit(stars, comment)}>
        {isPending ? t('customer.rating.submitting') : t('customer.rating.submit')}
      </SubmitButton>
    </Wrapper>
  )
}
