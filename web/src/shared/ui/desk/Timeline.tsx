import styled from 'styled-components'

/** One event in a {@link Timeline}. */
export interface TimelineItem {
  /** Event title (13/700). */
  title: string
  /** Optional secondary caption (actor · relative time · reason). */
  caption?: string
  /** When true this dot is the current/latest event, highlighted with the accent colour. */
  accent?: boolean
}

/** Props for the {@link Timeline} — a vertical dot-and-title event list. */
export interface TimelineProps {
  /** The events, rendered top to bottom in the order given. */
  items: TimelineItem[]
}

const List = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
`

const Item = styled.li`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 0 14px 20px;

  &::before {
    content: '';
    position: absolute;
    left: 5px;
    top: 14px;
    bottom: 0;
    width: 1px;
    background: var(--line);
  }

  &:last-child::before {
    display: none;
  }
`

const Dot = styled.span<{ $accent: boolean }>`
  position: absolute;
  left: 0;
  top: 4px;
  width: 11px;
  height: 11px;
  border-radius: var(--r-pill);
  background: ${({ $accent }) => ($accent ? 'var(--accent)' : 'var(--surface-3)')};
  border: 2px solid var(--surface);
  box-shadow: 0 0 0 1px ${({ $accent }) => ($accent ? 'var(--accent)' : 'var(--line-strong)')};
`

const Title = styled.span`
  font-size: var(--fs-label);
  font-weight: var(--fw-bold);
  color: var(--ink);
`

const Caption = styled.span`
  font-size: var(--fs-caption);
  color: var(--ink-2);
`

/** A vertical timeline of dot + title + optional caption; the accent dot marks the latest event. */
export function Timeline({ items }: TimelineProps): JSX.Element {
  return (
    <List>
      {items.map((item, i) => (
        <Item key={`${item.title}-${i}`}>
          <Dot $accent={item.accent === true} aria-hidden="true" />
          <Title>{item.title}</Title>
          {item.caption !== undefined && <Caption>{item.caption}</Caption>}
        </Item>
      ))}
    </List>
  )
}
