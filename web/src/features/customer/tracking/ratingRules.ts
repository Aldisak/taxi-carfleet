/**
 * Pure decision logic for the order-rating form (B-rating). Components render; this module
 * decides (rules/web-architecture.md#pure-logic-modules). Named ratingRules.ts (NOT ratingForm.ts)
 * to avoid the Windows case-collision with RatingForm.tsx (same trap as whenRules/headlineRules).
 */

/** Maximum length of the optional rating comment (matches the backend 500-char cap). */
export const MAX_RATING_COMMENT_LENGTH = 500

/** Lowest valid star value. */
export const MIN_STARS = 1

/** Highest valid star value. */
export const MAX_STARS = 5

/**
 * Whether a rating is ready to submit: stars must be a whole number in 1..5 and the comment
 * (optional) must be within the length cap. An empty/whitespace comment is allowed.
 */
export function canSubmitRating(stars: number, comment: string): boolean {
  if (!Number.isInteger(stars) || stars < MIN_STARS || stars > MAX_STARS) return false
  if (comment.length > MAX_RATING_COMMENT_LENGTH) return false
  return true
}

/** Display state of the rating section. */
export type RatingView =
  | { kind: 'form' }
  | { kind: 'thanks'; stars: number | null }

/**
 * Decides whether to show the form or the read-only "thanks" state (once-per-order). An order
 * that already carries a rating (ratingStars != null from orders/mine), or one that was just
 * submitted locally, shows thanks with the stored stars; otherwise the form.
 */
export function resolveRatingView(input: {
  existingStars: number | null
  submitted: boolean
  submittedStars: number | null
}): RatingView {
  if (input.existingStars != null) return { kind: 'thanks', stars: input.existingStars }
  if (input.submitted) return { kind: 'thanks', stars: input.submittedStars }
  return { kind: 'form' }
}
