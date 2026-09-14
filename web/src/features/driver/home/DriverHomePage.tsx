import { useState, useEffect } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useDriverMe } from './useDriverMe'
import { useMySummary } from './useMySummary'
import { useGoOnline } from './useGoOnline'
import { useGoOffline } from './useGoOffline'
import { useOwnStatusSync } from './useOwnStatusSync'
import { useRouteToast } from './useRouteToast'
import { usePushSubscription } from '../../../shared/push/usePushSubscription'
import { StatusButton } from './StatusButton'
import { VehicleSelector } from './VehicleSelector'
import { ConnectionDot } from './ConnectionDot'
import { deriveHomeState } from './homeState'
import type { DriverStatus } from './homeState'

const Page = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: ${({ theme }) => theme.colors.background};
`

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`

const Title = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
`

const Body = styled.div`
  flex: 1;
  padding: ${({ theme }) => theme.spacing.lg};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`

const SummaryRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  flex-wrap: wrap;
`

const SummaryChip = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  min-width: 72px;
  flex: 1;
`

const ChipValue = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

const ChipLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
`

const StatusLabel = styled.p`
  text-align: center;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`

const ErrorText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.error};
  text-align: center;
  margin: 0;
`

const RideLink = styled.a`
  display: block;
  text-align: center;
  padding: ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.primary};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  text-decoration: none;
  border: 1px solid ${({ theme }) => theme.colors.primary};
  border-radius: ${({ theme }) => theme.borderRadius.md};
`

const ButtonArea = styled.div`
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`

const Toast = styled.div`
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.success};
  color: #ffffff;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  text-align: center;
`

/**
 * Driver home page — status button state machine, vehicle selector, connection dot, summary chips.
 * The hub singleton, offer listener, and offer takeover are hosted by DriverLayout (D12).
 */
export function DriverHomePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const routeToast = useRouteToast()

  const { data: meData } = useDriverMe()
  const { data: summaryData } = useMySummary()
  const { ensureSubscribed } = usePushSubscription()

  // Push notifications are MANDATORY for drivers (assignment 05 §6 / UC-003 priming): register a
  // Web Push subscription once on landing. Feature-detected + idempotent; no-ops where unsupported.
  useEffect(() => {
    void ensureSubscribed()
  }, [ensureSubscribed])
  const { isPending: goOnlinePending, error: goOnlineError, goOnline } = useGoOnline()
  const { isPending: goOfflinePending, goOffline } = useGoOffline()
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [hasLocation, setHasLocation] = useState(true) // optimistic until Permissions API says denied

  // Pre-populate vehicle selector when meData arrives (loads after mount)
  useEffect(() => {
    if (meData?.currentVehicleId && !selectedVehicleId) {
      setSelectedVehicleId(meData.currentVehicleId)
    }
  // We intentionally only run when currentVehicleId first becomes available.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meData?.currentVehicleId])

  // Check geolocation permission via Permissions API; fall back to optimistic true when unavailable.
  useEffect(() => {
    if (typeof navigator === 'undefined') return
    if (!navigator.permissions) return // API absent — optimistic true stays
    navigator.permissions.query({ name: 'geolocation' })
      .then(result => {
        setHasLocation(result.state !== 'denied')
        result.onchange = () => { setHasLocation(result.state !== 'denied') }
      })
      .catch(() => { /* ignore — optimistic true */ })
  }, [])

  // Sync own driver status from hub events
  useOwnStatusSync(meData?.driverId)

  const status = (meData?.status ?? 'Offline') as DriverStatus
  const hasVehicle = !!selectedVehicleId

  const homeState = deriveHomeState({ status, hasVehicle, hasLocation })

  // Build a mock vehicle list from GetMe data (one entry if we have a vehicle)
  const vehicles = meData?.currentVehicleId
    ? [{
        id: meData.currentVehicleId,
        plate: meData.currentVehiclePlate ?? meData.currentVehicleId.slice(0, 8),
        make: '',
        model: '',
      }]
    : []

  function handleButtonClick() {
    if (homeState.action === 'goOnline' && selectedVehicleId) {
      void goOnline(selectedVehicleId)
    } else if (homeState.action === 'goOffline') {
      void goOffline()
    } else if (homeState.action === 'viewRide') {
      navigate('/driver/ride')
    }
  }

  const disabledHint = homeState.disabledReason === 'noVehicle'
    ? 'driver.home.vehicle.noVehicleHint'
    : homeState.disabledReason === 'noLocation'
      ? 'driver.home.vehicle.noLocationHint'
      : null

  return (
    <>
      {routeToast && (
        <Toast role="status">{t(routeToast)}</Toast>
      )}

      <Page>
        <TopBar>
          <Title>{t('driver.home.title')}</Title>
          <ConnectionDot />
        </TopBar>

        <Body>
          {/* Summary chips */}
          <SummaryRow>
            <SummaryChip>
              <ChipValue>{summaryData?.ridesCount ?? '—'}</ChipValue>
              <ChipLabel>{t('driver.home.summary.rides')}</ChipLabel>
            </SummaryChip>
            <SummaryChip>
              <ChipValue>{summaryData != null ? `${summaryData.cashTotalCzk} Kč` : '—'}</ChipValue>
              <ChipLabel>{t('driver.home.summary.cash')}</ChipLabel>
            </SummaryChip>
            <SummaryChip>
              <ChipValue>{summaryData != null ? `${summaryData.cardTotalCzk} Kč` : '—'}</ChipValue>
              <ChipLabel>{t('driver.home.summary.card')}</ChipLabel>
            </SummaryChip>
            <SummaryChip>
              <ChipValue>{summaryData != null ? `${summaryData.hoursOnline.toFixed(1)}h` : '—'}</ChipValue>
              <ChipLabel>{t('driver.home.summary.hours')}</ChipLabel>
            </SummaryChip>
          </SummaryRow>

          {/* Secondary status label */}
          {homeState.statusLabel && (
            <StatusLabel>{t(homeState.statusLabel)}</StatusLabel>
          )}

          {/* Ride in progress link for Busy/EnRoute */}
          {(status === 'Busy' || status === 'EnRoute') && (
            <RideLink href="/driver/ride">{t('driver.home.status.viewRide')} →</RideLink>
          )}

          {/* Vehicle selector when offline */}
          {homeState.showVehicleSelector && (
            <VehicleSelector
              vehicles={vehicles}
              selectedVehicleId={selectedVehicleId}
              onSelect={id => setSelectedVehicleId(id)}
            />
          )}

          {/* Error message */}
          {goOnlineError && (
            <ErrorText>{t(goOnlineError)}</ErrorText>
          )}

          <ButtonArea>
            <StatusButton
              labelKey={homeState.buttonLabel}
              variant={homeState.buttonVariant}
              disabled={homeState.buttonDisabled}
              disabledHint={disabledHint}
              isPending={goOnlinePending || goOfflinePending}
              onClick={handleButtonClick}
            />
          </ButtonArea>
        </Body>
      </Page>
    </>
  )
}
