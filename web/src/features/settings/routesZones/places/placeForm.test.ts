import { describe, it, expect } from 'vitest'
import {
  emptyPlaceForm,
  placeFormFromDto,
  placeFormToRequest,
  validatePlaceForm,
  type PlaceFormState,
} from './placeForm'
import type { PlaceDto } from '../../../../shared/api/client'

function validForm(partial: Partial<PlaceFormState> = {}): PlaceFormState {
  return {
    ...emptyPlaceForm(),
    name: 'Nádraží KH',
    address: 'Nádražní 1, Kutná Hora',
    lat: 49.95,
    lng: 15.27,
    sortOrder: 0,
    ...partial,
  }
}

describe('validatePlaceForm', () => {
  it('accepts a valid place', () => {
    expect(validatePlaceForm(validForm())).toEqual([])
  })

  it('requires a name', () => {
    expect(validatePlaceForm(validForm({ name: '  ' }))).toContain('settings.places.validation.nameRequired')
  })

  it('requires an address', () => {
    expect(validatePlaceForm(validForm({ address: '' }))).toContain('settings.places.validation.addressRequired')
  })

  it('requires resolved coordinates (a dropped pin)', () => {
    expect(validatePlaceForm(validForm({ lat: null, lng: null }))).toContain('settings.places.validation.coordsRequired')
  })

  it('rejects a negative sort order', () => {
    expect(validatePlaceForm(validForm({ sortOrder: -1 }))).toContain('settings.places.validation.sortOrderInvalid')
  })
})

describe('placeFormToRequest', () => {
  it('maps a valid form to a request', () => {
    const req = placeFormToRequest(validForm({ sortOrder: 3, isEnabled: false }))
    expect(req).toEqual({
      name: 'Nádraží KH',
      address: 'Nádražní 1, Kutná Hora',
      lat: 49.95,
      lng: 15.27,
      sortOrder: 3,
      isEnabled: false,
    })
  })

  it('coerces null coords to 0 (validation should have blocked this, defensive)', () => {
    const req = placeFormToRequest(validForm({ lat: null, lng: null }))
    expect(req.lat).toBe(0)
    expect(req.lng).toBe(0)
  })
})

describe('placeFormFromDto', () => {
  it('round-trips a DTO into an editable form', () => {
    const dto: PlaceDto = {
      id: 'p1', name: 'Nemocnice', lat: 49.96, lng: 15.28, address: 'Kutnohorská 5', sortOrder: 2, isEnabled: true,
    }
    expect(placeFormFromDto(dto)).toEqual({
      name: 'Nemocnice',
      address: 'Kutnohorská 5',
      lat: 49.96,
      lng: 15.28,
      sortOrder: 2,
      isEnabled: true,
    })
  })
})
