import { describe, it, expect } from 'vitest'
import {
  initialOrderFlow,
  selectDestination,
  clearDestination,
  setPickup,
  type SelectedPlace,
} from './orderFlowState'

const DEST: SelectedPlace = { label: 'Nádražní 1, Kutná Hora', lat: 49.95, lng: 15.27 }
const PICKUP: SelectedPlace = { label: 'Centrum Kutná Hora', lat: 49.948, lng: 15.268 }

describe('orderFlowState', () => {
  it('starts in the search phase with no destination', () => {
    const state = initialOrderFlow()
    expect(state.phase).toBe('search')
    expect(state.destination).toBeNull()
    expect(state.pickup).toBeNull()
  })

  it('selectDestination flips the phase to destinationSet and stores the place', () => {
    const state = selectDestination(initialOrderFlow(), DEST)
    expect(state.phase).toBe('destinationSet')
    expect(state.destination).toEqual(DEST)
  })

  it('clearDestination returns to the search phase and drops the destination', () => {
    const withDest = selectDestination(initialOrderFlow(), DEST)
    const cleared = clearDestination(withDest)
    expect(cleared.phase).toBe('search')
    expect(cleared.destination).toBeNull()
  })

  it('setPickup preserves the phase and destination but records the pickup', () => {
    const withDest = selectDestination(initialOrderFlow(), DEST)
    const withPickup = setPickup(withDest, PICKUP)
    expect(withPickup.phase).toBe('destinationSet')
    expect(withPickup.destination).toEqual(DEST)
    expect(withPickup.pickup).toEqual(PICKUP)
  })

  it('setPickup works while still in the search phase (GPS pickup before a destination)', () => {
    const withPickup = setPickup(initialOrderFlow(), PICKUP)
    expect(withPickup.phase).toBe('search')
    expect(withPickup.pickup).toEqual(PICKUP)
  })

  it('clearDestination keeps the pickup (only the destination resets)', () => {
    const state = setPickup(selectDestination(initialOrderFlow(), DEST), PICKUP)
    const cleared = clearDestination(state)
    expect(cleared.pickup).toEqual(PICKUP)
    expect(cleared.destination).toBeNull()
  })

  it('is pure — does not mutate the input state', () => {
    const start = initialOrderFlow()
    selectDestination(start, DEST)
    expect(start.destination).toBeNull()
    expect(start.phase).toBe('search')
  })
})
