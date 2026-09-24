import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { DeskPill, type DeskPillTone } from '../../shared/ui/desk'
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
  gap: 8px;
`

const Item = styled.li`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
`

const TopRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`

const EventLabel = styled.span`
  font-size: var(--fs-label);
  font-weight: var(--fw-bold);
  color: var(--ink);
`

const TimeLabel = styled.span`
  font-size: var(--fs-caption);
  color: var(--ink-2);
  margin-left: auto;
`

const Recipient = styled.span`
  font-size: var(--fs-caption);
  color: var(--ink-2);
`

const ErrorText = styled.span`
  font-size: var(--fs-caption);
  color: var(--danger);
`

const EmptyText = styled.p`
  font-size: var(--fs-body);
  color: var(--ink-2);
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

/** Map a notification status tone to the desk-kit pill tone. */
function toDeskTone(tone: NotificationTone): DeskPillTone {
  switch (tone) {
    case 'success':
      return 'success'
    case 'error':
      return 'danger'
    case 'muted':
    case 'neutral':
    default:
      return 'neutral'
  }
}

export interface NotificationsSectionProps {
  notifications: readonly OrderNotificationDto[]
}

/**
 * Dispatcher "Notifikace" list in the order drawer (UC-005 B2), restyled onto the desk kit (WI-5):
 * each row shows the Czech event label, a channel {@link DeskPill} (SMS/Push), a status
 * {@link DeskPill} (Odesláno/Selhalo/Ve frontě/Přeskočeno — tone, not colour alone; `role="status"`
 * conveys it to AT), the recipient, the send/create time in Europe/Prague, and the provider error.
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
              <DeskPill tone="neutral">{t(channelLabelKey(n.channel), n.channel)}</DeskPill>
              <span
                role="status"
                aria-label={t('notifications.statusOf', { status: t(desc.labelKey) })}
              >
                <DeskPill tone={toDeskTone(desc.tone)}>{t(desc.labelKey)}</DeskPill>
              </span>
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
