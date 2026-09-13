import { describe, expect, it } from 'vitest'
import { createOneTimePasswordState } from './resetPassword'

/**
 * The one-time password display state machine.
 * States: idle → revealed → cleared (terminal)
 * Transitions:
 *   idle --reveal(password)--> revealed
 *   revealed --dismiss()--> cleared
 *   cleared --reveal(password)--> revealed (new reset, new password)
 */

describe('createOneTimePasswordState', () => {
  it('starts in idle state with no password', () => {
    const state = createOneTimePasswordState()
    expect(state.password).toBeNull()
    expect(state.isRevealed).toBe(false)
  })

  it('transitions to revealed when reveal() is called with a password', () => {
    const state = createOneTimePasswordState()
    const next = state.reveal('TempPass123')
    expect(next.password).toBe('TempPass123')
    expect(next.isRevealed).toBe(true)
  })

  it('transitions to cleared when dismiss() is called on revealed state', () => {
    const state = createOneTimePasswordState()
    const revealed = state.reveal('TempPass123')
    const cleared = revealed.dismiss()
    expect(cleared.password).toBeNull()
    expect(cleared.isRevealed).toBe(false)
  })

  it('cannot dismiss an idle state (returns same idle state)', () => {
    const state = createOneTimePasswordState()
    const same = state.dismiss()
    expect(same.isRevealed).toBe(false)
    expect(same.password).toBeNull()
  })

  it('can be revealed again after clearing (new reset cycle)', () => {
    const state = createOneTimePasswordState()
    const revealed1 = state.reveal('OldPass123')
    const cleared = revealed1.dismiss()
    const revealed2 = cleared.reveal('NewPass456')
    expect(revealed2.password).toBe('NewPass456')
    expect(revealed2.isRevealed).toBe(true)
  })

  it('a second reveal while already revealed replaces the password', () => {
    const state = createOneTimePasswordState()
    const revealed1 = state.reveal('Pass1')
    const revealed2 = revealed1.reveal('Pass2')
    expect(revealed2.password).toBe('Pass2')
    expect(revealed2.isRevealed).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Role gating
// ---------------------------------------------------------------------------

import { canAccessSettings } from './roleGating'

describe('canAccessSettings', () => {
  it('returns true for FleetAdmin role', () => {
    expect(canAccessSettings('FleetAdmin')).toBe(true)
  })

  it('returns false for Dispatcher role', () => {
    expect(canAccessSettings('Dispatcher')).toBe(false)
  })

  it('returns false for Driver role', () => {
    expect(canAccessSettings('Driver')).toBe(false)
  })

  it('returns false for null/empty role', () => {
    expect(canAccessSettings(null)).toBe(false)
    expect(canAccessSettings('')).toBe(false)
    expect(canAccessSettings(undefined)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Fleet settings read mapping
// ---------------------------------------------------------------------------

import { mapFleetSettings, type FleetSettingsViewModel } from './fleetSettingsMapper'
import type { FleetSettingsDto } from '../../shared/api/client'

describe('mapFleetSettings', () => {
  const dto: FleetSettingsDto = {
    name: 'Kolín Taxi',
    phone: '+420777000000',
    offerTimeoutSeconds: 30,
    autoDispatchEnabled: false,
  }

  it('maps all fields from the DTO', () => {
    const vm: FleetSettingsViewModel = mapFleetSettings(dto)
    expect(vm.name).toBe('Kolín Taxi')
    expect(vm.phone).toBe('+420777000000')
    expect(vm.offerTimeoutSeconds).toBe(30)
    expect(vm.autoDispatchEnabled).toBe(false)
  })

  it('exposes autoDispatchEnabled as read-only (toggle always disabled)', () => {
    const vm = mapFleetSettings({ ...dto, autoDispatchEnabled: true })
    expect(vm.autoDispatchEnabled).toBe(true)
    // The UI renders this disabled — the mapper just passes it through
  })

  it('passes through the A7b additive fields (color/welcome/smsCap)', () => {
    const vm = mapFleetSettings({
      ...dto,
      primaryColorHex: '#E91E63',
      welcomeText: 'Vítejte',
      smsMonthlyCapCzk: 750,
    })
    expect(vm.primaryColorHex).toBe('#E91E63')
    expect(vm.welcomeText).toBe('Vítejte')
    expect(vm.smsMonthlyCapCzk).toBe(750)
  })
})
