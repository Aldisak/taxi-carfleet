import { describe, it, expect } from 'vitest'
import {
  statusDescriptor,
  channelLabelKey,
  eventLabelKey,
  hasFailedSms,
  type OrderNotificationDto,
} from './notificationStatus'

function notif(partial: Partial<OrderNotificationDto>): OrderNotificationDto {
  return {
    event: 'OrderCreatedForCustomer',
    channel: 'Sms',
    recipient: '+420777123456',
    status: 'Sent',
    createdAt: '2026-09-13T10:00:00Z',
    ...partial,
  }
}

describe('statusDescriptor', () => {
  it('maps Sent to success', () => {
    expect(statusDescriptor('Sent')).toEqual({ labelKey: 'notifications.status.sent', tone: 'success' })
  })

  it('maps Failed to error', () => {
    expect(statusDescriptor('Failed')).toEqual({ labelKey: 'notifications.status.failed', tone: 'error' })
  })

  it('maps Queued to neutral', () => {
    expect(statusDescriptor('Queued').tone).toBe('neutral')
  })

  it('maps SkippedCap and SkippedNoChannel to muted', () => {
    expect(statusDescriptor('SkippedCap').tone).toBe('muted')
    expect(statusDescriptor('SkippedNoChannel').tone).toBe('muted')
  })

  it('falls back to neutral + unknown key for an unrecognized status', () => {
    expect(statusDescriptor('Weird')).toEqual({ labelKey: 'notifications.status.unknown', tone: 'neutral' })
  })
})

describe('channelLabelKey', () => {
  it('maps Sms and Push', () => {
    expect(channelLabelKey('Sms')).toBe('notifications.channel.sms')
    expect(channelLabelKey('Push')).toBe('notifications.channel.push')
  })

  it('falls back for unknown channels', () => {
    expect(channelLabelKey('Fax')).toBe('notifications.channel.unknown')
  })
})

describe('eventLabelKey', () => {
  it('builds the event key namespace', () => {
    expect(eventLabelKey('DriverArrived')).toBe('notifications.event.DriverArrived')
  })
})

describe('hasFailedSms', () => {
  it('is false for empty/missing lists', () => {
    expect(hasFailedSms(undefined)).toBe(false)
    expect(hasFailedSms(null)).toBe(false)
    expect(hasFailedSms([])).toBe(false)
  })

  it('is true when an SMS notification failed', () => {
    expect(hasFailedSms([notif({ channel: 'Sms', status: 'Failed' })])).toBe(true)
  })

  it('is false for a failed PUSH (not phone-actionable)', () => {
    expect(hasFailedSms([notif({ channel: 'Push', status: 'Failed' })])).toBe(false)
  })

  it('is false when all SMS notifications succeeded', () => {
    expect(hasFailedSms([
      notif({ channel: 'Sms', status: 'Sent' }),
      notif({ channel: 'Push', status: 'Failed' }),
    ])).toBe(false)
  })
})
