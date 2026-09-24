import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { useQuery } from '@tanstack/react-query'
import { Ctrl, Lbl, FilterChip } from '../../shared/ui/desk'
import { getDrivers } from '../../shared/api/client'
import { useDebouncedValue } from './useDebouncedValue'
import type { OrderFilterState } from './orderFilters'

const FiltersBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
  padding: 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
`

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
`

const SearchField = styled(FilterGroup)`
  width: 280px;
`

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`

/**
 * Coarse status buckets for the search filter chips (dispatcher redesign §4). The table still
 * shows the exact per-row status; the filter folds Assigned/Accepted/Arrived + InProgress into a
 * single "Probíhá" bucket. Each bucket maps to a concrete `orderFilters` status set — empty for
 * "Vše" (no filter). The chip group is single-select (radio-like): choosing a bucket replaces the
 * status filter, it does not toggle-append.
 */
const STATUS_BUCKETS: { key: string; statuses: string[] }[] = [
  { key: 'all', statuses: [] },
  { key: 'new', statuses: ['New'] },
  { key: 'inProgress', statuses: ['Assigned', 'Accepted', 'Arrived', 'InProgress'] },
  { key: 'completed', statuses: ['Completed'] },
  { key: 'cancelled', statuses: ['Cancelled'] },
]

/** Returns true when the two string arrays hold the same set (order-insensitive). */
function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((s) => set.has(s))
}

/** Derives the active bucket key from the current status filter; defaults to `'all'`. */
function activeBucketKey(status: string[] | undefined): string {
  const current = status ?? []
  const match = STATUS_BUCKETS.find((b) => sameSet(b.statuses, current))
  return match?.key ?? 'all'
}

/** Returns a YYYY-MM-DD string for the local date. */
function toDateInputValue(isoStr: string): string {
  const d = new Date(isoStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Returns today's YYYY-MM-DD in local time. */
function todayLocal(): string {
  const d = new Date()
  return toDateInputValue(d.toISOString())
}

interface SearchFiltersProps {
  filters: OrderFilterState
  onFiltersChange: (filters: OrderFilterState) => void
}

/** The filter bar for the search page. Debounces the text search field by 300ms. */
export function SearchFilters({ filters, onFiltersChange }: SearchFiltersProps) {
  const { t } = useTranslation()
  const { data: driversData } = useQuery({
    queryKey: ['drivers'],
    queryFn: getDrivers,
    staleTime: 60_000,
  })

  // Local text search state — debounced before propagating to filters
  const [searchInput, setSearchInput] = useState(filters.search ?? '')
  const debouncedSearch = useDebouncedValue(searchInput, 300)

  // Propagate debounced search to parent when it changes (useEffect prevents setState-in-render)
  useEffect(() => {
    const currentSearch = filters.search ?? ''
    if (debouncedSearch !== currentSearch) {
      onFiltersChange({ ...filters, search: debouncedSearch || undefined, page: 1 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  const fromValue = filters.from ?? todayLocal()
  const toValue = filters.to ?? todayLocal()
  const activeBucket = activeBucketKey(filters.status)

  function handleFromChange(value: string) {
    onFiltersChange({ ...filters, from: value, page: 1 })
  }

  function handleToChange(value: string) {
    onFiltersChange({ ...filters, to: value, page: 1 })
  }

  function handleBucketSelect(statuses: string[]) {
    onFiltersChange({ ...filters, status: statuses, page: 1 })
  }

  function handleDriverChange(value: string) {
    onFiltersChange({ ...filters, driverId: value || undefined, page: 1 })
  }

  return (
    <FiltersBar>
      <SearchField>
        <Lbl htmlFor="sf-search">{t('search.filters.search')}</Lbl>
        <Ctrl
          id="sf-search"
          type="text"
          value={searchInput}
          onChange={setSearchInput}
          placeholder={t('search.filters.searchPlaceholder')}
        />
      </SearchField>

      <FilterGroup>
        <Lbl htmlFor="sf-from">{t('search.filters.dateFrom')}</Lbl>
        <Ctrl id="sf-from" type="date" value={fromValue} onChange={handleFromChange} />
      </FilterGroup>

      <FilterGroup>
        <Lbl htmlFor="sf-to">{t('search.filters.dateTo')}</Lbl>
        <Ctrl id="sf-to" type="date" value={toValue} onChange={handleToChange} />
      </FilterGroup>

      <FilterGroup>
        <Lbl htmlFor="sf-driver">{t('search.filters.driver')}</Lbl>
        <Ctrl
          id="sf-driver"
          as="select"
          value={filters.driverId ?? ''}
          onChange={handleDriverChange}
          selectProps={{ 'aria-label': t('search.filters.driver') }}
        >
          <option value="">{t('search.filters.allDrivers')}</option>
          {driversData?.items.map((d) => (
            <option key={d.driverId} value={d.driverId}>
              {d.displayName}
            </option>
          ))}
        </Ctrl>
      </FilterGroup>

      <FilterGroup>
        <Lbl htmlFor="sf-status">{t('search.filters.status')}</Lbl>
        <ChipRow id="sf-status" role="group" aria-label={t('search.filters.status')}>
          {STATUS_BUCKETS.map((bucket) => (
            <FilterChip
              key={bucket.key}
              selected={activeBucket === bucket.key}
              onClick={() => handleBucketSelect(bucket.statuses)}
            >
              {t(`search.filters.statusChips.${bucket.key}`)}
            </FilterChip>
          ))}
        </ChipRow>
      </FilterGroup>
    </FiltersBar>
  )
}
