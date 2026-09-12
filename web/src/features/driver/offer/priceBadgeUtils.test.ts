import { describe, it, expect } from 'vitest'
import { derivePriceBadge, type PriceBadgeResult } from './priceBadgeUtils'

describe('derivePriceBadge', () => {
  describe('Fixed price', () => {
    it('returns PEVNÁ label', () => {
      const result = derivePriceBadge('Fixed', 250, null)
      expect(result.label).toBe('driver.offer.priceFixed')
    })

    it('returns green variant', () => {
      const result = derivePriceBadge('Fixed', 250, null)
      expect(result.variant).toBe('green')
    })

    it('includes the price amount', () => {
      const result = derivePriceBadge('Fixed', 350, null)
      expect(result.amount).toBe(350)
    })
  })

  describe('Estimate price', () => {
    it('returns Odhad label', () => {
      const result = derivePriceBadge('Estimate', null, 200)
      expect(result.label).toBe('driver.offer.priceEstimate')
    })

    it('returns grey variant', () => {
      const result = derivePriceBadge('Estimate', null, 200)
      expect(result.variant).toBe('grey')
    })

    it('includes the estimated amount', () => {
      const result = derivePriceBadge('Estimate', null, 180)
      expect(result.amount).toBe(180)
    })
  })

  describe('Meter price', () => {
    it('returns Taxametr label', () => {
      const result = derivePriceBadge('Meter', null, null)
      expect(result.label).toBe('driver.offer.priceMeter')
    })

    it('returns grey variant', () => {
      const result = derivePriceBadge('Meter', null, null)
      expect(result.variant).toBe('grey')
    })

    it('amount is null for meter', () => {
      const result = derivePriceBadge('Meter', null, null)
      expect(result.amount).toBeNull()
    })
  })

  describe('Unknown price type falls back to grey', () => {
    it('unknown type returns grey', () => {
      const result = derivePriceBadge('Unknown', null, null)
      expect(result.variant).toBe('grey')
    })
  })
})

// Ensure type is exported
const _typeCheck: PriceBadgeResult = derivePriceBadge('Fixed', 100, null)
void _typeCheck
