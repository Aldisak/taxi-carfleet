/**
 * Inputs for a route validity summary (the subset of RouteAdminDto that determines when a
 * route applies). validDays is a bitmask 1=Mon … 64=Sun; times are "HH:mm:ss"/"HH:mm" or null.
 */
export interface ValidityInput {
  validDays: number
  validFromTime: string | null
  validToTime: string | null
}

// Czech weekday abbreviations in Mon→Sun order, aligned with the 1…64 bitmask bits. These are
// fixed domain labels (not free-standing UI copy), kept in this pure module so it stays unit-
// testable without i18n — the pattern used by the other pure board modules (statusPill.ts).
const DAY_LABELS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'] as const
const ALL_DAY = 'celý den'
const NEVER = 'Nikdy'

/** Trims a "HH:mm:ss" (or "HH:mm") time string to "HH:mm". */
function toHhMm(time: string): string {
  const [h = '00', m = '00'] = time.split(':')
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`
}

/** The indices (0=Mon … 6=Sun) of the set bits in the validDays mask, ascending. */
function selectedDayIndices(validDays: number): number[] {
  const out: number[] = []
  for (let i = 0; i < 7; i++) {
    if ((validDays & (1 << i)) !== 0) out.push(i)
  }
  return out
}

/**
 * Collapses selected day indices into a compact label: a contiguous run of ≥2 becomes a
 * range "Pá–So"; isolated days are listed; multiple groups join with ", ".
 * e.g. [4,5] → "Pá–So"; [0,1,2,4] → "Po–St, Pá"; [0,2,4] → "Po, St, Pá"; all seven → "Po–Ne".
 */
function formatDays(indices: number[]): string {
  const groups: string[] = []
  let i = 0
  while (i < indices.length) {
    let j = i
    while (j + 1 < indices.length && indices[j + 1] === indices[j]! + 1) j++
    const runLength = j - i + 1
    if (runLength >= 2) {
      groups.push(`${DAY_LABELS[indices[i]!]}–${DAY_LABELS[indices[j]!]}`)
    } else {
      for (let k = i; k <= j; k++) groups.push(DAY_LABELS[indices[k]!]!)
    }
    i = j + 1
  }
  return groups.join(', ')
}

/**
 * Builds a human Czech validity summary for a route, e.g. "Po–Ne, celý den",
 * "Pá–So 22:00–06:00", "Po, St, Pá, celý den". A full-day window (no from/to) reads
 * "…, celý den"; a bounded window appends " HH:mm–HH:mm" (a midnight-wrapping window like
 * 22:00–06:00 is shown verbatim — the wrap is a matching-time concern, not a display one).
 * No valid days → "Nikdy".
 */
export function buildValiditySummary(input: ValidityInput): string {
  const indices = selectedDayIndices(input.validDays)
  if (indices.length === 0) return NEVER

  const days = formatDays(indices)
  const hasWindow = input.validFromTime != null && input.validToTime != null

  if (!hasWindow) {
    return `${days}, ${ALL_DAY}`
  }
  return `${days} ${toHhMm(input.validFromTime!)}–${toHhMm(input.validToTime!)}`
}
