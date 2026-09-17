import { useId, useState, type KeyboardEvent } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import type { GeoSuggestItem } from '../../../shared/api/client'
import { suggestionMeta } from '../../../shared/geo/suggestionMeta'
import { SearchingLoader } from '../../../shared/ui/SearchingLoader'
import { useSuggest } from './useSuggest'
import type { SelectedPlace } from './orderFlowState'
import type { LatLng } from '../shell/mapCamera'

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: ${({ theme }) => theme.shadows.md};
  padding: ${({ theme }) => theme.spacing.sm};
`

const Input = styled.input`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  overflow: hidden;
`

const Option = styled.li<{ $active: boolean }>`
  min-height: ${({ theme }) => theme.touchTargets.min};
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
  background: ${({ theme, $active }) => ($active ? theme.colors.background : theme.colors.surface)};

  &:hover {
    background: ${({ theme }) => theme.colors.background};
  }
`

const OptionLabel = styled.span`
  display: block;
`

const OptionMeta = styled.span`
  display: block;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const Empty = styled.p`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

/** Props for DestinationSearch. */
export interface DestinationSearchProps {
  /** Called with the resolved destination when a suggestion is picked. Page owns the state. */
  onSelectDestination: (place: SelectedPlace) => void
  /**
   * Best-available location hint that biases suggest ranking toward where the user is looking
   * (UC-018 WI-2). Decided by the page (pickSuggestLocation) — this component stays presentational
   * and only forwards it to useSuggest. Null → no bias (today's behaviour).
   */
  near?: LatLng | null
}

/**
 * The top "Kam to bude?" destination search overlay for the map-first customer order flow
 * (UC-015 WI-2). A single text field that, on typing >= 3 chars, expands a suggestions list
 * backed by useSuggest (anonymous-by-slug — works logged-out). Selecting a suggestion calls
 * back with a SelectedPlace (label + non-optional coords, so no geocode-on-select is needed);
 * the page (WI-4) owns the order-flow state — this component is purely presentational.
 *
 * ARIA combobox pattern: the input owns focus and keyboard (ArrowUp/Down move the active
 * option, Enter selects, Escape collapses); the active option is tracked via
 * aria-activedescendant. IDREF-carrying attributes (aria-controls, aria-activedescendant) are
 * emitted ONLY while the list is open so no dangling references reach the DOM
 * (rules/web-accessibility.md#semantics, #keyboard-focus).
 */
export function DestinationSearch({ onSelectDestination, near }: DestinationSearchProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const { items, isLoading, isEmpty } = useSuggest(query, near)

  const listId = useId()
  const optionId = (index: number): string => `${listId}-opt-${index}`

  const showList = open && items.length > 0
  const showEmpty = open && isEmpty && items.length === 0
  const expanded = showList || showEmpty || (open && isLoading)

  function handleType(next: string): void {
    setQuery(next)
    setOpen(true)
    setActiveIndex(-1)
  }

  function pick(item: GeoSuggestItem): void {
    setOpen(false)
    setActiveIndex(-1)
    setQuery(item.label)
    onSelectDestination({ label: item.label, lat: item.lat, lng: item.lng })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (!showList) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((prev) => (prev + 1) % items.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1))
      return
    }
    if (event.key === 'Enter' && activeIndex >= 0 && activeIndex < items.length) {
      event.preventDefault()
      pick(items[activeIndex])
    }
  }

  return (
    <Wrapper>
      <Input
        type="text"
        role="combobox"
        aria-label={t('customer.mapOrder.searchPlaceholder')}
        placeholder={t('customer.mapOrder.searchPlaceholder')}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        value={query}
        onChange={(e) => handleType(e.target.value)}
        onKeyDown={handleKeyDown}
      />

      {open && isLoading && <SearchingLoader />}

      {showList && (
        <List id={listId} role="listbox">
          {items.map((item, index) => {
            const meta = suggestionMeta(item)
            return (
              <Option
                key={`${item.label}-${item.lat}-${item.lng}`}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                $active={index === activeIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(item)}
              >
                <OptionLabel>{item.label}</OptionLabel>
                {meta && <OptionMeta>{meta}</OptionMeta>}
              </Option>
            )
          })}
        </List>
      )}

      {showEmpty && <Empty role="status">{t('customer.mapOrder.searchEmpty')}</Empty>}
    </Wrapper>
  )
}
