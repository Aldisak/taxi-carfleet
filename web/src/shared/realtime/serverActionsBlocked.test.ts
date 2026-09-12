/**
 * Tests for isServerActionBlocked — the pure predicate that gates all
 * server-mutating actions during disconnect or reconnect.
 */
import { describe, it, expect } from 'vitest'
import { isServerActionBlocked } from './useFleetHub'
import type { ConnectionState } from './useFleetHub'

describe('isServerActionBlocked', () => {
  it('returns false when connected', () => {
    expect(isServerActionBlocked('connected')).toBe(false)
  })

  it('returns false when connecting (initial boot — do not block on first load)', () => {
    expect(isServerActionBlocked('connecting')).toBe(false)
  })

  it('returns true when disconnected', () => {
    expect(isServerActionBlocked('disconnected')).toBe(true)
  })

  it('returns true when reconnecting', () => {
    expect(isServerActionBlocked('reconnecting')).toBe(true)
  })

  it('covers all four ConnectionState values without omission', () => {
    const states: ConnectionState[] = ['connected', 'connecting', 'disconnected', 'reconnecting']
    const results = states.map(s => isServerActionBlocked(s))
    // exactly two states return true
    expect(results.filter(Boolean)).toHaveLength(2)
    // 'connected' and 'connecting' are false
    expect(isServerActionBlocked('connected')).toBe(false)
    expect(isServerActionBlocked('connecting')).toBe(false)
  })
})
