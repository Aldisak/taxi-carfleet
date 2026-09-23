import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { BottomSheet } from '../../../shared/ui/BottomSheet'
import { Button } from '../../../shared/ui/Button'
import { Callout } from '../../../shared/ui/Callout'

const Title = styled.h2`
  margin: 0;
  font-size: var(--fs-headline);
  font-weight: var(--fw-extra);
  color: var(--ink);
`

const Body = styled.p`
  margin: 0;
  font-size: var(--fs-body);
  color: var(--ink);
`

const ErrorText = styled.p`
  margin: 0;
  font-size: var(--fs-caption);
  font-weight: var(--fw-bold);
  color: var(--danger);
`

const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`

export interface CancelDialogProps {
  /** Show the "řidič už jede" hint (after Accepted). */
  showAcceptedHint: boolean
  isPending: boolean
  /** i18n error key (e.g. cancel too late) shown in the dialog, or null. */
  errorKey?: string | null
  onConfirm: () => void
  onDismiss: () => void
}

/**
 * Confirm-cancel BOTTOM ACTION SHEET (UC-020 WI-4 — was a centred modal in UC-016). Built on the
 * shared BottomSheet, so it renders role=dialog with the aria-label from
 * `customer.tracking.cancelDialogTitle` ("Zrušit objednávku?") — the load-bearing e2e/dialog name
 * survives the restyle. At most two buttons (spec §11); Escape → onDismiss (BottomSheet's onClose).
 * The post-Accepted "řidič už jede" hint is a warning Callout. The BottomSheet moves focus into the
 * sheet on open and restores it to the trigger on close (rules/web-accessibility.md#keyboard-focus).
 */
export function CancelDialog({ showAcceptedHint, isPending, errorKey, onConfirm, onDismiss }: CancelDialogProps) {
  const { t } = useTranslation()

  return (
    <BottomSheet
      open
      snap="collapsed"
      ariaLabelKey="customer.tracking.cancelDialogTitle"
      onClose={onDismiss}
    >
      <Title>{t('customer.tracking.cancelDialogTitle')}</Title>
      <Body>{t('customer.tracking.cancelDialogBody')}</Body>
      {showAcceptedHint && (
        <Callout tone="warning">{t('customer.tracking.cancelAcceptedHint')}</Callout>
      )}
      {errorKey && <ErrorText role="alert">{t(errorKey)}</ErrorText>}
      <Actions>
        <Button
          variant="danger"
          fullWidth
          disabled={isPending}
          loading={isPending}
          loadingLabel={t('customer.tracking.cancelling')}
          onClick={onConfirm}
        >
          {t('customer.tracking.cancelConfirm')}
        </Button>
        <Button variant="secondary" fullWidth disabled={isPending} onClick={onDismiss}>
          {t('customer.tracking.cancelDismiss')}
        </Button>
      </Actions>
    </BottomSheet>
  )
}
