import { describe, it, expect } from 'vitest'
import { moveItem, computePriorityUpdates } from './priorityReorder'

describe('moveItem', () => {
  it('moves an item from one index to another, preserving the rest', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves upward', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('is a no-op when from === to', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c'])
  })
})

describe('computePriorityUpdates', () => {
  // The list is shown priority-DESC: the first row is the highest priority. After a reorder
  // we assign descending priorities (N-1 … 0) and return only the rows whose priority changed,
  // so the caller PATCHes the minimum set.
  it('assigns descending priorities and returns only the changed rows', () => {
    const reordered = [
      { id: 'a', priority: 10 },
      { id: 'b', priority: 20 }, // was lower, now second-from-top
      { id: 'c', priority: 5 },
    ]
    const updates = computePriorityUpdates(reordered)
    // top→bottom gets 2,1,0
    expect(updates).toEqual([
      { id: 'a', priority: 2 },
      { id: 'b', priority: 1 },
      { id: 'c', priority: 0 },
    ])
  })

  it('returns an empty list when priorities already match the descending order', () => {
    const reordered = [
      { id: 'a', priority: 2 },
      { id: 'b', priority: 1 },
      { id: 'c', priority: 0 },
    ]
    expect(computePriorityUpdates(reordered)).toEqual([])
  })
})
