import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { useConnectionState } from '../../../shared/realtime/useFleetHub'
import { useOwnPositionStore } from '../position/useOwnPositionStore'

const Section = styled.section`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  padding: ${({ theme }) => theme.spacing.md};
`

const SectionTitle = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 ${({ theme }) => theme.spacing.xs} 0;
`

const Hint = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 ${({ theme }) => theme.spacing.md} 0;
`

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.sm} 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
`

const Label = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`

const Value = styled.span`
  color: ${({ theme }) => theme.colors.text};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  text-align: right;
`

type PermissionValue = 'granted' | 'denied' | 'prompt' | 'default' | 'unknown'

function formatPrague(iso: string): string {
  return new Date(iso).toLocaleString('cs-CZ', {
    timeZone: 'Europe/Prague',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/**
 * Diagnostics panel (spec §7): the dispatcher asks the driver to read these aloud.
 * Shows location + push permission states, the last position sent (B-position store),
 * and the SignalR connection state. All browser APIs are feature-detected (jsdom-safe).
 */
export function Diagnostika() {
  const { t } = useTranslation()
  const connectionState = useConnectionState()
  const lastSentAt = useOwnPositionStore(s => s.lastSentAt)

  const [locationPermission, setLocationPermission] = useState<PermissionValue>('unknown')

  // Push permission from the Notification API (undefined in jsdom → unknown).
  const pushPermission: PermissionValue =
    typeof Notification !== 'undefined' && Notification.permission
      ? (Notification.permission as PermissionValue)
      : 'unknown'

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions) return
    let active = true
    navigator.permissions
      .query({ name: 'geolocation' })
      .then(result => {
        if (!active) return
        setLocationPermission(result.state as PermissionValue)
        result.onchange = () => setLocationPermission(result.state as PermissionValue)
      })
      .catch(() => { /* leave unknown */ })
    return () => { active = false }
  }, [])

  function permissionLabel(value: PermissionValue): string {
    if (value === 'unknown') return t('driver.settings.diagnostika.unknown')
    return t(`driver.settings.diagnostika.permission.${value}`)
  }

  return (
    <Section aria-labelledby="diagnostika-title">
      <SectionTitle id="diagnostika-title">{t('driver.settings.diagnostika.title')}</SectionTitle>
      <Hint>{t('driver.settings.diagnostika.hint')}</Hint>

      <Row>
        <Label>{t('driver.settings.diagnostika.locationPermission')}</Label>
        <Value>{permissionLabel(locationPermission)}</Value>
      </Row>
      <Row>
        <Label>{t('driver.settings.diagnostika.pushPermission')}</Label>
        <Value>{permissionLabel(pushPermission)}</Value>
      </Row>
      <Row>
        <Label>{t('driver.settings.diagnostika.lastPositionSent')}</Label>
        <Value>{lastSentAt ? formatPrague(lastSentAt) : t('driver.settings.diagnostika.never')}</Value>
      </Row>
      <Row>
        <Label>{t('driver.settings.diagnostika.connectionState')}</Label>
        <Value>{t(`driver.settings.diagnostika.connection.${connectionState}`)}</Value>
      </Row>
    </Section>
  )
}
