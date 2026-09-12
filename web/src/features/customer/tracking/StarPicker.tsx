import styled from 'styled-components'
import { useTranslation } from 'react-i18next'
import { MAX_STARS, MIN_STARS } from './ratingRules'

const Fieldset = styled.fieldset`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  margin: 0;
  padding: 0;
  border: none;
`

const Legend = styled.legend`
  padding: 0;
  font-size: ${({ theme }) => theme.typography.fontSizeSm};
  color: ${({ theme }) => theme.colors.textSecondary};
`

const Stars = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`

/** The visible star sits on the label; the real radio is visually hidden but focusable. */
const StarLabel = styled.label<{ $filled: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: ${({ theme }) => theme.touchTargets.min};
  min-height: ${({ theme }) => theme.touchTargets.min};
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  line-height: 1;
  cursor: pointer;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  color: ${({ theme, $filled }) => ($filled ? theme.colors.warning : theme.colors.border)};

  /* Visible focus ring when the hidden radio inside is focused. */
  &:focus-within {
    outline: 3px solid ${({ theme }) => theme.colors.primary};
    outline-offset: 2px;
  }
`

/** Static star glyph for the read-only (already-rated) display. */
const ReadOnlyStar = styled.span<{ $filled: boolean }>`
  font-size: ${({ theme }) => theme.typography.fontSizeXl};
  color: ${({ theme, $filled }) => ($filled ? theme.colors.warning : theme.colors.border)};
`

const HiddenRadio = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
`

interface StarPickerProps {
  /** Currently selected star count (0 = none). */
  value: number
  onChange: (stars: number) => void
  /** Read-only display of a stored rating (no radios, non-interactive). */
  readOnly?: boolean
  disabled?: boolean
}

/**
 * 1..5 star selector built on native radio inputs (web-accessibility.md "native elements first"):
 * a fieldset/legend radiogroup with visually-hidden but focusable radios and a star glyph label.
 * Keyboard nav, arrow-key selection, aria-checked and the axe pass come for free. Each star is a
 * >= 48 px touch target. In readOnly mode it renders plain filled/empty stars (no inputs).
 */
export function StarPicker({ value, onChange, readOnly = false, disabled = false }: StarPickerProps) {
  const { t } = useTranslation()
  const stars = Array.from({ length: MAX_STARS - MIN_STARS + 1 }, (_, i) => MIN_STARS + i)

  if (readOnly) {
    return (
      <Stars aria-label={t('customer.rating.yourRating', { stars: value })}>
        {stars.map((s) => (
          <ReadOnlyStar key={s} aria-hidden="true" $filled={s <= value}>
            ★
          </ReadOnlyStar>
        ))}
      </Stars>
    )
  }

  return (
    <Fieldset>
      <Legend>{t('customer.rating.starsLegend')}</Legend>
      <Stars>
        {stars.map((s) => (
          <StarLabel key={s} $filled={s <= value}>
            <HiddenRadio
              type="radio"
              name="rating-stars"
              value={s}
              checked={value === s}
              disabled={disabled}
              onChange={() => onChange(s)}
              aria-label={t('customer.rating.starLabel', { stars: s })}
            />
            <span aria-hidden="true">★</span>
          </StarLabel>
        ))}
      </Stars>
    </Fieldset>
  )
}
