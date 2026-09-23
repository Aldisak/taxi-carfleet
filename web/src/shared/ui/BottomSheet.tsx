import { useEffect, useRef, type ReactNode } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'

/**
 * Sheet snap positions. `collapsed` shows a peek; `expanded` takes a larger share;
 * `full` covers the viewport for immersive surfaces (Search). Collapsed/expanded stay
 * below full height so the map behind and its bottom-left attribution logo remain visible
 * (rules/web-accessibility.md#semantics, CLAUDE.md map-inset note).
 */
export type SheetSnap = 'collapsed' | 'expanded' | 'full'

const SNAP_HEIGHT: Record<SheetSnap, string> = {
  collapsed: '30dvh',
  expanded: '70dvh',
  // Leave the notch/status bar clear so the sheet never fights the OS chrome.
  full: 'calc(100dvh - env(safe-area-inset-top) - 12px)',
}

const Sheet = styled.div<{ $snap: SheetSnap }>`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: ${({ theme }) => theme.zIndex.overlay};
  display: flex;
  flex-direction: column;
  height: ${({ $snap }) => SNAP_HEIGHT[$snap]};
  background: var(--surface);
  border-top-left-radius: var(--r-lg);
  border-top-right-radius: var(--r-lg);
  box-shadow: var(--shadow-sheet);
  transition: height var(--dur-sheet) var(--ease-sheet);
  /* Safe-area bottom padding for notched/home-indicator phones. */
  padding-bottom: env(safe-area-inset-bottom);

  &:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: -3px;
  }
`

// A small non-interactive grab handle (decorative — hidden from AT). 40×5 per the design.
const GrabHandle = styled.div`
  flex: 0 0 auto;
  width: 40px;
  height: 5px;
  margin: 10px auto 4px;
  border-radius: var(--r-pill);
  background: var(--line-strong);
`

const Content = styled.div`
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 16px;
  padding-bottom: 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`

/** Props for the shared BottomSheet primitive. Controlled: the parent owns open/snap. */
export interface BottomSheetProps {
  /** Whether the sheet is rendered. When false the sheet is unmounted. */
  open: boolean
  /**
   * Collapsed (peek) vs expanded height. Kept for backward compatibility; when `snap` is
   * provided it takes precedence. `expanded` maps to snap `'expanded'`, otherwise `'collapsed'`.
   */
  expanded?: boolean
  /** Explicit snap position (`collapsed | expanded | full`). Overrides `expanded` when set. */
  snap?: SheetSnap
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
  expanded = false,
  snap,
  ariaLabelKey,
  onClose,
  children,
}: BottomSheetProps) {
  const { t } = useTranslation()
  const effectiveSnap: SheetSnap = snap ?? (expanded ? 'expanded' : 'collapsed')
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
      $snap={effectiveSnap}
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
