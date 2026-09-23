import { type ReactNode } from 'react'
import styled from 'styled-components'

/** Props for the shared {@link Toast}, a transient message pinned near the top. */
export interface ToastProps {
  /** The toast message (already-translated text or elements). */
  children: ReactNode
  /**
   * Called when the dismiss button is pressed. When present, a dismiss
   * `<button>` is rendered and {@link ToastProps.dismissLabel} is required.
   */
  onDismiss?: () => void
  /** Accessible name for the dismiss button. Required when `onDismiss` is set. */
  dismissLabel?: string
}

const StyledToast = styled.div`
  position: fixed;
  top: 116px;
  left: 16px;
  right: 16px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 420px;
  margin: 0 auto;
  padding: 12px 16px;
  background: var(--bg);
  color: var(--ink);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-float);
`

const Message = styled.span`
  flex: 1;
  min-width: 0;
  font-size: var(--fs-body);
  font-weight: var(--fw-bold);
`

const DismissButton = styled.button`
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--ink-2);
  border-radius: var(--r-pill);
  cursor: pointer;

  &:active {
    transform: scale(0.96);
  }
`

/** A transient top-of-viewport status message with an optional dismiss button. */
export function Toast({ children, onDismiss, dismissLabel }: ToastProps): JSX.Element {
  return (
    <StyledToast role="status" aria-live="polite">
      <Message>{children}</Message>
      {onDismiss !== undefined ? (
        <DismissButton type="button" aria-label={dismissLabel} onClick={onDismiss}>
          <svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </DismissButton>
      ) : null}
    </StyledToast>
  )
}
