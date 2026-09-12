import type { CreatePlaceRequest, PlaceDto } from '../../../../shared/api/client'

/** Editable form state for a quick place. Coords are null until a pin is dropped. */
export interface PlaceFormState {
  name: string
  address: string
  lat: number | null
  lng: number | null
  sortOrder: number
  isEnabled: boolean
}

/** A blank place form (enabled, sort order 0). */
export function emptyPlaceForm(): PlaceFormState {
  return {
    name: '',
    address: '',
    lat: null,
    lng: null,
    sortOrder: 0,
    isEnabled: true,
  }
}

/**
 * Validates a place form, returning a list of i18n error-code keys (empty = OK). The backend
 * validator is authoritative (Name required, coords present, SortOrder >= 0); this mirrors it
 * for a clean client-side 400-free UX.
 */
export function validatePlaceForm(form: PlaceFormState): string[] {
  const errors: string[] = []
  if (form.name.trim() === '') errors.push('settings.places.validation.nameRequired')
  if (form.address.trim() === '') errors.push('settings.places.validation.addressRequired')
  if (form.lat == null || form.lng == null) errors.push('settings.places.validation.coordsRequired')
  if (!(form.sortOrder >= 0)) errors.push('settings.places.validation.sortOrderInvalid')
  return errors
}

/** Maps a validated form to a Create/Update request (null coords coerced to 0 defensively). */
export function placeFormToRequest(form: PlaceFormState): CreatePlaceRequest {
  return {
    name: form.name.trim(),
    address: form.address.trim(),
    lat: form.lat ?? 0,
    lng: form.lng ?? 0,
    sortOrder: form.sortOrder,
    isEnabled: form.isEnabled,
  }
}

/** Builds an editable form from an existing place DTO. */
export function placeFormFromDto(dto: PlaceDto): PlaceFormState {
  return {
    name: dto.name,
    address: dto.address,
    lat: dto.lat,
    lng: dto.lng,
    sortOrder: dto.sortOrder,
    isEnabled: dto.isEnabled,
  }
}
