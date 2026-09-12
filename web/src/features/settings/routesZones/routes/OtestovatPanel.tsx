import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { useRouteTestQuote } from './useRouteTestQuote'
import type { PinPoint } from '../PinPickerMap'

const PinPickerMap = lazy(() => import('../PinPickerMap'))

const Panel = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.background};
`

const Title = styled.h3`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
`

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const Input = styled.input`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
`

const Result = styled.p<{ $kind: string }>`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  background: ${({ theme, $kind }) => ($kind === 'fixed' ? theme.colors.background : theme.colors.surface)};
  border: 1px solid ${({ theme, $kind }) => ($kind === 'fixed' ? theme.colors.primary : theme.colors.border)};
  color: ${({ theme }) => theme.colors.text};
`

const MapStatus = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const czk = new Intl.NumberFormat('cs-CZ')

/**
 * The dispatcher "Otestovat" panel. A FleetAdmin enters a pickup (and optionally a dropoff +
 * an arbitrary time) and sees exactly what POST /pricing/quote returns — Fixed / Estimate /
 * Meter — so they can verify a route rule (e.g. a night-only route at 03:30) BEFORE enabling
 * it. Coordinates come from a lazy Leaflet pin; the quote runs live via useRouteTestQuote.
 */
export function OtestovatPanel() {
  const { t } = useTranslation()
  const [pickup, setPickup] = useState<PinPoint | null>(null)
  const [dropoff, setDropoff] = useState<PinPoint | null>(null)
  const [atLocal, setAtLocal] = useState('')

  const at = atLocal ? new Date(atLocal).toISOString() : null

  const { view, isLoading, errorKey } = useRouteTestQuote({
    pickupLat: pickup?.lat ?? null,
    pickupLng: pickup?.lng ?? null,
    dropoffLat: dropoff?.lat ?? null,
    dropoffLng: dropoff?.lng ?? null,
    at,
  })

  function renderResult(): React.ReactNode {
    if (errorKey) return <Result $kind="error" role="status">{t(errorKey)}</Result>
    if (isLoading) return <MapStatus role="status">{t('settings.routes.test.loading')}</MapStatus>
    if (!view) return <MapStatus role="status">{t('settings.routes.test.pickPickup')}</MapStatus>

    switch (view.kind) {
      case 'fixed':
        return (
          <Result $kind="fixed" role="status">
            {t('settings.routes.test.fixed', { price: czk.format(view.priceCzk) })}
          </Result>
        )
      case 'estimate':
        return (
          <Result $kind="estimate" role="status">
            {t('settings.routes.test.estimate', { low: czk.format(view.lowCzk), high: czk.format(view.highCzk) })}
          </Result>
        )
      case 'meter':
        return <Result $kind="meter" role="status">{t('settings.routes.test.meter')}</Result>
      default:
        return <MapStatus role="status">{t('settings.routes.test.unknown')}</MapStatus>
    }
  }

  return (
    <Panel aria-label={t('settings.routes.test.title')}>
      <Title>{t('settings.routes.test.title')}</Title>

      <MapStatus role="status">
        {pickup
          ? t('settings.routes.test.pickupSet', { lat: pickup.lat.toFixed(5), lng: pickup.lng.toFixed(5) })
          : t('settings.routes.test.pickPickup')}
      </MapStatus>
      <Suspense fallback={<MapStatus>{t('settings.routes.editor.loadingMap')}</MapStatus>}>
        <PinPickerMap value={pickup} onPick={setPickup} />
      </Suspense>

      <MapStatus role="status">
        {dropoff
          ? t('settings.routes.test.dropoffSet', { lat: dropoff.lat.toFixed(5), lng: dropoff.lng.toFixed(5) })
          : t('settings.routes.test.dropoffOptional')}
      </MapStatus>
      <Suspense fallback={<MapStatus>{t('settings.routes.editor.loadingMap')}</MapStatus>}>
        <PinPickerMap value={dropoff} onPick={setDropoff} />
      </Suspense>

      <Field>
        {t('settings.routes.test.at')}
        <Input
          type="datetime-local"
          value={atLocal}
          onChange={(e) => setAtLocal(e.target.value)}
          aria-label={t('settings.routes.test.at')}
        />
      </Field>

      {renderResult()}
    </Panel>
  )
}
