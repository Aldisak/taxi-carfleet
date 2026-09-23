import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styled from 'styled-components'
import { Icon } from '../icons/Icon'

/** Props for the {@link Drawer} — a 480px right-side modal panel. Controlled by the parent. */
export interface DrawerProps {
  /** Whether the drawer is rendered. When false the drawer is unmounted. */
  open: boolean
  /** Header title, also the dialog's accessible name. */
  title: string
  /** Accessible label for the close button (i18n'd by the caller). */
  closeLabel: string
  /** Called on Escape, scrim click, or the close button. */
  onClose: () => void
  /** Optional status-pill slot rendered in the header next to the title. */
  status?: ReactNode
  /** Drawer body content. */
  children: ReactNode
}

const Scrim = styled.div`
  position: fixed;
  inset: 0;
  background: var(--scrim);
  z-index: 1000;
`

const Panel = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 480px;
  max-width: 100vw;
  z-index: 1001;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-left: 1px solid var(--line);
  box-shadow: var(--shadow-float);

  &:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: -3px;
  }
`

const Header = styled.header`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
`

const Title = styled.h2`
  margin: 0;
  font-size: var(--fs-headline);
  font-weight: var(--fw-extra);
  color: var(--ink);
`

const CloseButton = styled.button`
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--ink-2);
  cursor: pointer;

  &:hover {
    background: var(--surface-2);
  }
`

const Body = styled.div`
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A 480px right-side modal drawer: scrim, focus trap, Escape-to-close, and focus restore to
 * the trigger. Rendered in a portal on `document.body`. All user-facing text (title,
 * close label) is supplied by the caller — this component never touches i18n.
 */
export function Drawer({
  open,
  title,
  closeLabel,
  onClose,
  status,
  children,
}: DrawerProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (open && !wasOpen.current) {
      triggerRef.current = document.activeElement as HTMLElement | null
      // Focus the first focusable child, falling back to the panel itself.
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
      ;(first ?? panelRef.current)?.focus()
    } else if (!open && wasOpen.current) {
      triggerRef.current?.focus()
      triggerRef.current = null
    }
    wasOpen.current = open
  }, [open])

  if (!open) return null

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const focusables = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    )
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement
    if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <>
      <Scrim data-testid="drawer-scrim" onClick={onClose} />
      <Panel
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <Header>
          <Title>{title}</Title>
          {status !== undefined && status}
          <CloseButton type="button" aria-label={closeLabel} onClick={onClose}>
            <Icon name="close" size={18} />
          </CloseButton>
        </Header>
        <Body>{children}</Body>
      </Panel>
    </>,
    document.body,
  )
}
