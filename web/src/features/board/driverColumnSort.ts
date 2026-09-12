import type { DriverSummaryDto } from '../../shared/api/client'
import type { DriverStatus } from './statusPill'

/** Status group priority for the drivers column: Free first, then EnRoute/Busy, Offline last. */
function statusGroupOrder(status: string): number {
  switch (status as DriverStatus) {
    case 'Free': return 0
    case 'EnRoute': return 1
    case 'Busy': return 1
    case 'Offline': return 2
    default: return 2
  }
}

/**
 * Sorts drivers for the right-column display:
 * 1. Free first
 * 2. EnRoute and Busy second (same group)
 * 3. Offline last
 * 4. Within each group: alphabetical by displayName
 */
export function sortDriversForColumn(drivers: DriverSummaryDto[]): DriverSummaryDto[] {
  return [...drivers].sort((a, b) => {
    const groupA = statusGroupOrder(a.status)
    const groupB = statusGroupOrder(b.status)
    if (groupA !== groupB) return groupA - groupB
    return a.displayName.localeCompare(b.displayName, 'cs')
  })
}
