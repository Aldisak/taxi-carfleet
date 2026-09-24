import { describe, it, expect } from 'vitest'
import { getOrderStatusTone } from './orderStatusTone'

describe('orderStatusTone — order status → DeskPill tone', () => {
  it('maps New to info', () => {
    expect(getOrderStatusTone('New')).toBe('info')
  })

  it('maps Assigned to warning', () => {
    expect(getOrderStatusTone('Assigned')).toBe('warning')
  })

  it('maps in-flight statuses (Accepted, Arrived, InProgress) to accent', () => {
    expect(getOrderStatusTone('Accepted')).toBe('accent')
    expect(getOrderStatusTone('Arrived')).toBe('accent')
    expect(getOrderStatusTone('InProgress')).toBe('accent')
  })

  it('maps Completed to success', () => {
    expect(getOrderStatusTone('Completed')).toBe('success')
  })

  it('maps Cancelled to danger', () => {
    expect(getOrderStatusTone('Cancelled')).toBe('danger')
  })

  it('falls back to neutral for an unknown status', () => {
    expect(getOrderStatusTone('Whatever')).toBe('neutral')
  })
})
