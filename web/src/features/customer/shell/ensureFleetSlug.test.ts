import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../shared/api/auth-storage', () => ({
  authStorage: { setFleetSlug: vi.fn() },
}))

import { ensureFleetSlug } from './ensureFleetSlug'
import { authStorage } from '../../../shared/api/auth-storage'

const mockAuthStorage = authStorage as unknown as Record<string, ReturnType<typeof vi.fn>>

describe('ensureFleetSlug', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves the slug from the URL and persists it to authStorage', () => {
    // jsdom default location is http://localhost/ → resolves to the 'demo' default.
    const slug = ensureFleetSlug()
    expect(slug).toBe('demo')
    expect(mockAuthStorage.setFleetSlug).toHaveBeenCalledWith('demo')
  })
})
