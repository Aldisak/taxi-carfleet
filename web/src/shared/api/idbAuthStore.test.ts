import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

import { idbAuthStore } from './idbAuthStore'

describe('idbAuthStore', () => {
  beforeEach(async () => {
    await idbAuthStore.clear()
  })

  it('getRefreshToken returns null when nothing stored', async () => {
    const token = await idbAuthStore.getRefreshToken()
    expect(token).toBeNull()
  })

  it('setRefreshToken and getRefreshToken roundtrip', async () => {
    await idbAuthStore.setRefreshToken('my-refresh-token')
    const token = await idbAuthStore.getRefreshToken()
    expect(token).toBe('my-refresh-token')
  })

  it('clear removes the stored token', async () => {
    await idbAuthStore.setRefreshToken('abc123')
    await idbAuthStore.clear()
    const token = await idbAuthStore.getRefreshToken()
    expect(token).toBeNull()
  })

  it('overwrites a previous token on second setRefreshToken', async () => {
    await idbAuthStore.setRefreshToken('token-v1')
    await idbAuthStore.setRefreshToken('token-v2')
    const token = await idbAuthStore.getRefreshToken()
    expect(token).toBe('token-v2')
  })
})
