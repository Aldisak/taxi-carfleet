import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import type { RouteType, ZoneDto } from '../../../../shared/api/client'
import {
  emptyRouteForm,
  isDaySelected,
  routeFormToRequest,
  toggleDay,
  validateRouteForm,
  type RouteFormState,
} from './routeForm'
import type { PinPoint } from '../PinPickerMap'

// Leaflet point picker loads only inside this chunk (rules/web-performance.md#code-splitting).
const PinPickerMap = lazy(() => import('../PinPickerMap'))

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
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

const Select = styled.select`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  font-size: ${({ theme }) => theme.typography.fontSizeMd};
`

const DayChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.xs};
`

const DayChip = styled.button<{ $active: boolean }>`
  min-height: ${({ theme }) => theme.touchTargets.min};
  min-width: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.surface)};
  color: ${({ theme, $active }) => ($active ? '#ffffff' : theme.colors.text)};
  cursor: pointer;
`

const TimeRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
`

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`

const PrimaryButton = styled.button`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.lg};
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.primary};
  color: #ffffff;
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  cursor: pointer;
`

const SecondaryButton = styled.button`
  min-height: ${({ theme }) => theme.touchTargets.min};
  padding: 0 ${({ theme }) => theme.spacing.lg};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;
`

const Errors = styled.ul`
  margin: 0;
  padding-left: ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.error};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
`

const MapStatus = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

/** Props for RouteEditor. */
export interface RouteEditorProps {
  /** Initial form state (a blank form for create, or a DTO-derived form for edit). */
  initial?: RouteFormState
  /** The fleet's zones (for the Zone / ZoneToZone dropdowns). */
  zones: ZoneDto[]
  /** Called with the mapped request when the form is valid and submitted. */
  onSubmit: (form: RouteFormState) => void
  /** Cancel editing. */
  onCancel: () => void
  /** Whether a save is in flight. */
  isSaving?: boolean
}

/**
 * The type-aware route editor. The RouteType selector swaps the body: PointToPoint shows two
 * coordinate pickers (a lazy Leaflet pin map + address label) + match radii; Zone shows a
 * single from-zone dropdown; ZoneToZone shows from + to dropdowns + a bidirectional toggle.
 * Every type shares the CZK price, the weekday chips (1=Mon…64=Sun bitmask) and the two time
 * inputs. All mapping + per-type validation lives in the pure routeForm.ts.
 */
export function RouteEditor({ initial, zones, onSubmit, onCancel, isSaving = false }: RouteEditorProps) {
  const { t } = useTranslation()
  const [form, setForm] = useState<RouteFormState>(initial ?? emptyRouteForm())
  const [errors, setErrors] = useState<string[]>([])

  function update(patch: Partial<RouteFormState>): void {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault()
    const found = validateRouteForm(form)
    setErrors(found)
    if (found.length === 0) onSubmit(form)
  }

  const enabledZones = zones.filter((z) => z.isEnabled || z.id === form.fromZoneId || z.id === form.toZoneId)

  return (
    <Form onSubmit={handleSubmit} aria-label={t('settings.routes.editor.title')}>
      <Field>
        {t('settings.routes.editor.name')}
        <Input
          value={form.name}
          onChange={(e) => update({ name: e.target.value })}
          aria-label={t('settings.routes.editor.name')}
        />
      </Field>

      <Field>
        {t('settings.routes.editor.type')}
        <Select
          value={form.type}
          onChange={(e) => update({ type: e.target.value as RouteType })}
          aria-label={t('settings.routes.editor.type')}
        >
          <option value="PointToPoint">{t('settings.routes.types.PointToPoint')}</option>
          <option value="Zone">{t('settings.routes.types.Zone')}</option>
          <option value="ZoneToZone">{t('settings.routes.types.ZoneToZone')}</option>
        </Select>
      </Field>

      <Field>
        {t('settings.routes.editor.price')}
        <Input
          type="number"
          min={0}
          value={form.priceCzk}
          onChange={(e) => update({ priceCzk: Number(e.target.value) })}
          aria-label={t('settings.routes.editor.price')}
        />
      </Field>

      {form.type === 'PointToPoint' && (
        <>
          <MapStatus role="status">
            {form.fromLat != null
              ? t('settings.routes.editor.pickupSet', { lat: form.fromLat.toFixed(5), lng: form.fromLng!.toFixed(5) })
              : t('settings.routes.editor.pickupPick')}
          </MapStatus>
          <Suspense fallback={<MapStatus>{t('settings.routes.editor.loadingMap')}</MapStatus>}>
            <PinPickerMap
              value={form.fromLat != null && form.fromLng != null ? { lat: form.fromLat, lng: form.fromLng } : null}
              onPick={(p: PinPoint) => update({ fromLat: p.lat, fromLng: p.lng })}
            />
          </Suspense>

          <MapStatus role="status">
            {form.toLat != null
              ? t('settings.routes.editor.dropoffSet', { lat: form.toLat.toFixed(5), lng: form.toLng!.toFixed(5) })
              : t('settings.routes.editor.dropoffPick')}
          </MapStatus>
          <Suspense fallback={<MapStatus>{t('settings.routes.editor.loadingMap')}</MapStatus>}>
            <PinPickerMap
              value={form.toLat != null && form.toLng != null ? { lat: form.toLat, lng: form.toLng } : null}
              onPick={(p: PinPoint) => update({ toLat: p.lat, toLng: p.lng })}
            />
          </Suspense>

          <TimeRow>
            <Field>
              {t('settings.routes.editor.fromRadius')}
              <Input
                type="number"
                min={1}
                value={form.fromRadiusMeters}
                onChange={(e) => update({ fromRadiusMeters: Number(e.target.value) })}
                aria-label={t('settings.routes.editor.fromRadius')}
              />
            </Field>
            <Field>
              {t('settings.routes.editor.toRadius')}
              <Input
                type="number"
                min={1}
                value={form.toRadiusMeters}
                onChange={(e) => update({ toRadiusMeters: Number(e.target.value) })}
                aria-label={t('settings.routes.editor.toRadius')}
              />
            </Field>
          </TimeRow>
        </>
      )}

      {(form.type === 'Zone' || form.type === 'ZoneToZone') && (
        <Field>
          {t('settings.routes.editor.fromZone')}
          <Select
            value={form.fromZoneId ?? ''}
            onChange={(e) => update({ fromZoneId: e.target.value || null })}
            aria-label={t('settings.routes.editor.fromZone')}
          >
            <option value="">{t('settings.routes.editor.selectZone')}</option>
            {enabledZones.map((z) => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </Select>
        </Field>
      )}

      {form.type === 'ZoneToZone' && (
        <>
          <Field>
            {t('settings.routes.editor.toZone')}
            <Select
              value={form.toZoneId ?? ''}
              onChange={(e) => update({ toZoneId: e.target.value || null })}
              aria-label={t('settings.routes.editor.toZone')}
            >
              <option value="">{t('settings.routes.editor.selectZone')}</option>
              {enabledZones.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </Select>
          </Field>
          <Field>
            <span>
              <input
                type="checkbox"
                checked={form.isBidirectional}
                onChange={(e) => update({ isBidirectional: e.target.checked })}
              />{' '}
              {t('settings.routes.editor.bidirectional')}
            </span>
          </Field>
        </>
      )}

      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend>{t('settings.routes.editor.days')}</legend>
        <DayChips>
          {DAY_KEYS.map((key, index) => (
            <DayChip
              key={key}
              type="button"
              $active={isDaySelected(form.validDays, index)}
              aria-pressed={isDaySelected(form.validDays, index)}
              aria-label={t(`settings.routes.days.${key}`)}
              onClick={() => update({ validDays: toggleDay(form.validDays, index) })}
            >
              {t(`settings.routes.daysShort.${key}`)}
            </DayChip>
          ))}
        </DayChips>
      </fieldset>

      <TimeRow>
        <Field>
          {t('settings.routes.editor.validFrom')}
          <Input
            type="time"
            value={form.validFromTime ?? ''}
            onChange={(e) => update({ validFromTime: e.target.value || null })}
            aria-label={t('settings.routes.editor.validFrom')}
          />
        </Field>
        <Field>
          {t('settings.routes.editor.validTo')}
          <Input
            type="time"
            value={form.validToTime ?? ''}
            onChange={(e) => update({ validToTime: e.target.value || null })}
            aria-label={t('settings.routes.editor.validTo')}
          />
        </Field>
      </TimeRow>

      <Field>
        <span>
          <input
            type="checkbox"
            checked={form.isEnabled}
            onChange={(e) => update({ isEnabled: e.target.checked })}
          />{' '}
          {t('settings.routes.editor.enabled')}
        </span>
      </Field>

      {errors.length > 0 && (
        <Errors role="alert">
          {errors.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </Errors>
      )}

      <Actions>
        <PrimaryButton type="submit" disabled={isSaving}>
          {t('settings.routes.editor.save')}
        </PrimaryButton>
        <SecondaryButton type="button" onClick={onCancel}>
          {t('settings.routes.editor.cancel')}
        </SecondaryButton>
      </Actions>
    </Form>
  )
}

// Re-export so callers map the form → request without re-importing routeForm directly.
export { routeFormToRequest }
