import styled from 'styled-components'

/** Props for the shared {@link FleetChip}, a fleet identity pill (dot + name). */
export interface FleetChipProps {
  /** The fleet name shown as the chip label (and the accessible name when clickable). */
  name: string
  /** Optional logo URL rendered inside the accent dot. When set, it replaces the initials. */
  logoUrl?: string | null
  /** Initials fallback for the dot when no `logoUrl` is given. Derived from `name` if omitted. */
  initials?: string
  /** When provided, the chip renders as a `<button>` with `aria-label={name}` and fires on click. */
  onClick?: () => void
}

/** Derives up-to-two uppercase initials from a fleet name (first letter of the first two words). */
function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

const chipCss = `
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  max-width: 100%;
  padding: 0 16px 0 8px;
  border: none;
  background: var(--surface);
  box-shadow: var(--shadow-card);
  border-radius: var(--r-pill);
  color: var(--ink);
  text-align: left;
`

const StaticChip = styled.div`
  ${chipCss}
`

const ButtonChip = styled.button`
  ${chipCss}
  font-family: inherit;
  cursor: pointer;
  transition: transform var(--dur-press);

  &:active {
    transform: scale(0.98);
  }
`

const Dot = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: var(--r-pill);
  overflow: hidden;
  background: var(--accent);
  color: var(--on-accent);
  font-size: var(--fs-caption);
  font-weight: var(--fw-extra);
`

const Logo = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
`

const Name = styled.span`
  min-width: 0;
  font-size: var(--fs-body-lg);
  font-weight: var(--fw-bold);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

/** A 44px fleet identity pill: a 28px accent dot (logo or initials) beside the fleet name. */
export function FleetChip({ name, logoUrl, initials, onClick }: FleetChipProps): JSX.Element {
  const dot = (
    <Dot aria-hidden="true">
      {logoUrl ? <Logo src={logoUrl} alt="" /> : (initials ?? deriveInitials(name))}
    </Dot>
  )

  if (onClick) {
    return (
      <ButtonChip type="button" aria-label={name} onClick={onClick}>
        {dot}
        <Name>{name}</Name>
      </ButtonChip>
    )
  }

  return (
    <StaticChip>
      {dot}
      <Name>{name}</Name>
    </StaticChip>
  )
}
