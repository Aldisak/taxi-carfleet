/**
 * Normalizes a user-typed phone number to E.164 with a +420 (Czech) default.
 *
 * Rules:
 *   - leading "00" is treated as the international "+" prefix (00420… → +420…);
 *   - an existing "+" is kept (e.g. a Slovak +421 number passes through);
 *   - a bare number of 9 digits (the Czech national number length) gets +420;
 *   - spaces and common grouping characters are stripped;
 *   - anything that does not yield at least 9 national / 11 international digits → null.
 *
 * The server re-validates (PhoneNormalizer); this is the client-side fast path so the
 * UI can show a clean Czech error before the round-trip.
 */
export function normalizeCzechPhone(input: string): string | null {
  const trimmed = input.trim()
  if (trimmed === '') return null

  // Unify the international prefix: 00 → +.
  const s = trimmed.startsWith('00') ? `+${trimmed.slice(2)}` : trimmed

  const hasPlus = s.startsWith('+')
  // Keep only digits.
  const digits = s.replace(/\D/g, '')

  if (hasPlus) {
    // Full international form: country code + subscriber ≈ 11+ digits.
    if (digits.length < 11) return null
    return `+${digits}`
  }

  // National form — must be the 9-digit Czech subscriber number.
  if (digits.length !== 9) return null
  return `+420${digits}`
}

/** True when the string is exactly 6 decimal digits (the SMS OTP shape). */
export function isValidCode(code: string): boolean {
  return /^\d{6}$/.test(code)
}
