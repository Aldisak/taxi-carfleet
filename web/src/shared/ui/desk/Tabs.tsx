import { type KeyboardEvent } from 'react'
import styled from 'styled-components'

/** One tab: a stable `id` and its visible `label`. */
export interface TabItem {
  /** The id emitted when this tab is selected. */
  id: string
  /** Visible tab label. */
  label: string
}

/** Props for the {@link Tabs} — a 40px underline tab strip (controlled). */
export interface TabsProps {
  /** The tabs, rendered left to right. */
  tabs: TabItem[]
  /** The currently active tab id. */
  activeId: string
  /** Called with the chosen tab id on click or arrow-key navigation. */
  onChange: (id: string) => void
  /** Accessible name for the tablist. */
  ariaLabel: string
}

const List = styled.div`
  display: inline-flex;
  gap: 4px;
  border-bottom: 1px solid var(--line);
`

const Tab = styled.button<{ $active: boolean }>`
  height: 40px;
  padding: 0 12px;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: var(--fs-label);
  font-weight: ${({ $active }) => ($active ? 'var(--fw-extra)' : 'var(--fw-bold)')};
  color: ${({ $active }) => ($active ? 'var(--ink)' : 'var(--ink-2)')};
  cursor: pointer;
  box-shadow: ${({ $active }) => ($active ? 'inset 0 -2px 0 0 var(--ink)' : 'none')};
`

/** A tab strip with `role="tablist"`, arrow-key navigation, and an active underline. */
export function Tabs({ tabs, activeId, onChange, ariaLabel }: TabsProps): JSX.Element {
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const currentIndex = tabs.findIndex((t) => t.id === activeId)
    if (currentIndex === -1) return
    const delta = e.key === 'ArrowRight' ? 1 : -1
    const nextIndex = (currentIndex + delta + tabs.length) % tabs.length
    // Move DOM focus to the targeted tab before the roving tabIndex flips, so a
    // keyboard/AT user's focus follows the selection (WCAG tablist pattern).
    document.getElementById(`tab-${tabs[nextIndex].id}`)?.focus()
    onChange(tabs[nextIndex].id)
  }

  return (
    <List role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const active = tab.id === activeId
        return (
          <Tab
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            $active={active}
            onClick={() => onChange(tab.id)}
            onKeyDown={handleKeyDown}
          >
            {tab.label}
          </Tab>
        )
      })}
    </List>
  )
}
