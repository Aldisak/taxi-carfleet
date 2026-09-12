import { describe, it, expect } from 'vitest'
import { getDriverStatusInfo } from './statusPill'

describe('getDriverStatusInfo', () => {
  it('returns i18n key status.driver.Free + green for Free', () => {
    const info = getDriverStatusInfo('Free')
    expect(info.labelKey).toBe('status.driver.Free')
    expect(info.colorKey).toBe('statusFree')
    expect(info.textColorKey).toBe('statusFreeText')
  })

  it('returns i18n key status.driver.EnRoute + blue for EnRoute', () => {
    const info = getDriverStatusInfo('EnRoute')
    expect(info.labelKey).toBe('status.driver.EnRoute')
    expect(info.colorKey).toBe('statusEnRoute')
    expect(info.textColorKey).toBe('statusEnRouteText')
  })

  it('returns i18n key status.driver.Busy + yellow for Busy', () => {
    const info = getDriverStatusInfo('Busy')
    expect(info.labelKey).toBe('status.driver.Busy')
    expect(info.colorKey).toBe('statusBusy')
    expect(info.textColorKey).toBe('statusBusyText')
  })

  it('returns i18n key status.driver.Offline + grey for Offline', () => {
    const info = getDriverStatusInfo('Offline')
    expect(info.labelKey).toBe('status.driver.Offline')
    expect(info.colorKey).toBe('statusOffline')
    expect(info.textColorKey).toBe('statusOfflineText')
  })

  it('returns Offline i18n key + grey for unknown status', () => {
    const info = getDriverStatusInfo('Unknown' as never)
    expect(info.labelKey).toBe('status.driver.Offline')
    expect(info.colorKey).toBe('statusOffline')
  })
})
