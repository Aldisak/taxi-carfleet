import { useRef, useEffect, useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { getDrivers } from '../../shared/api/client'
import { sortDriversByDistance } from './driverDistanceSort'
import type { DriverSummaryDto } from '../../shared/api/client'

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const PickerContainer = styled.div`
  position: absolute;
  z-index: 200;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: ${({ theme }) => theme.shadows.md};
  min-width: 240px;
  max-width: 320px;
  overflow: hidden;
`

const PickerHeader = styled.div`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`

const DriverList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 200px;
  overflow-y: auto;
`

const DriverItem = styled.li<{ $focused: boolean }>`
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  cursor: pointer;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  background: ${({ $focused, theme }) => ($focused ? theme.colors.primary : 'transparent')};
  color: ${({ $focused, theme }) => ($focused ? '#fff' : theme.colors.text)};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};

  &:hover {
    background: ${({ theme }) => theme.colors.primary};
    color: #fff;
  }
`

const StatusDot = styled.span<{ $status: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: ${({ $status, theme }) => {
    switch ($status) {
      case 'Free': return theme.colors.statusFree
      case 'Busy': return theme.colors.statusBusy
      case 'EnRoute': return theme.colors.statusEnRoute
      default: return theme.colors.statusOffline
    }
  }};
`

const EmptyMsg = styled.div`
  padding: ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
`

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface DriverPickerProps {
  pickupLat: number
  pickupLng: number
  onSelect: (driver: DriverSummaryDto) => void
  onClose: () => void
}

/** Inline driver picker sorted by distance to pickup. Free drivers first. Null-position last. */
export function DriverPicker({ pickupLat, pickupLng, onSelect, onClose }: DriverPickerProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: ['drivers'],
    queryFn: getDrivers,
    staleTime: 30_000,
  })

  const sortedDrivers = data
    ? sortDriversByDistance(data.items, pickupLat, pickupLng)
    : []

  // Focus container on mount for keyboard navigation
  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex(i => Math.min(i + 1, sortedDrivers.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && sortedDrivers[focusedIndex]) {
      e.preventDefault()
      onSelect(sortedDrivers[focusedIndex])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <PickerContainer
      ref={containerRef}
      role="listbox"
      aria-label={t('board.driverPicker.title')}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <PickerHeader>{t('board.driverPicker.title')}</PickerHeader>
      {isLoading ? (
        <EmptyMsg>{t('board.driverPicker.loading')}</EmptyMsg>
      ) : sortedDrivers.length === 0 ? (
        <EmptyMsg>{t('board.driverPicker.noDrivers')}</EmptyMsg>
      ) : (
        <DriverList>
          {sortedDrivers.map((driver, i) => (
            <DriverItem
              key={driver.driverId}
              role="option"
              aria-selected={i === focusedIndex}
              $focused={i === focusedIndex}
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(driver)
              }}
              onMouseEnter={() => setFocusedIndex(i)}
            >
              <StatusDot $status={driver.status} aria-hidden="true" />
              <span>{driver.displayName}</span>
              {driver.currentVehiclePlate && (
                <span style={{ marginLeft: 'auto', opacity: 0.7, fontSize: '11px' }}>
                  {driver.currentVehiclePlate}
                </span>
              )}
            </DriverItem>
          ))}
        </DriverList>
      )}
    </PickerContainer>
  )
}
