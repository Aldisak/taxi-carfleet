import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../../shared/api/client', () => ({
  requestCustomerCode: vi.fn(),
  verifyCustomerCode: vi.fn(),
}))

vi.mock('../../../shared/api/auth-storage', () => ({
  authStorage: {
    getFleetSlug: vi.fn().mockReturnValue('demo'),
    setTokens: vi.fn(),
    clear: vi.fn(),
  },
}))

vi.mock('../../../shared/api/idbAuthStore', () => ({
  idbAuthStore: {
    setRefreshToken: vi.fn(),
    clear: vi.fn(),
  },
}))

vi.mock('../../../shared/api/refresh', () => ({
  enableSilentRefresh: vi.fn(),
  scheduleProactiveRefresh: vi.fn(),
}))

import { useCustomerLogin } from './useCustomerLogin'
import { requestCustomerCode, verifyCustomerCode } from '../../../shared/api/client'
import { authStorage } from '../../../shared/api/auth-storage'
import { idbAuthStore } from '../../../shared/api/idbAuthStore'
import { enableSilentRefresh } from '../../../shared/api/refresh'

const mockRequest = vi.mocked(requestCustomerCode)
const mockVerify = vi.mocked(verifyCustomerCode)
const mockAuthStorage = authStorage as unknown as Record<string, ReturnType<typeof vi.fn>>
const mockIdb = idbAuthStore as unknown as Record<string, ReturnType<typeof vi.fn>>

function makeVerifyResponse() {
  return {
    accessToken: 'access-tok',
    refreshToken: 'refresh-tok',
    user: { id: 'u1', phone: '+420123456789', displayName: '+420123456789', role: 'Customer' },
  }
}

describe('useCustomerLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthStorage.getFleetSlug.mockReturnValue('demo')
  })

  it('starts on the phone step', () => {
    const { result } = renderHook(() => useCustomerLogin())
    expect(result.current.step).toBe('phone')
  })

  it('rejects an invalid phone with a Czech error and does not call the API', async () => {
    const { result } = renderHook(() => useCustomerLogin())
    act(() => result.current.setPhone('123'))
    await act(async () => { await result.current.sendCode() })
    expect(result.current.error).toBe('customer.login.invalidPhone')
    expect(mockRequest).not.toHaveBeenCalled()
    expect(result.current.step).toBe('phone')
  })

  it('normalizes the phone to +420 and advances to the code step on send', async () => {
    mockRequest.mockResolvedValue(undefined)
    const { result } = renderHook(() => useCustomerLogin())
    act(() => result.current.setPhone('123 456 789'))
    await act(async () => { await result.current.sendCode() })
    expect(mockRequest).toHaveBeenCalledWith('+420123456789')
    expect(result.current.step).toBe('code')
  })

  it('maps a 429 on send to the Czech rate-limit message', async () => {
    mockRequest.mockRejectedValue({ status: 429 })
    const { result } = renderHook(() => useCustomerLogin())
    act(() => result.current.setPhone('123456789'))
    await act(async () => { await result.current.sendCode() })
    expect(result.current.error).toBe('customer.login.tooManyRequests')
    expect(result.current.step).toBe('phone')
  })

  it('verifies a code, stores tokens, enables silent refresh and calls onAuthenticated', async () => {
    mockRequest.mockResolvedValue(undefined)
    mockVerify.mockResolvedValue(makeVerifyResponse())
    const onAuthenticated = vi.fn()
    const { result } = renderHook(() => useCustomerLogin({ onAuthenticated }))

    act(() => result.current.setPhone('123456789'))
    await act(async () => { await result.current.sendCode() })
    await act(async () => { await result.current.submitCode('654321') })

    expect(mockVerify).toHaveBeenCalledWith('+420123456789', '654321')
    expect(mockAuthStorage.setTokens).toHaveBeenCalledWith('access-tok', 'refresh-tok', 'demo', 'Customer')
    expect(mockIdb.setRefreshToken).toHaveBeenCalledWith('refresh-tok')
    expect(enableSilentRefresh).toHaveBeenCalledWith('/c/login')
    expect(onAuthenticated).toHaveBeenCalledTimes(1)
  })

  it('shows the Czech code-mismatch error on a 401 and stays on the code step', async () => {
    mockRequest.mockResolvedValue(undefined)
    mockVerify.mockRejectedValue({ status: 401 })
    const onAuthenticated = vi.fn()
    const { result } = renderHook(() => useCustomerLogin({ onAuthenticated }))

    act(() => result.current.setPhone('123456789'))
    await act(async () => { await result.current.sendCode() })
    await act(async () => { await result.current.submitCode('000000') })

    expect(result.current.error).toBe('customer.login.codeMismatch')
    expect(result.current.step).toBe('code')
    expect(mockAuthStorage.setTokens).not.toHaveBeenCalled()
    expect(onAuthenticated).not.toHaveBeenCalled()
  })

  it('ignores a short code on submit (auto-submit guard)', async () => {
    mockRequest.mockResolvedValue(undefined)
    const { result } = renderHook(() => useCustomerLogin())
    act(() => result.current.setPhone('123456789'))
    await act(async () => { await result.current.sendCode() })
    await act(async () => { await result.current.submitCode('123') })
    expect(mockVerify).not.toHaveBeenCalled()
  })

  it('resend re-requests the code and surfaces the resent notice', async () => {
    mockRequest.mockResolvedValue(undefined)
    const { result } = renderHook(() => useCustomerLogin())
    act(() => result.current.setPhone('123456789'))
    await act(async () => { await result.current.sendCode() })
    mockRequest.mockClear()
    await act(async () => { await result.current.resend() })
    expect(mockRequest).toHaveBeenCalledWith('+420123456789')
    expect(result.current.notice).toBe('customer.login.resent')
  })
})
