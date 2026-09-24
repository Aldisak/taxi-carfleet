import { describe, it, expect } from 'vitest'
import { getDriverStatusInfo, getOrderStatusTone, getDriverStatusTone } from './statusPill'

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

describe('getOrderStatusTone — order status → DeskPill tone (desk redesign §3)', () => {
  it('New is info', () => {
    expect(getOrderStatusTone('New')).toBe('info')
  })

  it('Assigned is warning (waiting on acceptance)', () => {
    expect(getOrderStatusTone('Assigned')).toBe('warning')
  })

  it('in-progress statuses are accent', () => {
    expect(getOrderStatusTone('Accepted')).toBe('accent')
    expect(getOrderStatusTone('Arrived')).toBe('accent')
    expect(getOrderStatusTone('InProgress')).toBe('accent')
  })

  it('Completed is success', () => {
    expect(getOrderStatusTone('Completed')).toBe('success')
  })

  it('Cancelled is danger', () => {
    expect(getOrderStatusTone('Cancelled')).toBe('danger')
  })

  it('unknown status falls back to neutral', () => {
    expect(getOrderStatusTone('Whatever')).toBe('neutral')
  })
})

describe('getDriverStatusTone — driver status → DeskPill tone (desk redesign §3)', () => {
  it('Free is success', () => {
    expect(getDriverStatusTone('Free')).toBe('success')
  })

  it('EnRoute is info', () => {
    expect(getDriverStatusTone('EnRoute')).toBe('info')
  })

  it('Busy is warning', () => {
    expect(getDriverStatusTone('Busy')).toBe('warning')
  })

  it('Offline is neutral', () => {
    expect(getDriverStatusTone('Offline')).toBe('neutral')
  })

  it('unknown status falls back to neutral', () => {
    expect(getDriverStatusTone('Unknown')).toBe('neutral')
  })
})
