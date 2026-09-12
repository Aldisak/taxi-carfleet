import { describe, it, expect } from 'vitest'
import {
  deriveCompleteFormState,
  validateCompleteForm,
  type CompleteFormInput,
  type CompleteFormState,
} from './completeForm'

describe('deriveCompleteFormState', () => {
  it('Fixed priceType locks the price and prefills it', () => {
    const state = deriveCompleteFormState('Fixed', 150, null)
    expect(state.priceLocked).toBe(true)
    expect(state.prefillAmount).toBe(150)
    expect(state.showOverrideReveal).toBe(true)
  })

  it('Estimate priceType shows keypad prefilled with estimate', () => {
    const state = deriveCompleteFormState('Estimate', null, 200)
    expect(state.priceLocked).toBe(false)
    expect(state.prefillAmount).toBe(200)
    expect(state.showOverrideReveal).toBe(false)
  })

  it('Meter priceType shows keypad with no prefill', () => {
    const state = deriveCompleteFormState('Meter', null, null)
    expect(state.priceLocked).toBe(false)
    expect(state.prefillAmount).toBeNull()
    expect(state.showOverrideReveal).toBe(false)
  })

  it('Fixed with null price treats as no prefill but still locked', () => {
    const state = deriveCompleteFormState('Fixed', null, null)
    expect(state.priceLocked).toBe(true)
    expect(state.prefillAmount).toBeNull()
  })
})

describe('validateCompleteForm', () => {
  const validBase: CompleteFormInput = {
    priceType: 'Estimate',
    fixedPriceCzk: null,
    finalPriceCzk: 100,
    paymentType: 'Cash',
    overrideRevealed: false,
    overrideReason: '',
  }

  it('valid form passes', () => {
    const errors = validateCompleteForm(validBase)
    expect(errors).toEqual({})
  })

  it('finalPriceCzk null fails', () => {
    const errors = validateCompleteForm({ ...validBase, finalPriceCzk: null })
    expect(errors.finalPriceCzk).toBeTruthy()
  })

  it('finalPriceCzk zero fails', () => {
    const errors = validateCompleteForm({ ...validBase, finalPriceCzk: 0 })
    expect(errors.finalPriceCzk).toBeTruthy()
  })

  it('finalPriceCzk negative fails', () => {
    const errors = validateCompleteForm({ ...validBase, finalPriceCzk: -1 })
    expect(errors.finalPriceCzk).toBeTruthy()
  })

  it('paymentType null fails', () => {
    const errors = validateCompleteForm({ ...validBase, paymentType: null })
    expect(errors.paymentType).toBeTruthy()
  })

  it('Fixed override revealed with short reason fails', () => {
    const errors = validateCompleteForm({
      ...validBase,
      priceType: 'Fixed',
      fixedPriceCzk: 100,
      finalPriceCzk: 150,
      overrideRevealed: true,
      overrideReason: 'ab',
    })
    expect(errors.overrideReason).toBeTruthy()
  })

  it('Fixed override revealed with reason >= 5 chars passes', () => {
    const errors = validateCompleteForm({
      ...validBase,
      priceType: 'Fixed',
      fixedPriceCzk: 100,
      finalPriceCzk: 150,
      overrideRevealed: true,
      overrideReason: 'valid reason',
    })
    expect(errors.overrideReason).toBeUndefined()
  })

  it('Fixed override revealed with a whitespace-only reason fails (trim-consistent, B3c-2)', () => {
    const errors = validateCompleteForm({
      ...validBase,
      priceType: 'Fixed',
      fixedPriceCzk: 100,
      finalPriceCzk: 150,
      overrideRevealed: true,
      overrideReason: '     ', // 5 spaces — passes untrimmed length but is dropped from the payload
    })
    expect(errors.overrideReason).toBeTruthy()
  })

  it('Fixed not overridden (same price) does not require reason', () => {
    const errors = validateCompleteForm({
      ...validBase,
      priceType: 'Fixed',
      fixedPriceCzk: 100,
      finalPriceCzk: 100,
      overrideRevealed: false,
      overrideReason: '',
    })
    expect(errors.overrideReason).toBeUndefined()
    expect(errors).toEqual({})
  })
})

// Type checks
const _state: CompleteFormState = deriveCompleteFormState('Fixed', 100, null)
void _state
