import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { Timeline, type TimelineItem } from '../../shared/ui/desk'
import { formatEventTime } from './eventTimeline'
import { auditEventLabelKey } from '../../shared/audit/auditEventLabel'
import type { OrderEventDto } from '../../shared/api/client'

const EmptyMessage = styled.div`
  padding: 12px;
  color: var(--ink-2);
  font-size: var(--fs-body);
  text-align: center;
`

interface EventTimelineProps {
  events: OrderEventDto[]
}

/**
 * Renders the order event timeline on the desk-kit {@link Timeline} (newest first). Each event
 * becomes a title (the Czech event label) plus a single caption folding "Actor · relative time"
 * and, when present, the cancel reason / note (the desk Timeline caption is one line — see the
 * WI-5 handoff deviation). The latest (topmost) event gets the accent dot.
 */
export function EventTimeline({ events }: EventTimelineProps) {
  const { t } = useTranslation()

  if (events.length === 0) {
    return <EmptyMessage>{t('orders.timeline.noEvents')}</EmptyMessage>
  }

  // Show most recent first
  const sorted = [...events].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  )

  const items: TimelineItem[] = sorted.map((event, idx) => {
    const { relative } = formatEventTime(event.at)
    const actor = t(`orders.timeline.actor.${event.actorRole}`, { defaultValue: event.actorRole })
    const title = t(auditEventLabelKey(event.type), { defaultValue: event.type })

    const reason = event.payload?.['reason'] as string | undefined
    const note = event.payload?.['note'] as string | undefined

    const parts = [`${actor} · ${relative}`]
    if (reason) parts.push(`${t('board.cancelReasons.title')}: ${reason}`)
    if (note) parts.push(note)

    return {
      title,
      caption: parts.join(' · '),
      accent: idx === 0,
    }
  })

  return <Timeline items={items} />
}
