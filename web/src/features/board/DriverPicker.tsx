import { useRef, useEffect, useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { getDrivers } from '../../shared/api/client'
import { sortDriversByDistance, haversineKm } from './driverDistanceSort'
import { getDriverStatusTone } from './statusPill'
import type { DriverSummaryDto } from '../../shared/api/client'

// ---------------------------------------------------------------------------
// Styled components — floating desk card (CSS custom property tokens)
// ---------------------------------------------------------------------------

const PickerContainer = styled.div`
  position: absolute;
  z-index: 200;
  width: 300px;
  max-width: 300px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-float);
  overflow: hidden;
`

const PickerHeader = styled.div`
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
`

const PickerTitle = styled.div`
  font-size: var(--fs-caption);
  font-weight: var(--fw-extra);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-2);
`

const PickerSubtitle = styled.div`
  margin-top: 2px;
  font-size: 11px;
  color: var(--ink-3);
`

const DriverList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
`

const DriverItem = styled.li<{ $focused: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: var(--fs-label);
  color: var(--ink);
  background: ${({ $focused }) => ($focused ? 'var(--surface-2)' : 'transparent')};

  &:hover {
    background: var(--surface-2);
  }
`

const StatusDot = styled.span<{ $tone: string }>`
  width: 8px;
  height: 8px;
  border-radius: var(--r-pill);
  flex-shrink: 0;
  background: ${({ $tone }) => {
    switch ($tone) {
      case 'success': return 'var(--success)'
      case 'info': return 'var(--info)'
      case 'warning': return 'var(--warning)'
      default: return 'var(--ink-3)'
    }
  }};
`

const Name = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Plate = styled.span`
  font-size: 11px;
  color: var(--ink-2);
  font-family: 'Manrope', monospace;
`

const Meta = styled.span`
  margin-left: auto;
  font-size: 11px;
  color: var(--ink-3);
  white-space: nowrap;
`

const EmptyMsg = styled.div`
  padding: 12px;
  font-size: var(--fs-label);
  color: var(--ink-2);
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

function distanceLabel(driver: DriverSummaryDto, pickupLat: number, pickupLng: number): string | null {
  if (driver.lastLat == null || driver.lastLng == null) return null
  const km = haversineKm(driver.lastLat, driver.lastLng, pickupLat, pickupLng)
  return `${km.toFixed(1)} km`
}

/** Inline driver picker sorted by distance to pickup. Free drivers first, busy drivers last. */
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
      <PickerHeader>
        <PickerTitle>{t('board.driverPicker.title')}</PickerTitle>
        <PickerSubtitle>{t('board.driverPicker.byDistance')}</PickerSubtitle>
      </PickerHeader>
      {isLoading ? (
        <EmptyMsg>{t('board.driverPicker.loading')}</EmptyMsg>
      ) : sortedDrivers.length === 0 ? (
        <EmptyMsg>{t('board.driverPicker.noDrivers')}</EmptyMsg>
      ) : (
        <DriverList role="presentation">
          {sortedDrivers.map((driver, i) => {
            const dist = distanceLabel(driver, pickupLat, pickupLng)
            const isBusy = driver.status !== 'Free'
            return (
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
                <StatusDot $tone={getDriverStatusTone(driver.status)} aria-hidden="true" />
                <Name>{driver.displayName}</Name>
                {driver.currentVehiclePlate && <Plate>{driver.currentVehiclePlate}</Plate>}
                <Meta>{isBusy ? t('board.driverPicker.busy') : dist}</Meta>
              </DriverItem>
            )
          })}
        </DriverList>
      )}
    </PickerContainer>
  )
}
