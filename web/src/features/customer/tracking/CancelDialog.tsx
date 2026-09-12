import { useEffect, useRef } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.md};
  background: rgba(0, 0, 0, 0.5);
`

const Panel = styled.div`
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.lg};
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: ${({ theme }) => theme.shadows.lg};
`

const Title = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

const Body = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};
`

const Hint = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.warning};
`

const ErrorText = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.error};
`

const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`

const DangerButton = styled.button`
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.min};
  background: ${({ theme }) => theme.colors.error};
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

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.text};
    outline-offset: 2px;
  }
`

const DismissButton = styled.button`
  width: 100%;
  min-height: ${({ theme }) => theme.touchTargets.min};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  cursor: pointer;

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
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
 * Confirm-cancel modal: at most two buttons (spec §11), traps focus while open, closes on Escape,
 * and returns focus to the element that opened it (rules/web-accessibility.md#keyboard-focus).
 */
export function CancelDialog({ showAcceptedHint, isPending, errorKey, onConfirm, onDismiss }: CancelDialogProps) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  const dismissRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Remember the trigger so focus returns to it on close.
    const previouslyFocused = document.activeElement as HTMLElement | null
    // Move focus into the dialog (the dismiss button is the safe default — never the danger action).
    dismissRef.current?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
        return
      }
      if (e.key !== 'Tab') return
      // Simple focus trap across the two buttons inside the panel.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])')
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [onDismiss])

  return (
    <Overlay>
      <Panel ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="cancel-dialog-title">
        <Title id="cancel-dialog-title">{t('customer.tracking.cancelDialogTitle')}</Title>
        <Body>{t('customer.tracking.cancelDialogBody')}</Body>
        {showAcceptedHint && <Hint>{t('customer.tracking.cancelAcceptedHint')}</Hint>}
        {errorKey && <ErrorText role="alert">{t(errorKey)}</ErrorText>}
        <Actions>
          <DangerButton type="button" onClick={onConfirm} disabled={isPending}>
            {isPending ? t('customer.tracking.cancelling') : t('customer.tracking.cancelConfirm')}
          </DangerButton>
          <DismissButton ref={dismissRef} type="button" onClick={onDismiss} disabled={isPending}>
            {t('customer.tracking.cancelDismiss')}
          </DismissButton>
        </Actions>
      </Panel>
    </Overlay>
  )
}
