/** Order statuses in which a dispatcher can edit the order fields via PATCH. */
const EDITABLE_STATUSES = new Set(['New', 'Assigned'])

/**
 * Returns true when the order's status allows field editing via PATCH /orders/{id}.
 * Only New and Assigned orders are editable.
 */
export function isOrderEditable(status: string): boolean {
  return EDITABLE_STATUSES.has(status)
}
