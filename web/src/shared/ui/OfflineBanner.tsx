import { type ReactNode } from 'react'
import styled from 'styled-components'

/** Props for the shared {@link OfflineBanner}, a full-width offline warning strip. */
export interface OfflineBannerProps {
  /** The banner message (already-translated text or elements). */
  children: ReactNode
}

const StyledOfflineBanner = styled.div`
  width: 100%;
  padding: 8px 16px;
  padding-top: calc(8px + env(safe-area-inset-top));
  background: var(--warning-bg);
  color: var(--warning);
  font-size: var(--fs-label);
  font-weight: var(--fw-bold);
  text-align: center;
`

/** A full-width warning strip shown under the safe area when the app is offline. */
export function OfflineBanner({ children }: OfflineBannerProps): JSX.Element {
  return (
    <StyledOfflineBanner role="alert" aria-live="polite">
      {children}
    </StyledOfflineBanner>
  )
}
