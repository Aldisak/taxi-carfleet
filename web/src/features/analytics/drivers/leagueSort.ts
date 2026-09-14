/**
 * Pure client-side sort logic for the driver league table.
 *
 * Returns a new sorted array — never mutates the input.
 * Null numeric values (avgRating) are always placed last regardless of direction.
 */

import type { DriverLeagueRowDto } from '../../../shared/api/client'

/** Columns by which the league table can be sorted. */
export type LeagueSortKey = keyof DriverLeagueRowDto

/** Sort direction. */
export type SortDirection = 'asc' | 'desc'

/**
 * Sorts a copy of the driver league table by the given column and direction.
 *
 * @param rows - Input rows (not mutated).
 * @param key - Column to sort by.
 * @param direction - 'asc' or 'desc'.
 * @returns A new sorted array.
 */
export function sortLeague(
  rows: DriverLeagueRowDto[],
  key: LeagueSortKey,
  direction: SortDirection,
): DriverLeagueRowDto[] {
  return [...rows].sort((a, b) => {
    const aVal = a[key]
    const bVal = b[key]

    // Null values sink to the bottom in either direction
    if (aVal === null && bVal === null) return 0
    if (aVal === null) return 1
    if (bVal === null) return -1

    let cmp: number
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      cmp = aVal.localeCompare(bVal, 'cs')
    } else {
      cmp = (aVal as number) < (bVal as number) ? -1 : (aVal as number) > (bVal as number) ? 1 : 0
    }

    return direction === 'asc' ? cmp : -cmp
  })
}
