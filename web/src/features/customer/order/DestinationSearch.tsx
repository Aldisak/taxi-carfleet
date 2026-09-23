import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import type { GeoSuggestItem } from '../../../shared/api/client'
import { suggestionMeta } from '../../../shared/geo/suggestionMeta'
import { SearchingLoader } from '../../../shared/ui/SearchingLoader'
import { Icon } from '../../../shared/ui/icons/Icon'
import { ListRow, ListIcon } from '../../../shared/ui/ListRow'
import { useSuggest } from './useSuggest'
import type { SelectedPlace } from './orderFlowState'
import type { LatLng } from '../shell/mapCamera'

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--surface);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-sheet);
  padding: 12px;
`

// The combobox input stays a bespoke kit-styled control (not the shared Field) because it carries
// the ARIA combobox contract — role="combobox", aria-activedescendant, aria-controls — that the
// e2e binds to and that the Field primitive does not model. It stays live and directly fillable.
const Control = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  padding: 0 14px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid transparent;

  &:focus-within {
    background: var(--surface);
    border: 2px solid var(--ink);
  }
`

const LeadingIcon = styled.span`
  display: inline-flex;
  align-items: center;
  color: var(--ink-3);
`

const Input = styled.input`
  flex: 1 1 auto;
  min-width: 0;
  height: 56px;
  border: none;
  background: transparent;
  outline: none;
  font-family: inherit;
  font-size: var(--fs-body-lg);
  color: var(--ink);

  &::placeholder {
    color: var(--ink-3);
  }
`

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
`

const OptionItem = styled.li<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 60px;
  padding: 8px;
  border-radius: var(--r-md);
  background: ${({ $active }) => ($active ? 'var(--surface-2)' : 'transparent')};
  cursor: pointer;

  &:hover {
    background: var(--surface-2);
  }
`

const OptionBody = styled.span`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`

const OptionLabel = styled.span`
  font-size: var(--fs-body-lg);
  color: var(--ink);

  strong {
    font-weight: var(--fw-extra);
    color: var(--ink);
  }
`

const OptionMeta = styled.span`
  font-size: var(--fs-caption);
  color: var(--ink-2);
`

const Empty = styled.p`
  margin: 0;
  padding: 12px 14px;
  font-size: var(--fs-caption);
  color: var(--ink-2);
`

const Attribution = styled.p`
  margin: 4px 0 0;
  font-size: var(--fs-caption);
  color: var(--ink-3);
  text-align: center;
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
  /**
   * Optional "Vybrat cíl na mapě" affordance (UC-020 WI-2). When provided it is invoked when the
   * customer taps the pick-on-map row; the page can wire it to a map-pick surface. When omitted the
   * row still renders and simply collapses the search back to the map (the default map is behind).
   */
  onPickOnMap?: () => void
}

/**
 * The top "Kam to bude?" destination search overlay for the map-first customer order flow
 * (UC-015 WI-2, restyled onto the UI kit in UC-020 WI-2). A single text field that, on typing
 * >= 3 chars, expands a suggestions list backed by useSuggest (anonymous-by-slug — works
 * logged-out). Selecting a suggestion calls back with a SelectedPlace (label + non-optional
 * coords, so no geocode-on-select is needed); the page (WI-4) owns the order-flow state.
 *
 * The input stays a live, directly-fillable `role="combobox"` — the e2e fills it immediately on
 * /customer with no intermediate tap, and the accessible name stays /Kam to bude/. Restyle only:
 * kit surfaces + tokens, ListRow-styled suggestions with the MATCHED SUBSTRING bolded, a
 * "Vybrat cíl na mapě" row, and the Mapy.com suggestion attribution footer.
 *
 * ARIA combobox pattern: the input owns focus and keyboard (ArrowUp/Down move the active option,
 * Enter selects, Escape collapses); the active option is tracked via aria-activedescendant.
 * IDREF-carrying attributes (aria-controls, aria-activedescendant) are emitted ONLY while the list
 * is open so no dangling references reach the DOM (rules/web-accessibility.md#semantics, #keyboard-focus).
 */
export function DestinationSearch({ onSelectDestination, near, onPickOnMap }: DestinationSearchProps) {
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
    // Use Mapy's `name` (the full address incl. house number) — NOT `label` (the type category
    // "Adresa"/"Ulice"), which used to leak into the input as the literal word "Adresa".
    setQuery(item.name)
    onSelectDestination({ label: item.name, lat: item.lat, lng: item.lng })
  }

  function handlePickOnMap(): void {
    setOpen(false)
    setActiveIndex(-1)
    onPickOnMap?.()
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
      <Control>
        <LeadingIcon aria-hidden="true">
          <Icon name="search" />
        </LeadingIcon>
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
      </Control>

      {open && isLoading && <SearchingLoader />}

      {showList && (
        <List id={listId} role="listbox">
          {items.map((item, index) => {
            const meta = suggestionMeta(item)
            // Explicit aria-label carries the CLEAN name (+ meta) so the presentational <strong>
            // substring bolding does not fragment the accessible name (an inline <strong> otherwise
            // injects a word break, e.g. "Nádr ažní"). Screen-reader users still hear the full
            // "name · street · municipality"; the e2e and unit tests bind on this stable name.
            const accName = meta ? `${item.name} ${meta}` : item.name
            return (
              <OptionItem
                key={`${item.name}-${item.lat}-${item.lng}`}
                id={optionId(index)}
                role="option"
                aria-label={accName}
                aria-selected={index === activeIndex}
                $active={index === activeIndex}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(item)}
              >
                <ListIcon icon={<Icon name="pin" />} />
                <OptionBody>
                  <OptionLabel>{highlightMatch(item.name, query)}</OptionLabel>
                  {meta && <OptionMeta>{meta}</OptionMeta>}
                </OptionBody>
              </OptionItem>
            )
          })}
        </List>
      )}

      {showEmpty && <Empty role="status">{t('customer.mapOrder.searchEmpty')}</Empty>}

      <ListRow
        icon={<ListIcon icon={<Icon name="map" />} tone="accent" />}
        title={t('customer.mapOrder.pickOnMap')}
        onClick={handlePickOnMap}
      />

      <Attribution>{t('map.mapyLogoAlt')}</Attribution>
    </Wrapper>
  )
}

/**
 * Splits `text` around the (case-insensitive) first occurrence of `query` and wraps the match in
 * a `<strong>`. Purely presentational — the returned nodes render the full original label so the
 * accessible name (and the meta line) are unchanged. Empty/absent query → the plain text.
 */
function highlightMatch(text: string, query: string): ReactNode {
  const q = query.trim()
  if (q.length === 0) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return text
  const before = text.slice(0, idx)
  const match = text.slice(idx, idx + q.length)
  const after = text.slice(idx + q.length)
  return (
    <>
      {before}
      <strong>{match}</strong>
      {after}
    </>
  )
}
