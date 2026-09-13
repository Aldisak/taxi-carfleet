import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import {
  statusDescriptor,
  channelLabelKey,
  eventLabelKey,
  type NotificationTone,
  type OrderNotificationDto,
} from '../../shared/notifications/notificationStatus'

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
`

const Item = styled.li`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
`

const TopRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  flex-wrap: wrap;
`

const EventLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.text};
`

const ChannelLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const StatusPill = styled.span<{ $tone: NotificationTone }>`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  padding: 1px ${({ theme }) => theme.spacing.xs};
  border-radius: ${({ theme }) => theme.borderRadius.full};
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  background: ${({ $tone, theme }) => {
    switch ($tone) {
      case 'success': return theme.colors.orderCompleted
      case 'error': return theme.colors.orderCancelled
      case 'muted': return theme.colors.border
      default: return theme.colors.background
    }
  }};
  color: ${({ $tone, theme }) => {
    switch ($tone) {
      case 'success': return theme.colors.orderCompletedText
      case 'error': return theme.colors.orderCancelledText
      default: return theme.colors.text
    }
  }};
`

const TimeLabel = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-left: auto;
`

const Recipient = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const ErrorText = styled.span`
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  color: ${({ theme }) => theme.colors.error};
`

const EmptyText = styled.p`
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0;
`

/** Format a UTC ISO timestamp for display in Europe/Prague (date + time, cs-CZ). */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('cs-CZ', {
    timeZone: 'Europe/Prague',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export interface NotificationsSectionProps {
  notifications: readonly OrderNotificationDto[]
}

/**
 * Dispatcher "Notifikace" list in the order drawer (UC-005 B2, assignment 05 §5). Renders each
 * sent/failed/skipped notification with a Czech event label, channel, status pill (tone, not color
 * alone — role="status" conveys it to AT), recipient, and the send/create time in Europe/Prague.
 */
export function NotificationsSection({ notifications }: NotificationsSectionProps) {
  const { t } = useTranslation()

  if (notifications.length === 0) {
    return <EmptyText>{t('notifications.empty')}</EmptyText>
  }

  return (
    <List aria-label={t('notifications.title')}>
      {notifications.map((n, i) => {
        const desc = statusDescriptor(n.status)
        const when = n.sentAt ?? n.createdAt
        return (
          <Item key={`${n.event}-${n.channel}-${n.createdAt}-${i}`}>
            <TopRow>
              <EventLabel>{t(eventLabelKey(n.event), n.event)}</EventLabel>
              <ChannelLabel>{t(channelLabelKey(n.channel), n.channel)}</ChannelLabel>
              <StatusPill
                $tone={desc.tone}
                role="status"
                aria-label={t('notifications.statusOf', {
                  status: t(desc.labelKey),
                })}
              >
                {t(desc.labelKey)}
              </StatusPill>
              <TimeLabel>{formatTime(when)}</TimeLabel>
            </TopRow>
            <Recipient>{n.recipient}</Recipient>
            {n.status === 'Failed' && n.error && <ErrorText>{n.error}</ErrorText>}
          </Item>
        )
      })}
    </List>
  )
}
