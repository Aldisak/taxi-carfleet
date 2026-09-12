/** A single priority assignment for a route (the minimal PATCH payload). */
export interface PriorityUpdate {
  id: string
  priority: number
}

/** Immutably moves the element at `from` to index `to`, shifting the others. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)
  return next
}

/**
 * Given a list already in the desired top→bottom order (top = highest priority), assigns
 * descending priorities (length-1 … 0) and returns ONLY the rows whose priority actually
 * changed — so the caller issues the minimum number of PATCH /routes/{id}/priority calls
 * (rules/web-performance.md). The list is rendered priority-DESC, so the first element is the
 * most-preferred match.
 */
export function computePriorityUpdates(
  ordered: readonly { id: string; priority: number }[],
): PriorityUpdate[] {
  const updates: PriorityUpdate[] = []
  const top = ordered.length - 1
  ordered.forEach((item, index) => {
    const target = top - index
    if (item.priority !== target) {
      updates.push({ id: item.id, priority: target })
    }
  })
  return updates
}
