import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePwaInstall } from './usePwaInstall'

/**
 * BeforeInstallPromptEvent is not in lib.dom — declare locally.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function createPromptEvent(): BeforeInstallPromptEvent {
  const evt = new Event('beforeinstallprompt') as BeforeInstallPromptEvent
  evt.prompt = vi.fn().mockResolvedValue(undefined)
  evt.userChoice = Promise.resolve({ outcome: 'accepted' as const })
  return evt
}

describe('usePwaInstall', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    // Clean up any deferred prompt state
    vi.restoreAllMocks()
  })

  it('canInstall is false initially', () => {
    const { result } = renderHook(() => usePwaInstall())
    expect(result.current.canInstall).toBe(false)
  })

  it('canInstall becomes true when beforeinstallprompt fires', () => {
    const { result } = renderHook(() => usePwaInstall())

    act(() => {
      window.dispatchEvent(createPromptEvent())
    })

    expect(result.current.canInstall).toBe(true)
  })

  it('triggerInstall calls prompt() on the captured event', async () => {
    const { result } = renderHook(() => usePwaInstall())
    const promptEvent = createPromptEvent()

    act(() => {
      window.dispatchEvent(promptEvent)
    })

    await act(async () => {
      await result.current.triggerInstall()
    })

    expect(promptEvent.prompt).toHaveBeenCalledOnce()
  })

  it('canInstall becomes false after appinstalled fires', () => {
    const { result } = renderHook(() => usePwaInstall())

    act(() => {
      window.dispatchEvent(createPromptEvent())
    })
    expect(result.current.canInstall).toBe(true)

    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(result.current.canInstall).toBe(false)
  })

  it('triggerInstall is a no-op when canInstall is false', async () => {
    const { result } = renderHook(() => usePwaInstall())
    // No prompt event fired — canInstall is false
    await act(async () => {
      await result.current.triggerInstall()
    })
    // Should not throw
    expect(result.current.canInstall).toBe(false)
  })
})
