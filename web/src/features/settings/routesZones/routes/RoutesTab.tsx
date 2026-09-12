import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import type { RouteAdminDto } from '../../../../shared/api/client'
import { useZones } from '../zones/useZones'
import {
  useCreateRoute,
  useDeleteRoute,
  useRoutes,
  useSetRouteEnabled,
  useSetRoutePriority,
  useUpdateRoute,
} from './useRoutes'
import { buildValiditySummary } from './validitySummary'
import { computePriorityUpdates, moveItem } from './priorityReorder'
import { routeFormFromDto, routeFormToRequest, type RouteFormState } from './routeForm'
import { RouteEditor } from './RouteEditor'
import { OtestovatPanel } from './OtestovatPanel'

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
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
`

const RouteInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`

const RouteName = styled.span`
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
`

const Badge = styled.span`
  display: inline-block;
  padding: 0 ${({ theme }) => theme.spacing.xs};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
`

const Meta = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const IconButton = styled.button`
  min-height: ${({ theme }) => theme.touchTargets.min};
  min-width: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`

const PrimaryButton = styled.button`
  align-self: flex-start;
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.lg};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  cursor: pointer;
`

const Status = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const czk = new Intl.NumberFormat('cs-CZ')

type EditorMode = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; route: RouteAdminDto }

/**
 * Dispatcher Settings → Trasy a zóny → Trasy tab. Lists routes priority-descending with
 * move-up/move-down reordering (persisted via PATCH /routes/{id}/priority through the pure
 * computePriorityUpdates), a type badge, CZK price, a validity summary, and an enable toggle.
 * A type-aware RouteEditor creates/updates routes, and the live OtestovatPanel lets the
 * dispatcher verify a quote before enabling. Pure logic is in validitySummary/priorityReorder/
 * routeForm; this component renders + wires mutations.
 */
export function RoutesTab() {
  const { t } = useTranslation()
  const routesQuery = useRoutes()
  const zonesQuery = useZones()
  const createRoute = useCreateRoute()
  const updateRoute = useUpdateRoute()
  const deleteRoute = useDeleteRoute()
  const setEnabled = useSetRouteEnabled()
  const setPriority = useSetRoutePriority()

  const [editor, setEditor] = useState<EditorMode>({ kind: 'closed' })

  const routes: RouteAdminDto[] = routesQuery.data ?? []

  function persistReorder(ordered: RouteAdminDto[]): void {
    for (const update of computePriorityUpdates(ordered)) {
      setPriority.mutate(update)
    }
  }

  function move(index: number, direction: -1 | 1): void {
    const target = index + direction
    if (target < 0 || target >= routes.length) return
    persistReorder(moveItem(routes, index, target))
  }

  function handleSubmit(form: RouteFormState): void {
    const req = routeFormToRequest(form)
    if (editor.kind === 'edit') {
      updateRoute.mutate({ id: editor.route.id, req }, { onSuccess: () => setEditor({ kind: 'closed' }) })
    } else {
      createRoute.mutate(req, { onSuccess: () => setEditor({ kind: 'closed' }) })
    }
  }

  return (
    <Section>
      <Title>{t('settings.routes.title')}</Title>

      {routesQuery.isLoading && <Status>{t('settings.routes.loading')}</Status>}

      <List aria-label={t('settings.routes.listLabel')}>
        {routes.map((r, index) => (
          <Row key={r.id}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <IconButton
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={t('settings.routes.moveUp', { name: r.name })}
              >
                ↑
              </IconButton>
              <IconButton
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === routes.length - 1}
                aria-label={t('settings.routes.moveDown', { name: r.name })}
              >
                ↓
              </IconButton>
            </div>
            <RouteInfo>
              <span>
                <RouteName>{r.name}</RouteName> <Badge>{t(`settings.routes.types.${r.type}`)}</Badge>
              </span>
              <Meta>
                {t('settings.routes.priceMeta', { price: czk.format(r.priceCzk) })} ·{' '}
                {buildValiditySummary({ validDays: r.validDays, validFromTime: r.validFromTime, validToTime: r.validToTime })}
                {r.isEnabled ? '' : ` · ${t('settings.routes.disabled')}`}
              </Meta>
            </RouteInfo>
            <label>
              <input
                type="checkbox"
                checked={r.isEnabled}
                onChange={(e) => setEnabled.mutate({ id: r.id, isEnabled: e.target.checked })}
                aria-label={t('settings.routes.enableAria', { name: r.name })}
              />
            </label>
            <IconButton
              type="button"
              onClick={() => setEditor({ kind: 'edit', route: r })}
              aria-label={t('settings.routes.editAria', { name: r.name })}
            >
              {t('settings.routes.edit')}
            </IconButton>
            <IconButton
              type="button"
              onClick={() => deleteRoute.mutate(r.id)}
              aria-label={t('settings.routes.deleteAria', { name: r.name })}
            >
              {t('settings.routes.delete')}
            </IconButton>
          </Row>
        ))}
        {!routesQuery.isLoading && routes.length === 0 && <Status>{t('settings.routes.empty')}</Status>}
      </List>

      {editor.kind === 'closed' ? (
        <PrimaryButton type="button" onClick={() => setEditor({ kind: 'create' })}>
          {t('settings.routes.add')}
        </PrimaryButton>
      ) : (
        <RouteEditor
          initial={editor.kind === 'edit' ? routeFormFromDto(editor.route) : undefined}
          zones={zonesQuery.data ?? []}
          onSubmit={handleSubmit}
          onCancel={() => setEditor({ kind: 'closed' })}
          isSaving={createRoute.isPending || updateRoute.isPending}
        />
      )}

      <OtestovatPanel />
    </Section>
  )
}
