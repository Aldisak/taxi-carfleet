import { type ReactNode } from 'react'
import styled from 'styled-components'

/** Props for {@link PanelHeader} — a desktop panel title bar. */
export interface PanelHeaderProps {
  /** Visible section title (uppercased via CSS; the DOM text stays as passed). */
  title: string
  /** Optional numeric count rendered as a small pill after the title. */
  count?: number
  /** Optional right-aligned meta slot (e.g. a "refreshed 3s ago" caption). */
  right?: ReactNode
}

/** Props for the {@link Panel} desktop surface container. */
export interface PanelProps {
  /** When set, a {@link PanelHeader} is rendered above the children. */
  title?: string
  /** Count forwarded to the auto header (only used when {@link title} is set). */
  count?: number
  /** Right-meta slot forwarded to the auto header (only used when {@link title} is set). */
  right?: ReactNode
  /** Panel body content. */
  children: ReactNode
}

const Surface = styled.section`
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
`

const HeaderRow = styled.header`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
`

const Title = styled.h2`
  margin: 0;
  font-size: var(--fs-caption);
  font-weight: var(--fw-extra);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ink-2);
`

const CountPill = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--r-pill);
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 11px;
  font-weight: var(--fw-extra);
`

const RightMeta = styled.div`
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: var(--fs-caption);
  color: var(--ink-3);
`

/** The panel header: uppercase title, optional count pill and right-meta slot. */
export function PanelHeader({ title, count, right }: PanelHeaderProps): JSX.Element {
  return (
    <HeaderRow>
      <Title>{title}</Title>
      {count !== undefined && <CountPill>{count}</CountPill>}
      {right !== undefined && <RightMeta>{right}</RightMeta>}
    </HeaderRow>
  )
}

/**
 * A desktop surface panel: white surface, 1px line border, r-md radius. When
 * {@link title} is set it renders a {@link PanelHeader}; otherwise the caller
 * composes its own header as a child.
 */
export function Panel({ title, count, right, children }: PanelProps): JSX.Element {
  return (
    <Surface>
      {title !== undefined && <PanelHeader title={title} count={count} right={right} />}
      {children}
    </Surface>
  )
}
