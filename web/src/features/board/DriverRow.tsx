import { useState, useEffect } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { getDriverStatusInfo, getDriverStatusTone } from './statusPill'
import { formatPositionAge } from './positionAge'
import { useOverrideStatus } from './useOverrideStatus'
import { useDriverFocusStore } from './useDriverFocusStore'
import { DeskPill } from '../../shared/ui/desk'
import { Icon } from '../../shared/ui/icons/Icon'
import { useHubConnectionState, isServerActionBlocked } from '../../shared/realtime/useFleetHub'
import type { DriverSummaryDto } from '../../shared/api/client'
import type { OverrideStatus } from './useOverrideStatus'

// ---------------------------------------------------------------------------
// Styled components — desk kit tokens (CSS custom properties)
// ---------------------------------------------------------------------------

const Row = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;

  &:hover {
    background: var(--surface-2);
  }
`

const RowTop = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
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

const DriverName = styled.span`
  font-size: var(--fs-label);
  font-weight: var(--fw-bold);
  color: var(--ink);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Plate = styled.span`
  font-size: var(--fs-caption);
  color: var(--ink-2);
  font-family: 'Manrope', monospace;
`

const RowMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-caption);
  color: var(--ink-2);
`

const OrderCode = styled.span`
  font-family: 'Manrope', monospace;
  color: var(--ink);
`

const MenuBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-left: auto;
  padding: 0;
  font-size: var(--fs-label);
  line-height: 1;
  color: var(--ink-2);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  cursor: pointer;

  &:hover {
    background: var(--surface-2);
    color: var(--ink);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`

const Popover = styled.div`
  position: absolute;
  right: 0;
  top: 100%;
  z-index: 100;
  min-width: 140px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-float);
  overflow: hidden;
`

const PopoverTitle = styled.div`
  padding: 6px 12px;
  font-size: 11px;
  font-weight: var(--fw-extra);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-2);
  border-bottom: 1px solid var(--line);
`

const PopoverItem = styled.button`
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  font-size: var(--fs-label);
  font-family: inherit;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--ink);

  &:hover {
    background: var(--surface-2);
  }
`

const PopoverWrapper = styled.div`
  position: relative;
  margin-left: auto;
`

const ErrorMsg = styled.span`
  font-size: var(--fs-caption);
  color: var(--danger);
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
  const statusTone = getDriverStatusTone(driver.status)

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

  function handleMenuClick(e: React.MouseEvent) {
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
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleRowClick() }}
    >
      <RowTop>
        <StatusDot $tone={statusTone} aria-hidden="true" />
        <DriverName>{driver.displayName}</DriverName>
        {driver.currentVehiclePlate && (
          <Plate aria-label="vehicle-plate">{driver.currentVehiclePlate}</Plate>
        )}
        <span aria-label={`driver-status-${driver.status}`}>
          <DeskPill tone={statusTone}>{t(statusInfo.labelKey)}</DeskPill>
        </span>
        <PopoverWrapper>
          <MenuBtn
            type="button"
            aria-label={t('drivers.menuLabel')}
            onClick={handleMenuClick}
            aria-expanded={showPopover}
            aria-haspopup="menu"
            disabled={blocked}
          >
            <Icon name="menu" size={16} />
          </MenuBtn>
          {showPopover && (
            <Popover role="menu" aria-label="status-override-menu">
              <PopoverTitle>{t('drivers.overrideTitle')}</PopoverTitle>
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
