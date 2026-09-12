import { useState, useEffect } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { getDriverStatusInfo } from './statusPill'
import { formatPositionAge } from './positionAge'
import { useOverrideStatus } from './useOverrideStatus'
import { useDriverFocusStore } from './useDriverFocusStore'
import { useHubConnectionState, isServerActionBlocked } from '../../shared/realtime/useFleetHub'
import type { DriverSummaryDto } from '../../shared/api/client'
import type { OverrideStatus } from './useOverrideStatus'

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Row = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.colors.background};
  }
`

const RowTop = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  flex-wrap: wrap;
`

const DriverName = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.text};
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Plate = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-family: monospace;
`

const RowMeta = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const OrderCode = styled.span`
  font-family: monospace;
`

const OverrideBtn = styled.button`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  padding: 1px ${({ theme }) => theme.spacing.xs};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  margin-left: auto;

  &:hover {
    background: ${({ theme }) => theme.colors.primary};
    color: #fff;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`

const Popover = styled.div`
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 100;
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: ${({ theme }) => theme.shadows.md};
  min-width: 120px;
  overflow: hidden;
`

const PopoverItem = styled.button`
  display: block;
  width: 100%;
  text-align: left;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  background: transparent;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text};

  &:hover {
    background: ${({ theme }) => theme.colors.background};
  }
`

const PopoverWrapper = styled.div`
  position: relative;
`

const ErrorMsg = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ theme }) => theme.colors.error};
  display: block;
`

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DriverRowProps {
  driver: DriverSummaryDto
  currentOrderCode?: string | null
}

/** A single row in the drivers column. */
export function DriverRow({ driver, currentOrderCode }: DriverRowProps) {
  const { t } = useTranslation()
  const [showPopover, setShowPopover] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const overrideStatus = useOverrideStatus()
  const setFocusedDriverId = useDriverFocusStore(s => s.setFocusedDriverId)
  const blocked = isServerActionBlocked(useHubConnectionState())

  const statusInfo = getDriverStatusInfo(driver.status as never)
  // Since theme colors are not accessible here we need to use inline styles or pass via prop
  // We'll render the color by matching the colorKey in the component

  // Live ticking position age — updates every second
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const posAge = formatPositionAge(driver.lastPositionAt, nowMs, t)

  function handleRowClick() {
    setFocusedDriverId(driver.driverId)
  }

  function handleOverrideClick(e: React.MouseEvent) {
    e.stopPropagation()
    setShowPopover(p => !p)
  }

  function handleSelectStatus(status: OverrideStatus) {
    if (blocked) { setShowPopover(false); return }
    setShowPopover(false)
    setErrorMsg(null)
    overrideStatus.mutate(
      { driverId: driver.driverId, status },
      {
        onError: () => {
          setErrorMsg(t('drivers.overrideError'))
        },
      },
    )
  }

  return (
    <Row
      onClick={handleRowClick}
      aria-label={`driver-row-${driver.driverId}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') handleRowClick() }}
    >
      <RowTop>
        <DriverName>{driver.displayName}</DriverName>
        {driver.currentVehiclePlate && (
          <Plate aria-label="vehicle-plate">{driver.currentVehiclePlate}</Plate>
        )}
        <DriverStatusPill status={driver.status} label={t(statusInfo.labelKey)} />
        <PopoverWrapper>
          <OverrideBtn
            type="button"
            aria-label={t('drivers.overrideTitle')}
            onClick={handleOverrideClick}
            aria-expanded={showPopover}
            disabled={blocked}
          >
            {t('drivers.overrideTitle')}
          </OverrideBtn>
          {showPopover && (
            <Popover role="menu" aria-label="status-override-menu">
              <PopoverItem
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); handleSelectStatus('Free') }}
                aria-label="set-status-Free"
              >
                {t('drivers.setFree')}
              </PopoverItem>
              <PopoverItem
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); handleSelectStatus('Busy') }}
                aria-label="set-status-Busy"
              >
                {t('drivers.setBusy')}
              </PopoverItem>
              <PopoverItem
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); handleSelectStatus('Offline') }}
                aria-label="set-status-Offline"
              >
                {t('drivers.setOffline')}
              </PopoverItem>
            </Popover>
          )}
        </PopoverWrapper>
      </RowTop>
      <RowMeta>
        <span aria-label="position-age">{posAge}</span>
        {currentOrderCode && (
          <OrderCode aria-label="current-order-code">{currentOrderCode}</OrderCode>
        )}
      </RowMeta>
      {errorMsg && <ErrorMsg role="alert">{errorMsg}</ErrorMsg>}
    </Row>
  )
}

// ---------------------------------------------------------------------------
// Internal: StatusPill using styled-component with inline color
// ---------------------------------------------------------------------------

interface StatusPillProps {
  status: string
  label: string
}

function DriverStatusPill({ status, label }: StatusPillProps) {
  return (
    <StatusPillByStatus $status={status} aria-label={`driver-status-${status}`}>
      {label}
    </StatusPillByStatus>
  )
}

const StatusPillByStatus = styled.span<{ $status: string }>`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  padding: 1px ${({ theme }) => theme.spacing.xs};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  background: ${({ $status, theme }) => {
    switch ($status) {
      case 'Free': return theme.colors.statusFree
      case 'EnRoute': return theme.colors.statusEnRoute
      case 'Busy': return theme.colors.statusBusy
      default: return theme.colors.statusOffline
    }
  }};
  color: ${({ $status, theme }) => {
    switch ($status) {
      case 'Free': return theme.colors.statusFreeText
      case 'EnRoute': return theme.colors.statusEnRouteText
      case 'Busy': return theme.colors.statusBusyText
      default: return theme.colors.statusOfflineText
    }
  }};
  white-space: nowrap;
`
