import styled from 'styled-components'

/** Colour of a filled star (design handoff — literal, sanctioned; stays the same in dark). */
const STAR_FILL = '#E6A700'

/**
 * Props for the shared {@link StarPicker} — a 5-star rating picker. Presentational
 * only: the group legend and per-star accessible names are supplied by the caller.
 * Controlled: the parent owns `value` (0 = unrated).
 */
export interface StarPickerProps {
  /** Current rating, 0–5. */
  value: number
  /** Called with the star number (1–5) when a star is chosen. */
  onChange: (v: number) => void
  /** Accessible name for the rating group. */
  legend: string
  /** Builds the accessible name for the star that sets rating `n` (1–5). */
  starLabel: (n: number) => string
}

const STARS = [1, 2, 3, 4, 5]

const Group = styled.div`
  display: inline-flex;
  gap: 4px;
`

const StarButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--ink-3);
  cursor: pointer;
`

/** A 5-star rating radiogroup; stars up to `value` render filled. */
export function StarPicker({
  value,
  onChange,
  legend,
  starLabel,
}: StarPickerProps): JSX.Element {
  return (
    <Group role="radiogroup" aria-label={legend}>
      {STARS.map((n) => {
        const filled = n <= value
        return (
          <StarButton
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            aria-label={starLabel(n)}
            onClick={() => onChange(n)}
          >
            <svg
              width={28}
              height={28}
              viewBox="0 0 24 24"
              fill={filled ? STAR_FILL : 'none'}
              stroke={filled ? STAR_FILL : 'currentColor'}
              strokeWidth={2}
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.8 6.6 20l1-6.1L3.2 9.5l6.1-.9z" />
            </svg>
          </StarButton>
        )
      })}
    </Group>
  )
}
