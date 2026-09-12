import { describe, it, expect } from 'vitest'
import { deriveTransitionButtons } from './transitionButtons'

describe('transitionButtons — allowedActions → button set', () => {
  it('returns empty array when allowedActions is empty', () => {
    const buttons = deriveTransitionButtons([])
    expect(buttons).toHaveLength(0)
  })

  it('maps assign action to a button', () => {
    const buttons = deriveTransitionButtons(['assign'])
    expect(buttons).toHaveLength(1)
    expect(buttons[0].action).toBe('assign')
    expect(buttons[0].label).toBeTruthy()
  })

  it('maps reassign action to a button', () => {
    const buttons = deriveTransitionButtons(['reassign'])
    expect(buttons[0].action).toBe('reassign')
  })

  it('maps cancel action to a button', () => {
    const buttons = deriveTransitionButtons(['cancel'])
    expect(buttons[0].action).toBe('cancel')
  })

  it('maps accept action to a button', () => {
    const buttons = deriveTransitionButtons(['accept'])
    expect(buttons[0].action).toBe('accept')
  })

  it('maps arrive action to a button', () => {
    const buttons = deriveTransitionButtons(['arrive'])
    expect(buttons[0].action).toBe('arrive')
  })

  it('maps start action to a button', () => {
    const buttons = deriveTransitionButtons(['start'])
    expect(buttons[0].action).toBe('start')
  })

  it('maps complete action to a button', () => {
    const buttons = deriveTransitionButtons(['complete'])
    expect(buttons[0].action).toBe('complete')
  })

  it('maps decline action to a button', () => {
    const buttons = deriveTransitionButtons(['decline'])
    expect(buttons[0].action).toBe('decline')
  })

  it('maps multiple actions to multiple buttons', () => {
    const buttons = deriveTransitionButtons(['assign', 'cancel'])
    expect(buttons).toHaveLength(2)
    const actions = buttons.map(b => b.action)
    expect(actions).toContain('assign')
    expect(actions).toContain('cancel')
  })

  it('ignores unknown actions gracefully', () => {
    const buttons = deriveTransitionButtons(['unknown-action-xyz'])
    // Unknown actions are still included (the drawer renders them with a fallback label)
    expect(buttons).toHaveLength(1)
    expect(buttons[0].action).toBe('unknown-action-xyz')
  })

  it('assign action has needsDriverPicker=true', () => {
    const buttons = deriveTransitionButtons(['assign'])
    expect(buttons[0].needsDriverPicker).toBe(true)
  })

  it('reassign action has needsDriverPicker=true', () => {
    const buttons = deriveTransitionButtons(['reassign'])
    expect(buttons[0].needsDriverPicker).toBe(true)
  })

  it('cancel action has needsReason=true', () => {
    const buttons = deriveTransitionButtons(['cancel'])
    expect(buttons[0].needsReason).toBe(true)
  })

  it('non-picker non-reason actions have false for both flags', () => {
    const buttons = deriveTransitionButtons(['complete'])
    expect(buttons[0].needsDriverPicker).toBe(false)
    expect(buttons[0].needsReason).toBe(false)
  })
})
