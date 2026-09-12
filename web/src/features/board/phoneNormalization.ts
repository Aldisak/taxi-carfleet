/**
 * Mirrors the backend PhoneNormalizer logic.
 * Czech-first: bare 9-digit numbers are treated as Czech and prefixed with +420.
 * Numbers already in E.164 format are validated and passed through.
 * Un-normalizable input returns null.
 */

/** Matches a full E.164 number: + followed by 7–15 digits (ITU-T E.164). */
const E164_REGEX = /^\+\d{7,15}$/

/** Matches exactly 9 digits — a Czech local number without country code. */
const CZECH_LOCAL_REGEX = /^\d{9}$/

/**
 * Attempts to normalize a raw phone string to E.164 format.
 * Strips spaces and dashes for flexible input.
 * Returns the normalized E.164 string on success, or null on failure.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null

  // Strip spaces and dashes (mirrors C# Replace(" ", "").Replace("-", ""))
  const cleaned = raw.replace(/[ -]/g, '')

  // Already E.164?
  if (E164_REGEX.test(cleaned)) return cleaned

  // Bare 9-digit Czech number → prepend +420
  if (CZECH_LOCAL_REGEX.test(cleaned)) return '+420' + cleaned

  return null
}

/**
 * Returns true if the raw phone string can be normalized to E.164 format.
 */
export function isValidPhone(raw: string | null | undefined): boolean {
  return normalizePhone(raw) !== null
}
