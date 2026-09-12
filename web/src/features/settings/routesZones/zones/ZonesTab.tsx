import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import type { ZoneDto } from '../../../../shared/api/client'
import { useCreateZone, useDeleteZone, useZones } from './useZones'
import { circleToRequest, polygonToRequest, type DrawPoint } from './zoneDraw'
import type { CircleDraft, DrawMode } from './ZoneEditorMap'

// Code-split: Leaflet loads only inside this chunk so it never enters the /x initial bundle
// (rules/web-performance.md#code-splitting, #bundle-budget). This is the first Leaflet use
// on the dispatcher side — the lazy boundary is load-bearing for `npm run size`.
const ZoneEditorMap = lazy(() => import('./ZoneEditorMap'))

const Section = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`

const Title = styled.h2`
  font-size: ${({ theme }) => theme.typography.fontSizeLg};
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  margin: 0;
`

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`

const Row = styled.li`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
`

const ZoneName = styled.span`
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

const Meta = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: center;
`

const ModeButton = styled.button<{ $active: boolean }>`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.surface)};
  color: ${({ theme, $active }) => ($active ? '#ffffff' : theme.colors.text)};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  cursor: pointer;
`

const NameInput = styled.input`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
  flex: 1;
  min-width: 160px;
`

const DeleteButton = styled.button`
  min-height: ${({ theme }) => theme.touchTargets.min};
  min-width: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  cursor: pointer;
`

const Hint = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const Status = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

/**
 * Dispatcher Settings → Trasy a zóny → Zóny tab. Lists the fleet's zones and a Leaflet
 * editor (lazy) to draw a Circle (click center, click the edge) or a Polygon (click points,
 * double-click to close), name it, and save it enabled. All existing zones render labelled on
 * one map. CRUD goes through the A4 /api/v1/zones client (useZones). The pure geometry-to-
 * request mapping lives in zoneDraw.ts (tested); this component only renders + wires state.
 */
export function ZonesTab() {
  const { t } = useTranslation()
  const zonesQuery = useZones()
  const createZone = useCreateZone()
  const deleteZone = useDeleteZone()

  const [mode, setMode] = useState<DrawMode>('circle')
  const [name, setName] = useState('')
  const [statusKey, setStatusKey] = useState<string | null>(null)

  const zones: ZoneDto[] = zonesQuery.data ?? []

  function requireName(): boolean {
    if (name.trim() === '') {
      setStatusKey('settings.zones.nameRequired')
      return false
    }
    return true
  }

  function handleCircleDrawn(draft: CircleDraft) {
    if (!requireName()) return
    setStatusKey(null)
    // The map already computed the radius (haversine) from center→edge; reuse it so the
    // saved circle matches exactly what was drawn.
    const req = {
      ...circleToRequest(name.trim(), draft.center, draft.center, true),
      radiusMeters: draft.radiusMeters,
    }
    createZone.mutate(req, {
      onSuccess: () => { setName(''); setStatusKey('settings.zones.saved') },
      onError: () => setStatusKey('settings.zones.saveFailed'),
    })
  }

  function handlePolygonDrawn(points: DrawPoint[]) {
    if (!requireName()) return
    setStatusKey(null)
    try {
      const req = polygonToRequest(name.trim(), points, true)
      createZone.mutate(req, {
        onSuccess: () => { setName(''); setStatusKey('settings.zones.saved') },
        onError: () => setStatusKey('settings.zones.saveFailed'),
      })
    } catch {
      setStatusKey('settings.zones.polygonTooFewPoints')
    }
  }

  return (
    <Section>
      <Title>{t('settings.zones.title')}</Title>

      {zonesQuery.isLoading && <Status>{t('settings.zones.loading')}</Status>}

      <List aria-label={t('settings.zones.listLabel')}>
        {zones.map((z) => (
          <Row key={z.id}>
            <span>
              <ZoneName>{z.name}</ZoneName>{' '}
              <Meta>
                {z.shape === 'Circle'
                  ? t('settings.zones.circleMeta', { radius: z.radiusMeters ?? 0 })
                  : t('settings.zones.polygonMeta', { count: z.polygon?.length ?? 0 })}
                {z.isEnabled ? '' : ` · ${t('settings.zones.disabled')}`}
              </Meta>
            </span>
            <DeleteButton
              type="button"
              onClick={() => deleteZone.mutate(z.id)}
              aria-label={t('settings.zones.deleteAria', { name: z.name })}
            >
              {t('settings.zones.delete')}
            </DeleteButton>
          </Row>
        ))}
        {!zonesQuery.isLoading && zones.length === 0 && <Status>{t('settings.zones.empty')}</Status>}
      </List>

      <Toolbar>
        <NameInput
          aria-label={t('settings.zones.nameLabel')}
          placeholder={t('settings.zones.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <ModeButton
          type="button"
          aria-pressed={mode === 'circle'}
          $active={mode === 'circle'}
          onClick={() => setMode('circle')}
        >
          {t('settings.zones.modeCircle')}
        </ModeButton>
        <ModeButton
          type="button"
          aria-pressed={mode === 'polygon'}
          $active={mode === 'polygon'}
          onClick={() => setMode('polygon')}
        >
          {t('settings.zones.modePolygon')}
        </ModeButton>
      </Toolbar>

      <Hint>{mode === 'circle' ? t('settings.zones.circleHint') : t('settings.zones.polygonHint')}</Hint>
      {statusKey && <Status role="status">{t(statusKey)}</Status>}

      <Suspense fallback={<Status>{t('settings.zones.loadingMap')}</Status>}>
        <ZoneEditorMap
          zones={zones}
          mode={mode}
          onCircleDrawn={handleCircleDrawn}
          onPolygonDrawn={handlePolygonDrawn}
        />
      </Suspense>
    </Section>
  )
}
