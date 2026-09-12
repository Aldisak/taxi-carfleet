import { describe, it, expect } from 'vitest'
import {
  isOverrideReasonValid,
  priceWasChanged,
  buildCompletePayload,
  MIN_OVERRIDE_REASON_LENGTH,
} from './overrideReason'

describe('isOverrideReasonValid', () => {
  it('rejects a reason shorter than 5 chars', () => {
    expect(isOverrideReasonValid('ab')).toBe(false)
    expect(isOverrideReasonValid('abcd')).toBe(false)
  })

  it('accepts a reason of exactly 5 chars', () => {
    expect(isOverrideReasonValid('abcde')).toBe(true)
  })

  it('accepts a longer reason', () => {
    expect(isOverrideReasonValid('dopravní zácpa')).toBe(true)
  })

  it('trims whitespace before measuring', () => {
    expect(isOverrideReasonValid('  ab  ')).toBe(false)
    expect(isOverrideReasonValid('  abcde  ')).toBe(true)
  })

  it('exports MIN_OVERRIDE_REASON_LENGTH as 5', () => {
    expect(MIN_OVERRIDE_REASON_LENGTH).toBe(5)
  })
})

describe('priceWasChanged', () => {
  it('true when Fixed price differs from final', () => {
    expect(priceWasChanged('Fixed', 150, 200)).toBe(true)
  })

  it('false when Fixed price equals final', () => {
    expect(priceWasChanged('Fixed', 150, 150)).toBe(false)
  })

  it('false for non-Fixed price types regardless of amounts', () => {
    expect(priceWasChanged('Estimate', 150, 200)).toBe(false)
    expect(priceWasChanged('Meter', null, 200)).toBe(false)
  })

  it('false when fixed price is null', () => {
    expect(priceWasChanged('Fixed', null, 200)).toBe(false)
  })

  it('compares floored integers', () => {
    expect(priceWasChanged('Fixed', 150, 150.4)).toBe(false)
    expect(priceWasChanged('Fixed', 150, 151)).toBe(true)
  })
})

describe('buildCompletePayload', () => {
  it('builds payload with floored finalPriceCzk and paymentType', () => {
    const payload = buildCompletePayload({
      finalPriceCzk: 150.9,
      paymentType: 'Cash',
      overrideRevealed: false,
      overrideReason: '',
      priceType: 'Meter',
      fixedPriceCzk: null,
    })
    expect(payload.finalPriceCzk).toBe(150)
    expect(Number.isInteger(payload.finalPriceCzk)).toBe(true)
    expect(payload.paymentType).toBe('Cash')
    expect(payload.overrideReason).toBeUndefined()
  })

  it('includes overrideReason ONLY when Fixed price was actually changed', () => {
    const payload = buildCompletePayload({
      finalPriceCzk: 200,
      paymentType: 'Card',
      overrideRevealed: true,
      overrideReason: 'dopravní zácpa',
      priceType: 'Fixed',
      fixedPriceCzk: 150,
    })
    expect(payload.overrideReason).toBe('dopravní zácpa')
  })

  it('omits overrideReason when Fixed price unchanged even if revealed', () => {
    const payload = buildCompletePayload({
      finalPriceCzk: 150,
      paymentType: 'Card',
      overrideRevealed: true,
      overrideReason: 'should not be sent',
      priceType: 'Fixed',
      fixedPriceCzk: 150,
    })
    expect(payload.overrideReason).toBeUndefined()
  })

  it('omits overrideReason when not revealed', () => {
    const payload = buildCompletePayload({
      finalPriceCzk: 200,
      paymentType: 'Invoice',
      overrideRevealed: false,
      overrideReason: 'some text',
      priceType: 'Fixed',
      fixedPriceCzk: 150,
    })
    expect(payload.overrideReason).toBeUndefined()
  })

  it('omits overrideReason for Estimate/Meter', () => {
    const payload = buildCompletePayload({
      finalPriceCzk: 100,
      paymentType: 'Invoice',
      overrideRevealed: true,
      overrideReason: 'dopravní zácpa',
      priceType: 'Estimate',
      fixedPriceCzk: null,
    })
    expect(payload.overrideReason).toBeUndefined()
  })

  it('trims the override reason before sending', () => {
    const payload = buildCompletePayload({
      finalPriceCzk: 200,
      paymentType: 'Card',
      overrideRevealed: true,
      overrideReason: '  dopravní zácpa  ',
      priceType: 'Fixed',
      fixedPriceCzk: 150,
    })
    expect(payload.overrideReason).toBe('dopravní zácpa')
  })
})
