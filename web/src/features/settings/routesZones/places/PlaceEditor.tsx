import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import { emptyPlaceForm, validatePlaceForm, type PlaceFormState } from './placeForm'
import type { PinPoint } from '../PinPickerMap'

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

/** Props for PlaceEditor. */
export interface PlaceEditorProps {
  /** Initial form (blank for create, DTO-derived for edit). */
  initial?: PlaceFormState
  onSubmit: (form: PlaceFormState) => void
  onCancel: () => void
  isSaving?: boolean
}

/**
 * Add/edit editor for a quick place: name, address, a lazy Leaflet pin that resolves lat/lng,
 * a sort order, and an enable toggle. The pure form mapping + validation lives in placeForm.ts.
 */
export function PlaceEditor({ initial, onSubmit, onCancel, isSaving = false }: PlaceEditorProps) {
  const { t } = useTranslation()
  const [form, setForm] = useState<PlaceFormState>(initial ?? emptyPlaceForm())
  const [errors, setErrors] = useState<string[]>([])

  function update(patch: Partial<PlaceFormState>): void {
    setForm((prev) => ({ ...prev, ...patch }))
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault()
    const found = validatePlaceForm(form)
    setErrors(found)
    if (found.length === 0) onSubmit(form)
  }

  return (
    <Form onSubmit={handleSubmit} aria-label={t('settings.places.editor.title')}>
      <Field>
        {t('settings.places.editor.name')}
        <Input
          value={form.name}
          onChange={(e) => update({ name: e.target.value })}
          aria-label={t('settings.places.editor.name')}
        />
      </Field>

      <Field>
        {t('settings.places.editor.address')}
        <Input
          value={form.address}
          onChange={(e) => update({ address: e.target.value })}
          placeholder={t('settings.places.editor.addressPlaceholder')}
          aria-label={t('settings.places.editor.address')}
        />
      </Field>

      <MapStatus role="status">
        {form.lat != null
          ? t('settings.places.editor.coordsSet', { lat: form.lat.toFixed(5), lng: form.lng!.toFixed(5) })
          : t('settings.places.editor.pickCoords')}
      </MapStatus>
      <Suspense fallback={<MapStatus>{t('settings.places.editor.loadingMap')}</MapStatus>}>
        <PinPickerMap
          value={form.lat != null && form.lng != null ? { lat: form.lat, lng: form.lng } : null}
          onPick={(p: PinPoint) => update({ lat: p.lat, lng: p.lng })}
        />
      </Suspense>

      <Field>
        {t('settings.places.editor.sortOrder')}
        <Input
          type="number"
          min={0}
          value={form.sortOrder}
          onChange={(e) => update({ sortOrder: Number(e.target.value) })}
          aria-label={t('settings.places.editor.sortOrder')}
        />
      </Field>

      <Field>
        <span>
          <input
            type="checkbox"
            checked={form.isEnabled}
            onChange={(e) => update({ isEnabled: e.target.checked })}
          />{' '}
          {t('settings.places.editor.enabled')}
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
          {t('settings.places.editor.save')}
        </PrimaryButton>
        <SecondaryButton type="button" onClick={onCancel}>
          {t('settings.places.editor.cancel')}
        </SecondaryButton>
      </Actions>
    </Form>
  )
}
