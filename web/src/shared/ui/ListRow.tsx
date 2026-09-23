import { type ReactNode } from 'react'
import styled from 'styled-components'

/** Tone of the {@link ListIcon} container. */
export type ListIconTone = 'neutral' | 'accent'

/** Props for {@link ListIcon}, the 40px round icon container used inside a {@link ListRow}. */
export interface ListIconProps {
  /** The icon to render (a `ReactNode` slot — pass an `<Icon>` element). */
  icon: ReactNode
  /** Colour tone. `'neutral'` (surface/ink) by default, `'accent'` for the highlighted state. */
  tone?: ListIconTone
}

/** Props for {@link ListRow}, a min-60px list row with optional leading icon and trailing slot. */
export interface ListRowProps {
  /** Optional leading node (typically a {@link ListIcon}). */
  icon?: ReactNode
  /** The row title. Also the accessible name when the row is clickable. */
  title: string
  /** Optional secondary caption line under the title. */
  caption?: string
  /** Optional trailing node (chevron, value, badge). */
  trailing?: ReactNode
  /** When provided, the whole row renders as a `<button>` and fires on click. */
  onClick?: () => void
}

const IconBox = styled.span<{ $tone: ListIconTone }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: var(--r-pill);

  ${({ $tone }) =>
    $tone === 'accent'
      ? `background: var(--accent); color: var(--on-accent);`
      : `background: var(--surface-2); color: var(--ink);`}
`

/** A 40px round icon container, neutral or accent-toned, for the leading slot of a list row. */
export function ListIcon({ icon, tone = 'neutral' }: ListIconProps): JSX.Element {
  return <IconBox $tone={tone}>{icon}</IconBox>
}

const rowCss = `
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 60px;
  padding: 8px 4px;
  text-align: left;
`

const StaticRow = styled.div`
  ${rowCss}
`

const ButtonRow = styled.button`
  ${rowCss}
  border: none;
  background: transparent;
  font-family: inherit;
  color: inherit;
  cursor: pointer;
  transition: transform var(--dur-press);

  &:active {
    transform: scale(0.99);
  }
`

const Body = styled.span`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
`

const Title = styled.span`
  font-size: var(--fs-body-lg);
  font-weight: var(--fw-bold);
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const Caption = styled.span`
  font-size: var(--fs-caption);
  color: var(--ink-2);
`

const Trailing = styled.span`
  display: inline-flex;
  align-items: center;
  flex: none;
`

/** A list row (min 60px): optional leading icon, title + caption, optional trailing slot. */
export function ListRow({ icon, title, caption, trailing, onClick }: ListRowProps): JSX.Element {
  const content = (
    <>
      {icon}
      <Body>
        <Title>{title}</Title>
        {caption ? <Caption>{caption}</Caption> : null}
      </Body>
      {trailing ? <Trailing>{trailing}</Trailing> : null}
    </>
  )

  if (onClick) {
    return (
      <ButtonRow type="button" onClick={onClick}>
        {content}
      </ButtonRow>
    )
  }

  return <StaticRow>{content}</StaticRow>
}
