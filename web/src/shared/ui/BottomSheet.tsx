import { useEffect, useRef, type ReactNode } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'

/**
 * Sheet heights. Collapsed shows a peek; expanded takes a larger share of the viewport.
 * Both stay well below the full height so the map behind and its bottom-left attribution
 * logo remain visible (rules/web-accessibility.md#semantics, CLAUDE.md map-inset note).
 */
const COLLAPSED_HEIGHT = '30dvh'
const EXPANDED_HEIGHT = '70dvh'

const Sheet = styled.div<{ $expanded: boolean }>`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: ${({ theme }) => theme.zIndex.overlay};
  display: flex;
  flex-direction: column;
  height: ${({ $expanded }) => ($expanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT)};
  background: ${({ theme }) => theme.colors.surface};
  border-top-left-radius: ${({ theme }) => theme.borderRadius.lg};
  border-top-right-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: ${({ theme }) => theme.shadows.lg};
  /* Safe-area bottom padding for notched/home-indicator phones. */
  padding-bottom: env(safe-area-inset-bottom);

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: -2px;
  }
`

// A small non-interactive grab handle (decorative — hidden from AT).
const GrabHandle = styled.div`
  flex: 0 0 auto;
  width: ${({ theme }) => theme.spacing.xl};
  height: ${({ theme }) => theme.spacing.xs};
  margin: ${({ theme }) => theme.spacing.sm} auto ${({ theme }) => theme.spacing.xs};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  background: ${({ theme }) => theme.colors.border};
`

const Content = styled.div`
  flex: 1 1 auto;
  overflow-y: auto;
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`

/** Props for the shared BottomSheet primitive. Controlled: the parent owns open/expanded. */
export interface BottomSheetProps {
  /** Whether the sheet is rendered. When false the sheet is unmounted. */
  open: boolean
  /** Collapsed (peek) vs expanded height. */
  expanded: boolean
  /** i18n key for the sheet's accessible name (role=dialog aria-label). */
  ariaLabelKey: string
  /** Called on Escape (parent decides collapse vs close). */
  onClose: () => void
  /** Sheet body — scrollable content. */
  children: ReactNode
}

/**
 * Reusable bottom-anchored sheet primitive (shared/ui — consumed by UC-015/016/019).
 *
 * Accessibility: role=dialog with an i18n aria-label; focus moves into the sheet on open and
 * is restored to the previously-focused trigger on close; Escape invokes onClose. It is a
 * NON-modal sheet (no focus trap): it sits at theme.zIndex.overlay, BELOW the Mapy attribution
 * (theme.zIndex.attribution), which must stay keyboard-reachable — a trap would strand the
 * logo. Styling is theme tokens only; interactive children supply their own ≥48px targets
 * (theme.touchTargets.min), reusing the SubmitButton precedent.
 */
export function BottomSheet({
  open,
  expanded,
  ariaLabelKey,
  onClose,
  children,
}: BottomSheetProps) {
  const { t } = useTranslation()
  const sheetRef = useRef<HTMLDivElement>(null)
  // The element focused before the sheet opened, to restore on close.
  const triggerRef = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open && !wasOpen.current) {
      // false → true: capture the trigger, then move focus into the sheet.
      triggerRef.current = document.activeElement as HTMLElement | null
      sheetRef.current?.focus()
    } else if (!open && wasOpen.current) {
      // true → false: restore focus to the trigger.
      triggerRef.current?.focus()
      triggerRef.current = null
    }
    wasOpen.current = open
  }, [open])

  if (!open) return null

  return (
    <Sheet
      ref={sheetRef}
      $expanded={expanded}
      role="dialog"
      aria-label={t(ariaLabelKey)}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <GrabHandle aria-hidden="true" />
      <Content>{children}</Content>
    </Sheet>
  )
}
