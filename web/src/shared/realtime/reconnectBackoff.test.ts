import { describe, it, expect } from 'vitest'
import { getReconnectDelay } from './reconnectBackoff'

describe('getReconnectDelay', () => {
  it('returns 0ms for first retry (retryCount=0)', () => {
    expect(getReconnectDelay(0)).toBe(0)
  })

  it('returns 2000ms for second retry (retryCount=1)', () => {
    expect(getReconnectDelay(1)).toBe(2000)
  })

  it('returns 5000ms for third retry (retryCount=2)', () => {
    expect(getReconnectDelay(2)).toBe(5000)
  })

  it('returns 10000ms for fourth retry (retryCount=3)', () => {
    expect(getReconnectDelay(3)).toBe(10000)
  })

  it('returns 30000ms for fifth retry (retryCount=4)', () => {
    expect(getReconnectDelay(4)).toBe(30000)
  })

  it('caps at 30000ms for any retry beyond 4', () => {
    expect(getReconnectDelay(5)).toBe(30000)
    expect(getReconnectDelay(10)).toBe(30000)
    expect(getReconnectDelay(100)).toBe(30000)
  })

  it('never returns null (no give-up)', () => {
    for (let i = 0; i < 50; i++) {
      expect(getReconnectDelay(i)).not.toBeNull()
    }
  })
})
