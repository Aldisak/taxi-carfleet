import type { DeskPillTone } from '../../shared/ui/desk'

/**
 * Maps an order status string to a {@link DeskPillTone} for the desk-kit status pill in the
 * order drawer (dispatcher redesign §3). Unknown statuses fall back to `'neutral'`.
 *
 * This intentionally duplicates `features/board/statusPill.ts#getOrderStatusTone` — a
 * cross-feature import is banned (rules/web-architecture.md#feature-folders) and promoting the
 * helper to `shared/` is out of this work item's file scope. See the WI-5 handoff `deviations`.
 */
export function getOrderStatusTone(status: string): DeskPillTone {
  switch (status) {
    case 'New':
      return 'info'
    case 'Assigned':
      return 'warning'
    case 'Accepted':
    case 'Arrived':
    case 'InProgress':
      return 'accent'
    case 'Completed':
      return 'success'
    case 'Cancelled':
      return 'danger'
    default:
      return 'neutral'
  }
}
