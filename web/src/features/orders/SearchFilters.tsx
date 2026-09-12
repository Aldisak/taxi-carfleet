import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { useQuery } from '@tanstack/react-query'
import { getDrivers } from '../../shared/api/client'
import { useDebouncedValue } from './useDebouncedValue'
import type { OrderFilterState } from './orderFilters'

const FiltersBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: flex-end;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`

const FilterGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`

const Label = styled.label`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
`

const Input = styled.input`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  min-width: 130px;

  &:focus {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 1px;
  }
`

const Select = styled.select`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  min-width: 130px;

  &:focus {
    outline: 2px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 1px;
  }
`

const Button = styled.button`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.md};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    opacity: 0.9;
  }
`

const SecondaryButton = styled(Button)`
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  border: 1px solid ${({ theme }) => theme.colors.border};
`

const StatusPillsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.xs};
  max-width: 260px;
`

const StatusPill = styled.button<{ $active: boolean }>`
  padding: 2px 10px;
  border-radius: 12px;
  border: 1px solid ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ $active, theme }) => ($active ? theme.colors.primary + '22' : theme.colors.background)};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.textSecondary)};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
  }
`

const ORDER_STATUSES = ['New', 'Assigned', 'Accepted', 'Arrived', 'InProgress', 'Completed', 'Cancelled']

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
  onExportCsv: () => void
}

/** The filter bar for the search page. Debounces the text search field by 300ms. */
export function SearchFilters({ filters, onFiltersChange, onExportCsv }: SearchFiltersProps) {
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

  function handleFromChange(e: React.ChangeEvent<HTMLInputElement>) {
    onFiltersChange({ ...filters, from: e.target.value, page: 1 })
  }

  function handleToChange(e: React.ChangeEvent<HTMLInputElement>) {
    onFiltersChange({ ...filters, to: e.target.value, page: 1 })
  }

  function handleStatusToggle(status: string) {
    const current = filters.status ?? []
    const next = current.includes(status)
      ? current.filter((s) => s !== status)
      : [...current, status]
    onFiltersChange({ ...filters, status: next.length > 0 ? next : [], page: 1 })
  }

  function handleDriverChange(e: React.ChangeEvent<HTMLSelectElement>) {
    onFiltersChange({ ...filters, driverId: e.target.value || undefined, page: 1 })
  }

  return (
    <FiltersBar>
      <FilterGroup>
        <Label htmlFor="sf-from">{t('search.filters.dateFrom')}</Label>
        <Input
          id="sf-from"
          type="date"
          value={fromValue}
          onChange={handleFromChange}
          aria-label={t('search.filters.dateFrom')}
        />
      </FilterGroup>

      <FilterGroup>
        <Label htmlFor="sf-to">{t('search.filters.dateTo')}</Label>
        <Input
          id="sf-to"
          type="date"
          value={toValue}
          onChange={handleToChange}
          aria-label={t('search.filters.dateTo')}
        />
      </FilterGroup>

      <FilterGroup>
        <Label>{t('search.filters.status')}</Label>
        <StatusPillsContainer aria-label={t('search.filters.status')}>
          {ORDER_STATUSES.map((s) => (
            <StatusPill
              key={s}
              type="button"
              $active={filters.status?.includes(s) ?? false}
              onClick={() => handleStatusToggle(s)}
              aria-pressed={filters.status?.includes(s) ?? false}
            >
              {t(`status.order.${s}`)}
            </StatusPill>
          ))}
        </StatusPillsContainer>
      </FilterGroup>

      <FilterGroup>
        <Label htmlFor="sf-driver">{t('search.filters.driver')}</Label>
        <Select
          id="sf-driver"
          value={filters.driverId ?? ''}
          onChange={handleDriverChange}
          aria-label={t('search.filters.driver')}
        >
          <option value="">{t('search.filters.allDrivers')}</option>
          {driversData?.items.map((d) => (
            <option key={d.driverId} value={d.driverId}>
              {d.displayName}
            </option>
          ))}
        </Select>
      </FilterGroup>

      <FilterGroup>
        <Label htmlFor="sf-search">{t('search.filters.search')}</Label>
        <Input
          id="sf-search"
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('search.filters.searchPlaceholder')}
          aria-label={t('search.filters.search')}
        />
      </FilterGroup>

      <SecondaryButton type="button" onClick={onExportCsv}>
        {t('search.filters.exportCsv')}
      </SecondaryButton>
    </FiltersBar>
  )
}
