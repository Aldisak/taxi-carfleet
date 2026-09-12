import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import styled from 'styled-components'
import type { PlaceDto } from '../../../../shared/api/client'
import { useCreatePlace, useDeletePlace, usePlaces, useUpdatePlace } from './usePlaces'
import { placeFormFromDto, placeFormToRequest, type PlaceFormState } from './placeForm'
import { PlaceEditor } from './PlaceEditor'

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

const PlaceInfo = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`

const PlaceName = styled.span`
  font-weight: ${({ theme }) => theme.typography.fontWeightBold};
  color: ${({ theme }) => theme.colors.text};
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

type EditorMode = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; place: PlaceDto }

/**
 * Dispatcher Settings → Trasy a zóny → Místa tab. Lists quick places ordered by sortOrder and
 * offers add/edit/delete via the PlaceEditor (name, address, a lazy Leaflet pin for lat/lng,
 * sort order, enable). Pure form logic lives in placeForm.ts; CRUD goes through usePlaces.
 */
export function PlacesTab() {
  const { t } = useTranslation()
  const placesQuery = usePlaces()
  const createPlace = useCreatePlace()
  const updatePlace = useUpdatePlace()
  const deletePlace = useDeletePlace()

  const [editor, setEditor] = useState<EditorMode>({ kind: 'closed' })

  const places: PlaceDto[] = placesQuery.data ?? []

  function handleSubmit(form: PlaceFormState): void {
    const req = placeFormToRequest(form)
    if (editor.kind === 'edit') {
      updatePlace.mutate({ id: editor.place.id, req }, { onSuccess: () => setEditor({ kind: 'closed' }) })
    } else {
      createPlace.mutate(req, { onSuccess: () => setEditor({ kind: 'closed' }) })
    }
  }

  return (
    <Section>
      <Title>{t('settings.places.title')}</Title>

      {placesQuery.isLoading && <Status>{t('settings.places.loading')}</Status>}

      <List aria-label={t('settings.places.listLabel')}>
        {places.map((p) => (
          <Row key={p.id}>
            <PlaceInfo>
              <PlaceName>{p.name}</PlaceName>
              <Meta>
                {p.address}
                {p.isEnabled ? '' : ` · ${t('settings.places.disabled')}`}
              </Meta>
            </PlaceInfo>
            <IconButton
              type="button"
              onClick={() => setEditor({ kind: 'edit', place: p })}
              aria-label={t('settings.places.editAria', { name: p.name })}
            >
              {t('settings.places.edit')}
            </IconButton>
            <IconButton
              type="button"
              onClick={() => deletePlace.mutate(p.id)}
              aria-label={t('settings.places.deleteAria', { name: p.name })}
            >
              {t('settings.places.delete')}
            </IconButton>
          </Row>
        ))}
        {!placesQuery.isLoading && places.length === 0 && <Status>{t('settings.places.empty')}</Status>}
      </List>

      {editor.kind === 'closed' ? (
        <PrimaryButton type="button" onClick={() => setEditor({ kind: 'create' })}>
          {t('settings.places.add')}
        </PrimaryButton>
      ) : (
        <PlaceEditor
          initial={editor.kind === 'edit' ? placeFormFromDto(editor.place) : undefined}
          onSubmit={handleSubmit}
          onCancel={() => setEditor({ kind: 'closed' })}
          isSaving={createPlace.isPending || updatePlace.isPending}
        />
      )}
    </Section>
  )
}
