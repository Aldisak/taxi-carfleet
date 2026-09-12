import { describe, it, expect } from 'vitest'
import { canSubmitRating, resolveRatingView, MAX_RATING_COMMENT_LENGTH } from './ratingRules'

describe('canSubmitRating', () => {
  it('requires at least one star', () => {
    expect(canSubmitRating(0, '')).toBe(false)
  })

  it('accepts 1..5 stars', () => {
    for (const s of [1, 2, 3, 4, 5]) {
      expect(canSubmitRating(s, '')).toBe(true)
    }
  })

  it('rejects stars above 5 and non-integers', () => {
    expect(canSubmitRating(6, '')).toBe(false)
    expect(canSubmitRating(2.5, '')).toBe(false)
  })

  it('allows an optional comment within the cap', () => {
    expect(canSubmitRating(3, 'Skvělá jízda')).toBe(true)
    expect(canSubmitRating(3, 'x'.repeat(MAX_RATING_COMMENT_LENGTH))).toBe(true)
  })

  it('rejects a comment over the cap', () => {
    expect(canSubmitRating(3, 'x'.repeat(MAX_RATING_COMMENT_LENGTH + 1))).toBe(false)
  })
})

describe('resolveRatingView', () => {
  it('shows the form when not yet rated', () => {
    expect(resolveRatingView({ existingStars: null, submitted: false, submittedStars: null })).toEqual({
      kind: 'form',
    })
  })

  it('shows thanks with stored stars when the order already has a rating', () => {
    expect(resolveRatingView({ existingStars: 4, submitted: false, submittedStars: null })).toEqual({
      kind: 'thanks',
      stars: 4,
    })
  })

  it('shows thanks after a local submit (204 has no body)', () => {
    expect(resolveRatingView({ existingStars: null, submitted: true, submittedStars: 5 })).toEqual({
      kind: 'thanks',
      stars: 5,
    })
  })

  it('prefers the existing rating over a local submit', () => {
    expect(resolveRatingView({ existingStars: 3, submitted: true, submittedStars: 5 })).toEqual({
      kind: 'thanks',
      stars: 3,
    })
  })
})
