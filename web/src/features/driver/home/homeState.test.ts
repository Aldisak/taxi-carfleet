import { describe, it, expect } from 'vitest'
import {
  deriveHomeState,
  type DriverStatus,
  type HomeState,
} from './homeState'

describe('deriveHomeState', () => {
  describe('Offline status', () => {
    it('returns goOnline action label', () => {
      const state = deriveHomeState({ status: 'Offline', hasVehicle: false, hasLocation: false })
      expect(state.buttonLabel).toBe('driver.home.status.startShift')
    })

    it('returns primary variant', () => {
      const state = deriveHomeState({ status: 'Offline', hasVehicle: false, hasLocation: false })
      expect(state.buttonVariant).toBe('primary')
    })

    it('is disabled without vehicle', () => {
      const state = deriveHomeState({ status: 'Offline', hasVehicle: false, hasLocation: true })
      expect(state.buttonDisabled).toBe(true)
    })

    it('is disabled without location permission', () => {
      const state = deriveHomeState({ status: 'Offline', hasVehicle: true, hasLocation: false })
      expect(state.buttonDisabled).toBe(true)
    })

    it('is enabled with vehicle and location', () => {
      const state = deriveHomeState({ status: 'Offline', hasVehicle: true, hasLocation: true })
      expect(state.buttonDisabled).toBe(false)
    })

    it('action is goOnline', () => {
      const state = deriveHomeState({ status: 'Offline', hasVehicle: true, hasLocation: true })
      expect(state.action).toBe('goOnline')
    })

    it('shows vehicle selector', () => {
      const state = deriveHomeState({ status: 'Offline', hasVehicle: false, hasLocation: false })
      expect(state.showVehicleSelector).toBe(true)
    })

    it('disabledReason is noVehicle when missing vehicle', () => {
      const state = deriveHomeState({ status: 'Offline', hasVehicle: false, hasLocation: true })
      expect(state.disabledReason).toBe('noVehicle')
    })

    it('disabledReason is noLocation when missing location only', () => {
      const state = deriveHomeState({ status: 'Offline', hasVehicle: true, hasLocation: false })
      expect(state.disabledReason).toBe('noLocation')
    })

    it('disabledReason is null when all conditions met', () => {
      const state = deriveHomeState({ status: 'Offline', hasVehicle: true, hasLocation: true })
      expect(state.disabledReason).toBeNull()
    })
  })

  describe('Free status', () => {
    it('returns goOffline action label', () => {
      const state = deriveHomeState({ status: 'Free', hasVehicle: true, hasLocation: true })
      expect(state.buttonLabel).toBe('driver.home.status.endShift')
    })

    it('returns secondary variant', () => {
      const state = deriveHomeState({ status: 'Free', hasVehicle: true, hasLocation: true })
      expect(state.buttonVariant).toBe('secondary')
    })

    it('is not disabled', () => {
      const state = deriveHomeState({ status: 'Free', hasVehicle: true, hasLocation: true })
      expect(state.buttonDisabled).toBe(false)
    })

    it('action is goOffline', () => {
      const state = deriveHomeState({ status: 'Free', hasVehicle: true, hasLocation: true })
      expect(state.action).toBe('goOffline')
    })

    it('does not show vehicle selector', () => {
      const state = deriveHomeState({ status: 'Free', hasVehicle: true, hasLocation: true })
      expect(state.showVehicleSelector).toBe(false)
    })

    it('shows waiting label', () => {
      const state = deriveHomeState({ status: 'Free', hasVehicle: true, hasLocation: true })
      expect(state.statusLabel).toBe('driver.home.status.waitingForOrder')
    })
  })

  describe('Busy status', () => {
    it('shows ride in progress action', () => {
      const state = deriveHomeState({ status: 'Busy', hasVehicle: true, hasLocation: true })
      expect(state.action).toBe('viewRide')
    })

    it('does not show vehicle selector', () => {
      const state = deriveHomeState({ status: 'Busy', hasVehicle: true, hasLocation: true })
      expect(state.showVehicleSelector).toBe(false)
    })
  })

  describe('EnRoute status', () => {
    it('shows ride in progress action', () => {
      const state = deriveHomeState({ status: 'EnRoute', hasVehicle: true, hasLocation: true })
      expect(state.action).toBe('viewRide')
    })
  })
})

// Ensure types are exported correctly
const _typeCheck: DriverStatus = 'Offline'
const _stateCheck: HomeState = deriveHomeState({ status: 'Offline', hasVehicle: false, hasLocation: false })
void _typeCheck
void _stateCheck
