import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { formatEventTime } from './eventTimeline'
import type { OrderEventDto } from '../../shared/api/client'

const TimelineList = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
`

const TimelineItem = styled.li`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};

  &:last-child {
    border-bottom: none;
  }
`

const TimelineDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme }) => theme.colors.primary};
  flex-shrink: 0;
  margin-top: 4px;
`

const TimelineContent = styled.div`
  flex: 1;
`

const EventType = styled.div`
  font-weight: ${({ theme }) => theme.typography.fontWeightMedium};
  color: ${({ theme }) => theme.colors.text};
`

const EventMeta = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  margin-top: 1px;
`

const EventPayload = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeXs};
  margin-top: 2px;
  font-style: italic;
`

const EmptyMessage = styled.div`
  padding: ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  text-align: center;
`

interface EventTimelineProps {
  events: OrderEventDto[]
}

/** Renders the order event timeline in Czech with actor and relative time. */
export function EventTimeline({ events }: EventTimelineProps) {
  const { t } = useTranslation()

  if (events.length === 0) {
    return <EmptyMessage>{t('orders.timeline.noEvents')}</EmptyMessage>
  }

  // Show most recent first
  const sorted = [...events].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  )

  return (
    <TimelineList>
      {sorted.map((event, idx) => {
        const { relative, absolute } = formatEventTime(event.at)
        const actor = t(`orders.timeline.actor.${event.actorRole}`, { defaultValue: event.actorRole })
        const label = t(`orders.timeline.event.${event.type}`, { defaultValue: event.type })

        // Extract notable payload fields
        const reason = event.payload?.['reason'] as string | undefined
        const note = event.payload?.['note'] as string | undefined

        return (
          <TimelineItem key={idx}>
            <TimelineDot />
            <TimelineContent>
              <EventType>{label}</EventType>
              <EventMeta>
                {actor} · <span title={absolute}>{relative}</span>
              </EventMeta>
              {reason && (
                <EventPayload>
                  {t('board.cancelReasons.title')}: {reason}
                </EventPayload>
              )}
              {note && <EventPayload>{note}</EventPayload>}
            </TimelineContent>
          </TimelineItem>
        )
      })}
    </TimelineList>
  )
}
