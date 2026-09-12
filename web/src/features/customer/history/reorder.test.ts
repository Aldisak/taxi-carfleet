import { describe, it, expect } from 'vitest'
import { buildReorderDraft } from './reorder'

describe('buildReorderDraft', () => {
  it('copies pickup and dropoff addresses into the draft', () => {
    expect(buildReorderDraft({ pickupAddress: 'Hlavní 1, Praha', dropoffAddress: 'Náměstí 5' })).toEqual({
      pickupAddress: 'Hlavní 1, Praha',
      dropoffAddress: 'Náměstí 5',
    })
  })

  it('keeps a null dropoff (one-way / open destination)', () => {
    expect(buildReorderDraft({ pickupAddress: 'Hlavní 1', dropoffAddress: null })).toEqual({
      pickupAddress: 'Hlavní 1',
      dropoffAddress: null,
    })
  })
})
