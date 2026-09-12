import { describe, it, expect } from 'vitest'
import { deriveRideButtons, type RideButtonState } from './rideButtonState'

describe('deriveRideButtons', () => {
  it('Accepted status returns navigate and arrive buttons', () => {
    const result = deriveRideButtons('Accepted', false, null)
    expect(result.primaryAction).toBe('arrive')
    expect(result.primaryLabel).toBe('driver.ride.arrive')
    expect(result.navAction).toBe('navigate')
    expect(result.navLabel).toBe('driver.ride.navigate')
    expect(result.secondaryAction).toBeNull()
  })

  it('Arrived status returns start button and no-show secondary', () => {
    const result = deriveRideButtons('Arrived', false, null)
    expect(result.primaryAction).toBe('start')
    expect(result.primaryLabel).toBe('driver.ride.start')
    expect(result.secondaryAction).toBe('noShow')
    expect(result.secondaryLabel).toBe('driver.ride.noShow')
    expect(result.navAction).toBeNull()
  })

  it('Arrived with noShowEnabled=false disables no-show button', () => {
    const result = deriveRideButtons('Arrived', false, null)
    expect(result.noShowEnabled).toBe(false)
  })

  it('Arrived with noShowEnabled=true enables no-show button', () => {
    const result = deriveRideButtons('Arrived', true, null)
    expect(result.noShowEnabled).toBe(true)
  })

  it('InProgress status returns complete button and navigate to dropoff', () => {
    const result = deriveRideButtons('InProgress', false, null)
    expect(result.primaryAction).toBe('complete')
    expect(result.primaryLabel).toBe('driver.ride.complete')
    expect(result.secondaryAction).toBeNull()
    expect(result.navAction).toBe('navigate')
    expect(result.navLabel).toBe('driver.ride.navigateToDropoff')
  })

  it('InProgress without dropoff has no nav button', () => {
    const result = deriveRideButtons('InProgress', false, null, false)
    expect(result.navAction).toBeNull()
  })

  it('InProgress with dropoff shows nav button', () => {
    const result = deriveRideButtons('InProgress', false, null, true)
    expect(result.navAction).toBe('navigate')
  })

  it('unknown status returns null actions', () => {
    const result = deriveRideButtons('Completed', false, null)
    expect(result.primaryAction).toBeNull()
    expect(result.navAction).toBeNull()
    expect(result.secondaryAction).toBeNull()
  })

  it('Arrived passes noShowCountdown to result', () => {
    const result = deriveRideButtons('Arrived', false, 42)
    expect(result.noShowCountdownSeconds).toBe(42)
  })
})

// Type check
const _typeCheck: RideButtonState = deriveRideButtons('Accepted', false, null)
void _typeCheck
