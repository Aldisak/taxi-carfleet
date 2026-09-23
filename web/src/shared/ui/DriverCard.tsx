import styled from 'styled-components'

/** Props for the shared {@link DriverCard}, a driver + vehicle summary card. */
export interface DriverCardProps {
  /** The driver's display name (also the source of the avatar initials). */
  name: string
  /** Initials shown in the avatar. Derived from `name` when omitted. */
  initials?: string
  /** Optional vehicle line (e.g. "Škoda Octavia · bílá"). */
  vehicle?: string
  /** Optional licence plate, rendered in a bordered SPZ style. */
  plate?: string
}

/** Derives up-to-two uppercase initials from a name (first letter of the first two words). */
function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

const Card = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-card);
  background: var(--surface);
  color: var(--ink);
`

const Avatar = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 48px;
  height: 48px;
  border-radius: var(--r-pill);
  background: var(--surface-2);
  color: var(--ink);
  font-size: var(--fs-body-lg);
  font-weight: var(--fw-extra);
`

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
`

const Name = styled.span`
  font-size: var(--fs-body-lg);
  font-weight: var(--fw-bold);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const Vehicle = styled.span`
  font-size: var(--fs-caption);
  color: var(--ink-2);
`

const Plate = styled.span`
  flex: none;
  padding: 4px 8px;
  border: 1px solid var(--line-strong);
  border-radius: var(--r-sm);
  font-weight: var(--fw-extra);
  letter-spacing: 0.08em;
`

/** A driver + vehicle card: initials avatar, name, vehicle line, and a bordered SPZ plate. */
export function DriverCard({ name, initials, vehicle, plate }: DriverCardProps): JSX.Element {
  return (
    <Card>
      <Avatar aria-hidden="true">{initials ?? deriveInitials(name)}</Avatar>
      <Body>
        <Name>{name}</Name>
        {vehicle ? <Vehicle>{vehicle}</Vehicle> : null}
      </Body>
      {plate ? <Plate>{plate}</Plate> : null}
    </Card>
  )
}
